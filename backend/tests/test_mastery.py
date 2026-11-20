"""Tests de la maîtrise par phase (#157, chantier maitrise-par-phase) — les
règles pures, le critère d'une pièce, la satisfaction du cycle qui en découle,
et la carte « Lancer le test » de la vue d'ensemble."""

import uuid
from datetime import date, timedelta

from fastapi.testclient import TestClient

from sophia.domain.mastery import (
    DEFAULT_CRITERION_LEVEL,
    DEFAULT_CRITERION_PASSES,
    DEFAULT_RECALL_TARGET,
    can_carry_first_recall,
    passes_at_level,
    piece_mastered,
    study_mastered,
)
from sophia.infrastructure.models import AcquisitionPlan

TODAY = date.today()


# --- Les règles pures --------------------------------------------------------------


def test_defaults() -> None:
    assert (DEFAULT_RECALL_TARGET, DEFAULT_CRITERION_PASSES) == (3, 3)
    assert DEFAULT_CRITERION_LEVEL == 5


def test_study_mastered_reads_the_threshold_or_the_hand() -> None:
    assert study_mastered(False, None, 3) is False
    assert study_mastered(False, 0, 3) is False
    assert study_mastered(False, 2, 3) is False
    assert study_mastered(False, 3, 3) is True
    assert study_mastered(False, 5, 5) is True  # une courbe terminée
    assert study_mastered(True, None, 3) is True


def test_passes_count_once_per_session_at_level_or_above() -> None:
    passes = [("a", 5), ("a", 5), ("b", 4), ("c", None), ("d", 5)]
    assert passes_at_level(passes, 5) == 2
    assert passes_at_level(passes, 4) == 3
    assert passes_at_level([], 3) == 0


def test_piece_mastered_by_criterion_or_verdict() -> None:
    assert piece_mastered(False, 2, 3) is False
    assert piece_mastered(False, 3, 3) is True
    assert piece_mastered(True, 0, 3) is True


def test_the_first_test_window_is_j1_to_j3() -> None:
    assert [
        can_carry_first_recall(TODAY + timedelta(days=n), TODAY) for n in range(-1, 5)
    ] == [False, False, True, True, True, False]


# --- Par l'API ---------------------------------------------------------------------


def _setup(client: TestClient, **plan) -> tuple[str, str, dict]:
    d = client.post("/domains", json={"name": "Dev"}).json()["id"]
    s = client.post(f"/domains/{d}/skills", json={"name": "Python"}).json()["id"]
    resp = client.post(f"/skills/{s}/plans", json={"state": "active", **plan})
    assert resp.status_code == 201, resp.text
    return d, s, resp.json()


