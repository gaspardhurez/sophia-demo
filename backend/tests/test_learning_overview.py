"""Tests de la vue d'ensemble de l'apprentissage (#152, #155).

Les séances du jour et des 7 suivants, puis quatre cartes (`domain/learning.py`
pour les règles) : rattraper, avancer, planifier, commencer. Ce qui se
vérifie ici : les règles pures et leurs seuils, puis chaque partie lue par
l'endpoint sur un calendrier posé.
"""

import uuid
from datetime import date, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from sophia.domain import learning as rules
from sophia.infrastructure.models import AcquisitionPlan
from tests.helpers import project_payload

TODAY = date.today()


# --- Les règles pures ---------------------------------------------------------


def test_unplanned_looks_seven_days_ahead() -> None:
    assert rules.unplanned([], TODAY)
    assert not rules.unplanned([TODAY], TODAY)
    assert not rules.unplanned([TODAY + timedelta(days=6)], TODAY)
    assert rules.unplanned([TODAY + timedelta(days=7)], TODAY)


def test_the_phase_to_plan_follows_a_complete_phase() -> None:
    assert rules.phase_to_plan([("study", True), ("isolated", False)]) == (
        "study",
        "isolated",
    )
    assert rules.phase_to_plan([("study", False), ("isolated", False)]) is None
    assert rules.phase_to_plan([("study", True), ("isolated", True)]) is None


# --- L'endpoint ---------------------------------------------------------------


def _domain(client: TestClient) -> str:
    return client.post("/domains", json={"name": "Tennis"}).json()["id"]


def _skill(client: TestClient, d: str, name: str) -> str:
    return client.post(f"/domains/{d}/skills", json={"name": name}).json()["id"]


def _start(client: TestClient, skill: str, **phases) -> dict:
    plan = client.post(f"/skills/{skill}/plans/start", json={}).json()
    if phases:
        plan = client.patch(f"/plans/{plan['id']}", json=phases).json()
    return plan


