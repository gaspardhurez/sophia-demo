"""Tests de l'étude d'un cycle (#81, #157) — « Lancer le test » lance la courbe
de l'interro sur les questions complètes du savoir ; l'étude est maîtrisée au
seuil de l'interro, ou validée à la main sans questions."""

import uuid
from datetime import date, timedelta

from fastapi.testclient import TestClient

from sophia.domain.recall import FINISHED, INTERVALS, due_after, is_finished
from tests.helpers import project_payload

TODAY = date.today()


def _skill(client: TestClient, name: str = "Chandelle") -> str:
    d = client.post("/domains", json={"name": "Tennis"}).json()["id"]
    return client.post(f"/domains/{d}/skills", json={"name": name}).json()["id"]


def _plan(client: TestClient, skill_id: str, **body) -> dict:
    resp = client.post(f"/skills/{skill_id}/plans", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _question(client: TestClient, skill_id: str) -> None:
    resp = client.post(
        f"/skills/{skill_id}/note-questions",
        json={"kind": "factual", "prompt": "Quelle prise ?", "answer": "Continentale"},
    )
    assert resp.status_code == 201, resp.text


def _launch(client: TestClient, plan_id: str, **body) -> dict:
    resp = client.post(f"/plans/{plan_id}/recall/launch", json=body)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _validate(client: TestClient, plan_id: str):
    return client.post(f"/plans/{plan_id}/study/validate")


def _set_stage(db, plan_id: str, stage: int) -> None:
    """La passation (#80) fera avancer la courbe ; ici, on la pose."""
    from sophia.infrastructure.models import AcquisitionPlan

    db.get(AcquisitionPlan, uuid.UUID(plan_id)).recall_stage = stage
    db.commit()


# --- La courbe -------------------------------------------------------------------


def test_the_curve_runs_j1_j7_j15_j30_j90_then_ends() -> None:
    assert INTERVALS == (1, 7, 15, 30, 90)
    assert due_after(TODAY, 0) == TODAY + timedelta(days=1)
    assert due_after(TODAY, 4) == TODAY + timedelta(days=90)
    assert FINISHED == 5
    assert (is_finished(None), is_finished(4), is_finished(5)) == (False, False, True)


def test_launching_the_recall_starts_the_curve_tomorrow(client: TestClient) -> None:
    s = _skill(client)
    _question(client, s)
    plan = _plan(client, s, state="active")
    assert plan["recall_launched_at"] is None

    read = _launch(client, plan["id"])

    assert read["question_count"] == 1
    assert read["recall_stage"] == 0
    assert read["recall_next_due_at"] == str(TODAY + timedelta(days=1))
    assert read["recall_launched_at"] is not None
    # Lancée n'est pas maîtrisée : l'étude attend le seuil de son interro.
    assert read["study_mastered"] is False


def test_the_recall_is_not_launched_without_question(client: TestClient) -> None:
    """Pas d'interro sans question : l'étude se valide à la main."""
    s = _skill(client)
    plan = _plan(client, s, state="active")

    resp = client.post(f"/plans/{plan['id']}/recall/launch", json={})

    assert resp.status_code == 422
    read = client.get(f"/skills/{s}/plans").json()[0]
    assert (read["recall_stage"], read["recall_launched_at"]) == (None, None)


def test_the_recall_is_launched_only_once(client: TestClient, db) -> None:
    """Une fois lancée, la courbe ne bouge plus par ce geste : seul
    « Recommencer » la ramène à J+1."""
    s = _skill(client)
    _question(client, s)
    plan = _plan(client, s, state="active")
    _launch(client, plan["id"])
    _set_stage(db, plan["id"], 2)

    resp = client.post(f"/plans/{plan['id']}/recall/launch", json={})

    assert resp.status_code == 422
    assert client.get(f"/skills/{s}/plans").json()[0]["recall_stage"] == 2
    assert client.post(f"/plans/{plan['id']}/study/finish").status_code in (404, 405)


def test_only_the_cycle_in_progress_launches_or_validates(client: TestClient) -> None:
    s = _skill(client)
    planned = _plan(client, s)

    launch = client.post(f"/plans/{planned['id']}/recall/launch", json={})
    assert launch.status_code == 422
    assert _validate(client, planned["id"]).status_code == 422


def test_unstarting_clears_the_curve(client: TestClient) -> None:
    s = _skill(client)
    _question(client, s)
    plan = _plan(client, s, state="active")
    _launch(client, plan["id"])

    read = client.post(f"/plans/{plan['id']}/unstart").json()

    assert (read["recall_stage"], read["recall_next_due_at"]) == (None, None)
    assert read["recall_launched_at"] is None


# --- L'étude maîtrisée (#157) ----------------------------------------------------


def test_the_study_is_mastered_at_the_threshold(client: TestClient, db) -> None:
    """Le seuil, J+15 (3 tests) par défaut ; le changer a un effet immédiat."""
    s = _skill(client)
    _question(client, s)
    plan = _plan(client, s, state="active", isolated=False, situation=False)
    assert plan["recall_target"] == 3
    _launch(client, plan["id"])

    _set_stage(db, plan["id"], 2)
    read = client.get(f"/skills/{s}/plans").json()[0]
    assert (read["study_mastered"], read["is_satisfied"]) == (False, False)

    _set_stage(db, plan["id"], 3)
    read = client.get(f"/skills/{s}/plans").json()[0]
    assert (read["study_mastered"], read["is_satisfied"]) == (True, True)

    raised = client.patch(f"/plans/{plan['id']}", json={"recall_target": 4}).json()
    assert (raised["study_mastered"], raised["is_satisfied"]) == (False, False)

    lowered = client.patch(f"/plans/{plan['id']}", json={"recall_target": 1}).json()
    assert lowered["study_mastered"] is True


def test_a_finished_curve_always_masters_the_study(client: TestClient, db) -> None:
    s = _skill(client)
    _question(client, s)
    plan = _plan(client, s, state="active", recall_target=5)
    _launch(client, plan["id"])
    _set_stage(db, plan["id"], FINISHED)

    assert client.get(f"/skills/{s}/plans").json()[0]["study_mastered"] is True


def test_the_threshold_is_set_at_birth(client: TestClient) -> None:
    s = _skill(client)
    assert _plan(client, s, recall_target=1)["recall_target"] == 1
    bad = client.post(f"/skills/{s}/plans", json={"recall_target": 6})
    assert bad.status_code == 422


def test_a_study_without_question_is_validated_by_hand(client: TestClient) -> None:
    s = _skill(client)
    plan = _plan(client, s, state="active", isolated=False, situation=False)
    assert plan["study_mastered"] is False

    first = _validate(client, plan["id"])
    assert first.status_code == 200, first.text
    read = first.json()
    assert read["study_mastered"] is True
    assert read["study_validated_at"] is not None
    assert read["is_satisfied"] is True
    assert read["recall_stage"] is None

    # Idempotent : la première date reste.
    again = _validate(client, plan["id"]).json()
    assert again["study_validated_at"] == read["study_validated_at"]

    unstarted = client.post(f"/plans/{plan['id']}/unstart").json()
    assert unstarted["study_validated_at"] is None


def test_a_study_with_questions_is_not_validated_by_hand(client: TestClient) -> None:
    s = _skill(client)
    _question(client, s)
    plan = _plan(client, s, state="active")

    assert _validate(client, plan["id"]).status_code == 422


# --- Le premier test sur une séance (#157) ----------------------------------------


def _domain_of(client: TestClient, skill_id: str) -> str:
    return client.get(f"/skills/{skill_id}").json()["domain_id"]


def _session(client: TestClient, domain_id: str, day: date, done: bool = False) -> dict:
    resp = client.post(
        "/activities",
        json={
            "domain_id": domain_id,
            "title": "Séance",
            "start_at": f"{day}T10:00:00",
            "end_at": f"{day}T11:00:00",
            "done": done,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_the_first_test_rides_on_a_chosen_session(client: TestClient) -> None:
    """La séance porte le premier test : la courbe part de son jour, et aucune
    activité Interro séparée ne naît."""
    s = _skill(client)
    _question(client, s)
    plan = _plan(client, s, state="active")
    day = TODAY + timedelta(days=2)
    session = _session(client, _domain_of(client, s), day)

    read = _launch(client, plan["id"], activity_id=session["id"])

    assert read["recall_stage"] == 0
    assert read["recall_next_due_at"] == str(day)
    (carrier,) = _recalls(client, s)
    assert carrier["id"] == session["id"]
    assert carrier["title"] == "Séance"
    assert [(a["kind"], a["plan_id"]) for a in carrier["acts"]] == [
        ("recall", plan["id"])
    ]


def test_the_carrying_session_must_be_eligible(client: TestClient) -> None:
    """De J+1 à J+3, non faite, du domaine du savoir, existante — sinon 422,
    et rien n'est lancé."""
    s = _skill(client)
    _question(client, s)
    plan = _plan(client, s, state="active")
    d = _domain_of(client, s)
    other = client.post("/domains", json={"name": "Piano"}).json()["id"]
    refused = [
        _session(client, d, TODAY)["id"],
        _session(client, d, TODAY + timedelta(days=4))["id"],
        _session(client, d, TODAY + timedelta(days=1), done=True)["id"],
        _session(client, other, TODAY + timedelta(days=1))["id"],
        str(uuid.uuid4()),
    ]

    for activity_id in refused:
        resp = client.post(
            f"/plans/{plan['id']}/recall/launch", json={"activity_id": activity_id}
        )
        assert resp.status_code == 422, activity_id

    read = client.get(f"/skills/{s}/plans").json()[0]
    assert read["recall_stage"] is None
    assert _recalls(client, s) == []
    # J+3 est encore dans la fenêtre.
    last = _session(client, d, TODAY + timedelta(days=3))
    assert _launch(client, plan["id"], activity_id=last["id"])["recall_stage"] == 0


# --- L'interro posée par l'app (#82) ---------------------------------------------


def _recalls(client: TestClient, skill_id: str) -> list[dict]:
    """Les activités qui portent l'interro de ce savoir."""
    return [
        a
        for a in client.get("/activities", params={"skill_id": skill_id}).json()
        if any(x["kind"] == "recall" for x in a["acts"])
    ]


def _ready(client: TestClient, **plan) -> tuple[str, dict]:
    """Un savoir avec une question, et son cycle en cours."""
    s = _skill(client)
    _question(client, s)
    return s, _plan(client, s, state="active", **plan)


def test_launching_places_the_recall_on_the_calendar(
    client: TestClient,
) -> None:
    """Une activité à elle seule, journée entière, au jour du prochain rappel,
    « Interro · savoir », avec les projets du cycle et un acte d'interro."""
    s = _skill(client)
    domain_id = client.get(f"/skills/{s}").json()["domain_id"]
    obj = client.post(
        f"/domains/{domain_id}/projects",
        json=project_payload("Tennis du dimanche", skill_ids=[s]),
    ).json()["id"]
    _question(client, s)
    plan = client.post(f"/skills/{s}/plans/start", json={"project_id": obj}).json()

    _launch(client, plan["id"])

    (interro,) = _recalls(client, s)
    due = TODAY + timedelta(days=1)
    assert interro["title"] == "Interro · Chandelle"
    assert interro["emoji"] == "🧠"
    assert interro["all_day"] is True
    assert interro["start_at"] == f"{due}T00:00:00"
    assert interro["end_at"] == f"{due}T00:00:00"
    assert interro["done"] is False
    assert [(a["kind"], a["plan_id"]) for a in interro["acts"]] == [
        ("recall", plan["id"])
    ]
    assert [o["project_id"] for o in interro["projects"]] == [obj]


def test_no_recall_is_placed_without_question(client: TestClient) -> None:
    s = _skill(client)
    plan = _plan(client, s, state="active")

    client.post(f"/plans/{plan['id']}/recall/launch", json={})

    assert _recalls(client, s) == []


def test_only_one_recall_is_placed_per_cycle(client: TestClient, db) -> None:
    """Une seule interro non faite à la fois : la poser à nouveau rend celle
    qui attend."""
    from sophia.application.acts import place_recall_activity
    from sophia.infrastructure.models import AcquisitionPlan

    s, plan = _ready(client)
    _launch(client, plan["id"])
    (placed,) = _recalls(client, s)

    again = place_recall_activity(db, db.get(AcquisitionPlan, uuid.UUID(plan["id"])))
    db.commit()

    assert str(again.id) == placed["id"]
    assert len(_recalls(client, s)) == 1


def test_planning_a_session_that_carries_the_recall_moves_it(
    client: TestClient,
) -> None:
    """Planifier l'interro (une séance créée avec son acte) la déplace : celle
    que l'app avait posée disparaît, il n'en reste qu'une."""
    s, plan = _ready(client)
    _launch(client, plan["id"])
    (placed,) = _recalls(client, s)
    day = date.today() + timedelta(days=3)
    domain = placed["domain_id"]
    resp = client.post(
        "/activities",
        json={
            "domain_id": domain,
            "title": "Interro du jeudi",
            "start_at": f"{day}T18:00:00",
            "end_at": f"{day}T18:30:00",
            "done": False,
            "acts": [{"skill_id": s, "kind": "recall", "plan_id": plan["id"]}],
        },
    )
    assert resp.status_code == 201, resp.text
    (left,) = _recalls(client, s)
    assert left["id"] == resp.json()["id"]


def test_a_recall_already_passed_does_not_block_the_next(
    client: TestClient, db
) -> None:
    """Faite, l'interro reste au calendrier ; la suivante se pose à côté."""
    from sophia.application.acts import place_recall_activity
    from sophia.infrastructure.models import AcquisitionPlan

    s, plan = _ready(client)
    _launch(client, plan["id"])
    (placed,) = _recalls(client, s)
    client.patch(f"/activities/{placed['id']}", json={"done": True})
    cycle = db.get(AcquisitionPlan, uuid.UUID(plan["id"]))
    cycle.recall_next_due_at = TODAY + timedelta(days=7)

    place_recall_activity(db, cycle)
    db.commit()

    days = sorted(a["start_at"][:10] for a in _recalls(client, s))
    assert days == [str(TODAY + timedelta(days=1)), str(TODAY + timedelta(days=7))]


def test_unstarting_withdraws_even_an_overdue_recall(client: TestClient, db) -> None:
    """Une interro n'est jamais ratée : non passée, elle part avec la courbe,
    même si son jour est derrière nous."""
    from datetime import datetime

    from sophia.infrastructure.models import Activity

    s, plan = _ready(client)
    _launch(client, plan["id"])
    (placed,) = _recalls(client, s)
    overdue = datetime.combine(TODAY - timedelta(days=3), datetime.min.time())
    activity = db.get(Activity, uuid.UUID(placed["id"]))
    activity.start_at = activity.end_at = overdue
    db.commit()

    client.post(f"/plans/{plan['id']}/unstart")

    assert _recalls(client, s) == []


# --- Toutes les questions du savoir ------------------------------------------------


def test_every_cycle_counts_every_complete_question_of_the_skill(
    client: TestClient,
) -> None:
    """Une interro sélectionne des questions, pas des sections : tout cycle
    compte toutes les questions complètes du savoir (03/10/2026)."""
    s = _skill(client)
    _question(client, s)
    _question(client, s)
    client.post(f"/skills/{s}/note-questions", json={"kind": "factual"})

    first, second = _plan(client, s), _plan(client, s)

    assert (first["question_count"], second["question_count"]) == (2, 2)
    assert "section_ids" not in first
    assert "sections_chosen" not in first