def _item(client: TestClient, skill_id: str, plan_id: str) -> dict:
    resp = client.post(
        f"/skills/{skill_id}/practice", json={"title": "Exos", "plan_id": plan_id}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _pass(
    client: TestClient,
    d: str,
    s: str,
    plan_id: str,
    item_id: str,
    level: int,
    done: bool = True,
    day: date = TODAY,
) -> None:
    """Une passe sur la pièce, notée `level`, dans une séance (faite)."""
    resp = client.post(
        "/activities",
        json={
            "domain_id": d,
            "title": "Séance",
            "start_at": f"{day}T10:00:00",
            "end_at": f"{day}T11:00:00",
            "done": done,
            "acts": [
                {
                    "skill_id": s,
                    "kind": "practice",
                    "plan_id": plan_id,
                    "practice_item_id": item_id,
                }
            ],
        },
    )
    assert resp.status_code == 201, resp.text
    a = resp.json()
    url = f"/activities/{a['id']}/acts/{a['acts'][0]['id']}/feedback"
    assert client.put(url, json={"level": level}).status_code == 200


def _read(client: TestClient, skill_id: str) -> dict:
    return client.get(f"/skills/{skill_id}/plans").json()[0]


def _link(plan: dict, item_id: str) -> dict:
    return next(i for i in plan["items"] if i["item_id"] == item_id)


def test_a_piece_is_mastered_by_three_passes_at_five(client: TestClient) -> None:
    d, s, plan = _setup(client, study=False, situation=False)
    item = _item(client, s, plan["id"])

    link = _link(_read(client, s), item["id"])
    assert (link["criterion_passes"], link["criterion_level"]) == (3, 5)
    assert (link["passes_at_level"], link["mastered"]) == (0, False)

    _pass(client, d, s, plan["id"], item["id"], 5)
    _pass(client, d, s, plan["id"], item["id"], 4)
    _pass(client, d, s, plan["id"], item["id"], 5, done=False)
    _pass(client, d, s, plan["id"], item["id"], 5)
    read = _read(client, s)
    assert (_link(read, item["id"])["passes_at_level"], read["is_satisfied"]) == (
        2,
        False,
    )
    assert read["done_items"] == 0

    # Pas d'affilée : la troisième passe à 5/5 remplit le critère.
    _pass(client, d, s, plan["id"], item["id"], 5)
    read = _read(client, s)
    link = _link(read, item["id"])
    assert (link["passes_at_level"], link["mastered"], link["done"]) == (3, True, False)
    assert (read["done_items"], read["is_satisfied"]) == (1, True)


def test_lowering_the_criterion_masters_the_piece(client: TestClient) -> None:
    d, s, plan = _setup(client, study=False, situation=False)
    item = _item(client, s, plan["id"])
    _pass(client, d, s, plan["id"], item["id"], 4)
    _pass(client, d, s, plan["id"], item["id"], 4)
    url = f"/plans/{plan['id']}/items/{item['id']}"

    read = client.patch(url, json={"criterion_level": 4}).json()
    assert _link(read, item["id"])["mastered"] is False

    read = client.patch(url, json={"criterion_passes": 2}).json()
    link = _link(read, item["id"])
    assert (link["criterion_passes"], link["criterion_level"]) == (2, 4)
    assert (link["passes_at_level"], link["mastered"]) == (2, True)
    assert read["is_satisfied"] is True

    assert client.patch(url, json={"criterion_level": 2}).status_code == 422
    assert client.patch(url, json={"criterion_passes": 0}).status_code == 422


def test_the_verdict_by_hand_masters_the_piece(client: TestClient) -> None:
    _, s, plan = _setup(client, study=False, situation=False)
    item = _item(client, s, plan["id"])

    read = client.patch(
        f"/plans/{plan['id']}/items/{item['id']}", json={"done": True}
    ).json()

    link = _link(read, item["id"])
    assert (link["passes_at_level"], link["mastered"]) == (0, True)
    assert read["is_satisfied"] is True


def test_practice_mastered_but_recall_at_step_one_is_not_satisfied(
    client: TestClient, db
) -> None:
    """Le cas Python : exercices faits, interro au cran 1 — pas « à clore »."""
    d, s, plan = _setup(client, situation=False)
    client.post(
        f"/skills/{s}/note-questions",
        json={"kind": "factual", "prompt": "GIL ?", "answer": "Un verrou"},
    )
    item = _item(client, s, plan["id"])
    client.patch(f"/plans/{plan['id']}/items/{item['id']}", json={"done": True})
    client.post(f"/plans/{plan['id']}/recall/launch", json={})
    db.get(AcquisitionPlan, uuid.UUID(plan["id"])).recall_stage = 1
    db.commit()

    read = _read(client, s)
    assert (read["study_mastered"], read["is_satisfied"]) == (False, False)
    groups = {
        g["group"]: g["items"]
        for g in client.get("/learning/overview").json()["groups"]
    }
    assert "close" not in [i["kind"] for i in groups["advance"]]

    db.get(AcquisitionPlan, uuid.UUID(plan["id"])).recall_stage = 3
    db.commit()
    assert _read(client, s)["is_satisfied"] is True


def test_the_overview_offers_to_launch_the_test_once_studied(
    client: TestClient,
) -> None:
    """« Interro · pas lancée » : étude activée, une séance d'étude faite, des
    questions, pas de courbe."""
    d, s, plan = _setup(client)

    def launchable() -> bool:
        groups = client.get("/learning/overview").json()["groups"]
        advance = next(g["items"] for g in groups if g["group"] == "advance")
        return "start_recall" in [i["kind"] for i in advance]

    client.post(
        f"/skills/{s}/note-questions",
        json={"kind": "factual", "prompt": "GIL ?", "answer": "Un verrou"},
    )
    assert launchable() is False  # pas encore étudié
    client.post(
        "/activities",
        json={
            "domain_id": d,
            "title": "Étude",
            "start_at": f"{TODAY}T10:00:00",
            "end_at": f"{TODAY}T11:00:00",
            "done": True,
            "acts": [{"skill_id": s, "kind": "study", "plan_id": plan["id"]}],
        },
    )
    assert launchable() is True
    client.post(f"/plans/{plan['id']}/recall/launch", json={})
    assert launchable() is False