def _session(
    client: TestClient, d: str, day: date, acts: list[dict], done: bool = False
) -> dict:
    resp = client.post(
        "/activities",
        json={
            "domain_id": d,
            "title": "Séance",
            "start_at": f"{day}T10:00:00",
            "end_at": f"{day}T11:00:00",
            "done": done,
            "acts": acts,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _overview(client: TestClient) -> dict[str, list[dict]]:
    resp = client.get("/learning/overview")
    assert resp.status_code == 200, resp.text
    return {g["group"]: g["items"] for g in resp.json()["groups"]}


def _kinds(items: list[dict]) -> list[tuple[str, str | None]]:
    return [(i["kind"], i["title"]) for i in items]


def test_four_cards_always_in_order(client: TestClient) -> None:
    resp = client.get("/learning/overview").json()
    assert [g["group"] for g in resp["groups"]] == [
        "catch_up",
        "advance",
        "plan",
        "start",
    ]
    assert (resp["today"], resp["upcoming"], resp["skills"]) == ([], [], [])


def test_catch_up_and_today(client: TestClient, db: Session) -> None:
    d = _domain(client)
    skill = _skill(client, d, "Chandelle")
    plan = _start(client, skill)
    study = {"skill_id": skill, "kind": "study", "plan_id": plan["id"]}
    _session(client, d, TODAY - timedelta(days=2), [study])
    _session(client, d, TODAY - timedelta(days=1), [study], done=True)
    _session(client, d, TODAY, [study], done=True)
    # Une séance qui ne porte que l'interro : l'interro due a sa ligne.
    recall = {"skill_id": skill, "kind": "recall", "plan_id": plan["id"]}
    _session(client, d, TODAY - timedelta(days=1), [recall])
    db.get(AcquisitionPlan, uuid.UUID(plan["id"])).recall_next_due_at = (
        TODAY - timedelta(days=3)
    )
    db.commit()

    cards = _overview(client)
    assert [i["kind"] for i in cards["catch_up"]] == ["recall", "missed"]
    assert cards["catch_up"][0]["since"] == str(TODAY - timedelta(days=3))
    assert cards["catch_up"][1]["activity"]["start_at"].startswith(
        str(TODAY - timedelta(days=2))
    )
    # Aujourd'hui garde la séance cochée : elle se décoche.
    (today,) = client.get("/learning/overview").json()["today"]
    assert today["kind"] == "session"
    assert today["activity"]["done"] is True


def test_the_recall_due_today_is_its_session_not_a_delay(
    client: TestClient, db: Session
) -> None:
    d = _domain(client)
    skill = _skill(client, d, "Chandelle")
    plan = _start(client, skill)
    recall = {"skill_id": skill, "kind": "recall", "plan_id": plan["id"]}
    _session(client, d, TODAY, [recall])
    db.get(AcquisitionPlan, uuid.UUID(plan["id"])).recall_next_due_at = TODAY
    db.commit()

    resp = client.get("/learning/overview").json()
    assert {g["group"]: g["items"] for g in resp["groups"]}["catch_up"] == []
    (today,) = resp["today"]
    assert today["activity"]["acts"][0]["kind"] == "recall"
    # La colonne marque toujours l'interro due.
    assert resp["skills"][0]["recall_due"] is True


def test_upcoming_reads_the_seven_next_days(client: TestClient) -> None:
    d = _domain(client)
    skill = _skill(client, d, "Chandelle")
    plan = _start(client, skill)
    study = {"skill_id": skill, "kind": "study", "plan_id": plan["id"]}
    for days in (1, 7, 8):
        _session(client, d, TODAY + timedelta(days=days), [study])

    upcoming = client.get("/learning/overview").json()["upcoming"]
    assert [i["activity"]["start_at"][:10] for i in upcoming] == [
        str(TODAY + timedelta(days=1)),
        str(TODAY + timedelta(days=7)),
    ]


def test_advance_the_next_phase_not_a_piece_with_high_levels(
    client: TestClient,
) -> None:
    d = _domain(client)
    skill = _skill(client, d, "Chandelle")
    plan = _start(client, skill, study=False, situation=True)
    item = client.post(
        f"/skills/{skill}/practice", json={"title": "Panier", "plan_id": plan["id"]}
    ).json()
    on_item = {
        "skill_id": skill,
        "kind": "practice",
        "practice_item_id": item["id"],
        "plan_id": plan["id"],
    }
    for days, level in ((5, 2), (4, 4), (3, 5)):
        a = _session(client, d, TODAY - timedelta(days=days), [on_item], done=True)
        url = f"/activities/{a['id']}/acts/{a['acts'][0]['id']}/feedback"
        assert client.put(url, json={"level": level}).status_code == 200

    # De bons retours ne suggèrent plus rien (#155) : le verdict reste à la main.
    assert _overview(client)["advance"] == []

    # Le verdict posé, la pratique est complète : la mise en situation, vide,
    # est à planifier.
    client.patch(f"/plans/{plan['id']}/items/{item['id']}", json={"done": True})
    (line,) = _overview(client)["advance"]
    assert (line["kind"], line["previous_phase"], line["phase"]) == (
        "next_phase",
        "isolated",
        "situation",
    )


def test_plan(client: TestClient) -> None:
    d = _domain(client)
    skill = _skill(client, d, "Chandelle")
    plan = _start(client, skill)

    cards = _overview(client)
    (line,) = cards["plan"]
    assert (line["kind"], line["phase"], line["since"]) == ("unplanned", "study", None)

    # Une séance posée dans la semaine : plus rien à planifier.
    study = {"skill_id": skill, "kind": "study", "plan_id": plan["id"]}
    _session(client, d, TODAY + timedelta(days=3), [study])
    assert _overview(client)["plan"] == []


def test_a_satisfied_cycle_is_to_close_not_to_plan(client: TestClient) -> None:
    d = _domain(client)
    skill = _skill(client, d, "Chandelle")
    plan = _start(client, skill, isolated=False, situation=False)
    client.post(f"/plans/{plan['id']}/study/validate")

    cards = _overview(client)
    assert [i["kind"] for i in cards["advance"]] == ["close"]
    assert cards["plan"] == []


def test_start_suggests_the_next_skill_of_each_project(client: TestClient) -> None:
    d = _domain(client)
    skills = [_skill(client, d, n) for n in ("Volée", "Chandelle", "Smash")]
    obj = client.post(
        f"/domains/{d}/projects",
        json=project_payload("Tennis du dimanche", skill_ids=skills),
    ).json()["id"]
    client.put(
        f"/projects/{obj}/sequence",
        json={"segments": [{"skill_ids": [skills[1], skills[0], skills[2]]}]},
    )
    client.post(f"/skills/{skills[1]}/plans/start", json={"project_id": obj})

    (line,) = _overview(client)["start"]
    assert (line["kind"], line["skill_name"], line["project_name"]) == (
        "start",
        "Volée",
        "Tennis du dimanche",
    )
