"""Tests de la passation de l'interro (#80 ; refondue le 07/10/2026, chantier
interro-reapprentissage) — commencer ou reprendre, passer les questions ; une
question ratée retourne en fin de file après un délai que l'ouverture des
notes relance ; la passation se termine quand chacune a été sue une fois, la
courbe avance d'un rang depuis le jour réel ; l'interro gardée (ou non) en
rétention à la clôture."""

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from sophia.domain.recall import is_due, list_known, next_stage
from sophia.infrastructure.models import AcquisitionPlan

TODAY = date.today()

#: La session de la base de test, pour `_make_due` (la même que l'API).
_DB = None


@pytest.fixture(autouse=True)
def _share_db(db):
    global _DB
    _DB = db
    yield
    _DB = None


def _make_due(plan_id: str, day: date = TODAY) -> None:
    """Amener l'interro à son jour dû (#138 : plus de passation en avance) —
    la date de rappel ramenée à `day` si elle est plus tard."""
    plan = _DB.get(AcquisitionPlan, uuid.UUID(plan_id))
    if plan.recall_next_due_at is not None and plan.recall_next_due_at > day:
        plan.recall_next_due_at = day
        _DB.commit()


def _skill(client: TestClient) -> str:
    d = client.post("/domains", json={"name": "Tennis"}).json()["id"]
    return client.post(f"/domains/{d}/skills", json={"name": "Chandelle"}).json()["id"]


def _question(client: TestClient, skill_id: str, prompt: str = "Prise ?") -> str:
    resp = client.post(
        f"/skills/{skill_id}/note-questions",
        json={"kind": "factual", "prompt": prompt, "answer": "Continentale"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _h(level: int, text: str) -> dict:
    return {
        "type": "heading",
        "attrs": {"level": level},
        "content": [{"type": "text", "text": text}],
    }


def _node(question_id: str) -> dict:
    return {"type": "question", "attrs": {"id": question_id}}


def _save_doc(client: TestClient, skill_id: str, *nodes: dict) -> None:
    resp = client.put(
        f"/skills/{skill_id}/notes",
        json={"doc": {"type": "doc", "content": list(nodes)}},
    )
    assert resp.status_code == 200, resp.text


def _running(client: TestClient, questions: int = 4) -> tuple[str, dict]:
    """Un cycle en cours, étude terminée, courbe en marche sur `questions`
    questions réparties sous deux titres."""
    s = _skill(client)
    ids = [_question(client, s, f"Q{i}") for i in range(questions)]
    _save_doc(
        client,
        s,
        _h(1, "Le principe"),
        *(_node(q) for q in ids[0::2]),
        _h(1, "Chandelle ou volée ?"),
        *(_node(q) for q in ids[1::2]),
    )
    plan = client.post(f"/skills/{s}/plans", json={"state": "active"}).json()
    resp = client.post(f"/plans/{plan['id']}/recall/launch", json={})
    assert resp.status_code == 200, resp.text
    return s, resp.json()


def _start(client: TestClient, plan_id: str) -> dict:
    """Passer l'interro le jour dû (nouvelle passation, ou reprise)."""
    _make_due(plan_id)
    resp = client.post(f"/plans/{plan_id}/recall")
    assert resp.status_code == 200, resp.text
    return resp.json()


def _put(client: TestClient, session_id: str, row_id: str, **body) -> dict:
    resp = client.put(f"/recall-sessions/{session_id}/answers/{row_id}", json=body)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _judge(client: TestClient, session: dict, *known: bool) -> dict:
    """Un passage par question, dans l'ordre de la passation."""
    read = session
    for row, k in zip(session["answers"], known, strict=True):
        read = _put(client, session["id"], row["id"], answer="…", known=k)
    return read


def _know_all(client: TestClient, session: dict) -> dict:
    """Passer outre le délai et savoir tout ce qui reste : la passation se
    termine."""
    read = client.get(f"/recall-sessions/{session['id']}").json()
    for row in read["answers"]:
        if not row["known"]:
            read = _put(client, session["id"], row["id"], known=True)
    assert read["finished_at"] is not None
    return read


def _plan_row(db, plan_id: str) -> AcquisitionPlan:
    plan = db.get(AcquisitionPlan, uuid.UUID(plan_id))
    db.refresh(plan)
    return plan


def _plan(client: TestClient, skill_id: str) -> dict:
    return client.get(f"/skills/{skill_id}/plans").json()[-1]


# --- La règle pure -------------------------------------------------------------


@pytest.mark.parametrize(
    ("given", "expected"),
    [(["a", "b"], True), (["b", "a", "z"], True), (["a"], False), ([], False)],
)
def test_a_list_is_known_when_every_element_is_given(given, expected) -> None:
    assert list_known(["a", "b"], given) is expected


def test_the_curve_moves_one_step_once_finished() -> None:
    assert next_stage(0) == 1
    assert next_stage(3) == 4
    assert next_stage(4) == 5  # J+90 réussi : courbe terminée


# --- Commencer, reprendre --------------------------------------------------------


def test_a_session_serves_the_questions_in_the_order_of_the_notes(
    client: TestClient,
) -> None:
    _, plan = _running(client)

    session = _start(client, plan["id"])

    assert session["total"] == 4
    assert [a["prompt"] for a in session["answers"]] == ["Q0", "Q2", "Q1", "Q3"]
    assert [a["section_title"] for a in session["answers"]] == [
        "Le principe",
        "Le principe",
        "Chandelle ou volée ?",
        "Chandelle ou volée ?",
    ]
    assert session["answers"][0]["expected_answer"] == "Continentale"
    assert [a["queue_rank"] for a in session["answers"]] == [0, 1, 2, 3]
    assert {a["form"] for a in session["answers"]} == {"free"}
    assert all(a["available_at"] is None for a in session["answers"])
    assert "section_id" not in session["answers"][0]
    assert session["verdict"] is None
    assert _plan(client, plan["skill_id"])["recall_session_id"] == session["id"]


def test_a_session_follows_the_document_and_copies_the_path_of_headings(
    client: TestClient,
) -> None:
    """L'ordre est celui du document (première occurrence, à toute
    profondeur) ; chaque question copie le chemin des titres au-dessus
    d'elle. Une question sans nœud vient à la fin, sans titre ; une question
    incomplète n'entre pas ; un nœud inconnu est sans effet."""
    s = _skill(client)
    qa, qb, qc, qd = (_question(client, s, p) for p in ("A", "B", "C", "D"))
    client.post(f"/skills/{s}/note-questions", json={"kind": "factual"})
    _save_doc(
        client,
        s,
        {"type": "paragraph", "content": [{"type": "text", "text": "Intro"}]},
        _node(qc),
        _h(1, "Le geste"),
        _h(2, "Préparation"),
        _node(qb),
        _h(3, "Détail"),
        _h(2, "Frappe"),
        {
            "type": "columns",
            "content": [{"type": "column", "content": [_node(qa)]}],
        },
        _node(str(uuid.uuid4())),
        _node(qc),
    )
    plan = client.post(f"/skills/{s}/plans", json={"state": "active"}).json()
    client.post(f"/plans/{plan['id']}/recall/launch", json={})

    session = _start(client, plan["id"])

    assert [(a["prompt"], a["section_title"]) for a in session["answers"]] == [
        ("C", ""),
        ("B", "Le geste › Préparation"),
        ("A", "Le geste › Frappe"),
        ("D", ""),
    ]
    assert [a["question_id"] for a in session["answers"]] == [qc, qb, qa, qd]
    assert session["total"] == 4


def test_an_unfinished_session_resumes_with_its_answers(client: TestClient) -> None:
    _, plan = _running(client)
    session = _start(client, plan["id"])
    row = session["answers"][0]
    client.put(
        f"/recall-sessions/{session['id']}/answers/{row['id']}",
        json={"answer": "  Quand le lob est haut  ", "known": None},
    )

    again = _start(client, plan["id"])

    assert again["id"] == session["id"]
    [attempt] = again["answers"][0]["attempts"]
    assert (attempt["number"], attempt["answer"]) == (1, "Quand le lob est haut")
    assert attempt["known"] is None
    assert again["answers"][0]["known"] is False

    # Le verdict clôt le même passage, il n'en ouvre pas un second.
    judged = _put(client, session["id"], row["id"], answer="Haut", known=True)
    [attempt] = judged["answers"][0]["attempts"]
    assert (attempt["answer"], attempt["known"]) == ("Haut", True)


def test_no_session_without_a_running_curve(client: TestClient) -> None:
    s = _skill(client)
    _question(client, s)
    plan = client.post(f"/skills/{s}/plans", json={"state": "active"}).json()

    assert client.post(f"/plans/{plan['id']}/recall").status_code == 422


# --- Plus de passation en avance (#138) ----------------------------------------


@pytest.mark.parametrize(
    ("due", "expected"),
    [
        (None, False),
        (TODAY + timedelta(days=1), False),
        (TODAY, True),
        (TODAY - timedelta(days=3), True),
    ],
)
def test_the_recall_is_due_from_its_day_on(due, expected) -> None:
    assert is_due(due, TODAY) is expected


def test_no_new_session_before_the_due_day(client: TestClient, db) -> None:
    _, plan = _running(client)
    assert plan["recall_next_due_at"] == (TODAY + timedelta(days=1)).isoformat()

    resp = client.post(f"/plans/{plan['id']}/recall")

    assert resp.status_code == 422
    assert "pas encore due" in resp.json()["detail"]
    assert _plan_row(db, plan["id"]).recall_sessions == []


@pytest.mark.parametrize("late", [0, 4])
def test_a_new_session_opens_on_the_due_day_and_when_late(
    client: TestClient, late: int
) -> None:
    _, plan = _running(client)
    _make_due(plan["id"], TODAY - timedelta(days=late))

    resp = client.post(f"/plans/{plan['id']}/recall")

    assert resp.status_code == 200, resp.text
    assert resp.json()["finished_at"] is None


def test_an_open_session_always_resumes_even_before_the_due_day(
    client: TestClient, db
) -> None:
    """Une passation ouverte (avant #138, ou dont la date a bougé depuis) se
    reprend toujours."""
    _, plan = _running(client)
    session = _start(client, plan["id"])
    _plan_row(db, plan["id"]).recall_next_due_at = TODAY + timedelta(days=7)
    db.commit()

    resp = client.post(f"/plans/{plan['id']}/recall")

    assert resp.status_code == 200, resp.text
    assert resp.json()["id"] == session["id"]


def test_launching_the_recall_once_questions_are_written(
    client: TestClient,
) -> None:
    """« Lancer le test » passe par `recall/launch`, pas par la passation : sans
    question, il est refusé ; une fois une question écrite, il lance la
    courbe, et la première passation s'ouvre au jour dû, demain."""
    s = _skill(client)
    plan = client.post(f"/skills/{s}/plans", json={"state": "active"}).json()
    refused = client.post(f"/plans/{plan['id']}/recall/launch", json={})
    assert refused.status_code == 422
    _question(client, s)

    resp = client.post(f"/plans/{plan['id']}/recall/launch", json={})

    assert resp.status_code == 200, resp.text
    started = resp.json()
    assert started["recall_stage"] == 0
    assert started["recall_next_due_at"] == (TODAY + timedelta(days=1)).isoformat()
    assert client.post(f"/plans/{plan['id']}/recall").status_code == 422
    assert _start(client, plan["id"])["total"] == 1


def test_no_session_without_a_question(client: TestClient, db) -> None:
    """La courbe en marche mais plus aucune question (supprimées après coup)."""
    s, plan = _running(client, questions=1)
    notes = client.get(f"/skills/{s}/notes").json()
    question = notes["questions"][0]["id"]
    client.delete(f"/note-questions/{question}")
    _make_due(plan["id"])

    resp = client.post(f"/plans/{plan['id']}/recall")

    assert resp.status_code == 422
    assert "aucune question" in resp.json()["detail"]


def test_a_finished_session_keeps_its_copy(client: TestClient) -> None:
    """La question supprimée après la passation : l'historique garde son
    texte."""
    s, plan = _running(client, questions=1)
    session = _start(client, plan["id"])
    question = session["answers"][0]["question_id"]
    _judge(client, session, True)

    client.delete(f"/note-questions/{question}")

    read = client.get(f"/recall-sessions/{session['id']}").json()
    assert read["answers"][0]["question_id"] is None
    assert read["answers"][0]["prompt"] == "Q0"


# --- Raté : correction, puis retour dans la file ---------------------------------


def test_a_missed_question_goes_to_the_end_of_the_queue_and_waits(
    client: TestClient,
) -> None:
    _, plan = _running(client, questions=3)
    session = _start(client, plan["id"])
    first = session["answers"][0]["id"]
    before = datetime.now(UTC)

    read = _put(client, session["id"], first, answer="Je ne sais plus", known=False)

    row = read["answers"][0]
    assert (row["known"], row["failures"], row["queue_rank"]) == (False, 1, 3)
    waits = datetime.fromisoformat(row["available_at"]) - before
    assert timedelta(minutes=9) < waits <= timedelta(minutes=10, seconds=5)
    assert read["finished_at"] is None

    # Repassée (en passant outre le délai) : un second passage, rang 4.
    again = _put(client, session["id"], first, known=False)
    row = again["answers"][0]
    assert [a["number"] for a in row["attempts"]] == [1, 2]
    assert (row["failures"], row["queue_rank"]) == (2, 4)


def test_a_known_question_is_not_asked_again(client: TestClient) -> None:
    _, plan = _running(client, questions=2)
    session = _start(client, plan["id"])
    row = session["answers"][0]["id"]
    _put(client, session["id"], row, known=True)

    resp = client.put(
        f"/recall-sessions/{session['id']}/answers/{row}", json={"known": False}
    )

    assert resp.status_code == 422
    assert "déjà sue" in resp.json()["detail"]


def test_a_list_is_judged_element_by_element(client: TestClient) -> None:
    s = _skill(client)
    q = client.post(
        f"/skills/{s}/note-questions",
        json={
            "kind": "factual",
            "form": "list",
            "prompt": "Comment est le corps ?",
            "points": [{"text": "Fléchi"}, {"text": "Sur l'avant des pieds"}],
        },
    ).json()
    flexed, toes = (p["id"] for p in q["points"])
    plan = client.post(f"/skills/{s}/plans", json={"state": "active"}).json()
    client.post(f"/plans/{plan['id']}/recall/launch", json={})
    session = _start(client, plan["id"])
    row = session["answers"][0]
    assert row["form"] == "list"
    assert [p["id"] for p in row["points"]] == [flexed, toes]

    # `known` est ignoré : c'est la liste qui juge.
    missed = _put(client, session["id"], row["id"], known=True, known_points=[toes])
    assert missed["answers"][0]["known"] is False
    assert missed["answers"][0]["attempts"][0]["known_points"] == [toes]

    done = _put(client, session["id"], row["id"], known_points=[flexed, toes])
    assert done["finished_at"] is not None
    assert done["known_count"] == 0  # pas sue au premier essai


def test_opening_the_notes_restarts_the_delay_of_what_remains(
    client: TestClient,
) -> None:
    """Toutes les questions qui restent à passer, tentées ou non ; pas celles
    déjà sues, ni les passations terminées."""
    s, plan = _running(client, questions=3)
    session = _start(client, plan["id"])
    known, missed, untried = (a["id"] for a in session["answers"])
    _put(client, session["id"], known, known=True)
    _put(client, session["id"], missed, known=False)

    assert client.post(f"/skills/{s}/notes/opened").status_code == 204

    read = client.get(f"/recall-sessions/{session['id']}").json()
    by_id = {a["id"]: a for a in read["answers"]}
    assert by_id[known]["available_at"] is None
    assert by_id[untried]["available_at"] is not None
    assert by_id[missed]["available_at"] == by_id[untried]["available_at"]
    assert client.post(f"/skills/{uuid.uuid4()}/notes/opened").status_code == 404


# --- La fin : chaque question sue une fois -------------------------------------


def test_the_session_ends_when_every_question_has_been_known(
    client: TestClient,
) -> None:
    s, plan = _running(client)
    session = _start(client, plan["id"])

    read = _judge(client, session, True, False, True, False)
    assert read["finished_at"] is None
    assert _plan(client, s)["recall_stage"] == 0

    done = _know_all(client, session)

    # Le score au premier essai, pour information ; plus de verdict.
    assert (done["verdict"], done["known_count"], done["total"]) == (None, 2, 4)
    assert (done["stage_before"], done["stage_after"]) == (0, 1)
    assert done["day"] == str(TODAY)
    # Passée en avance (dûe demain) : l'intervalle compte depuis aujourd'hui.
    assert done["next_due_on"] == str(TODAY + timedelta(days=7))
    read = _plan(client, s)
    assert read["recall_stage"] == 1
    assert read["recall_next_due_at"] == str(TODAY + timedelta(days=7))
    assert read["recall_session_id"] is None


def test_failures_never_send_the_curve_back(client: TestClient, db) -> None:
    from sophia.infrastructure.models import AcquisitionPlan

    s, plan = _running(client, questions=2)
    db.get(AcquisitionPlan, uuid.UUID(plan["id"])).recall_stage = 3
    db.commit()
    session = _start(client, plan["id"])
    _judge(client, session, False, False)

    done = _know_all(client, session)

    assert (done["known_count"], done["stage_before"], done["stage_after"]) == (
        0,
        3,
        4,
    )
    assert _plan(client, s)["recall_next_due_at"] == str(TODAY + timedelta(days=90))


def test_a_finished_session_no_longer_moves(client: TestClient) -> None:
    _, plan = _running(client, questions=1)
    session = _start(client, plan["id"])
    _judge(client, session, True)

    row = session["answers"][0]
    resp = client.put(
        f"/recall-sessions/{session['id']}/answers/{row['id']}",
        json={"known": False},
    )
    assert resp.status_code == 422
    # La suivante est une nouvelle passation.
    assert _start(client, plan["id"])["id"] != session["id"]


def test_the_history_lists_finished_sessions_newest_first(client: TestClient) -> None:
    _, plan = _running(client, questions=1)
    first = _start(client, plan["id"])
    _judge(client, first, True)
    second = _start(client, plan["id"])
    _judge(client, second, False)
    _know_all(client, second)
    _start(client, plan["id"])  # en cours : pas dans l'historique

    history = client.get(f"/plans/{plan['id']}/recall-sessions").json()

    assert [h["id"] for h in history] == [second["id"], first["id"]]
    assert [h["known_count"] for h in history] == [0, 1]


def test_the_passes_of_the_recall_put_the_open_session_first(
    client: TestClient,
) -> None:
    """Les passes de l'interro dans la fiche (#137, #138) : « En cours · 1 sur
    3 sues » en tête, puis « 3 sur 3 · 2 au premier essai »."""
    _, plan = _running(client, questions=3)
    done = _start(client, plan["id"])
    _judge(client, done, True, False, True)
    _know_all(client, done)
    pending = _start(client, plan["id"])
    _judge(client, pending, True, False, False)

    passes = client.get(
        f"/plans/{plan['id']}/recall-sessions", params={"include_open": True}
    ).json()

    assert [p["id"] for p in passes] == [pending["id"], done["id"]]
    current, finished = passes
    assert current["finished_at"] is None
    assert (current["known_now"], current["total"]) == (1, 3)
    assert finished["finished_at"] is not None
    assert (finished["known_now"], finished["known_count"], finished["total"]) == (
        3,
        2,
        3,
    )
    # Sans le paramètre, l'historique reste celui des passations terminées.
    history = client.get(f"/plans/{plan['id']}/recall-sessions").json()
    assert [h["id"] for h in history] == [done["id"]]


def test_recall_launched_at_dates_the_launch(client: TestClient) -> None:
    _, plan = _running(client, questions=1)
    assert plan["recall_launched_at"] is not None
    assert plan["study_validated_at"] is None


# --- La clôture ------------------------------------------------------------------


def test_closing_without_keeping_the_recall_stops_the_curve(
    client: TestClient,
) -> None:
    s, plan = _running(client, questions=1)

    resp = client.post(f"/plans/{plan['id']}/complete", json={})

    assert resp.status_code == 200
    assert resp.json()["recall_next_due_at"] is None
    assert resp.json()["recall_in_retention"] is False
    assert client.post(f"/plans/{plan['id']}/recall").status_code == 422


def test_closing_and_keeping_the_recall_keeps_the_curve(client: TestClient) -> None:
    s, plan = _running(client, questions=1)

    read = client.post(
        f"/plans/{plan['id']}/complete", json={"recall_in_retention": True}
    ).json()

    assert read["state"] == "completed"
    assert read["recall_in_retention"] is True
    assert read["recall_next_due_at"] == str(TODAY + timedelta(days=1))
    session = _start(client, plan["id"])
    assert _judge(client, session, True)["stage_after"] == 1


def test_abandoning_stops_the_curve(client: TestClient) -> None:
    _, plan = _running(client, questions=1)

    read = client.post(f"/plans/{plan['id']}/abandon").json()

    assert read["recall_next_due_at"] is None


def test_unstarting_drops_the_unfinished_session(client: TestClient) -> None:
    s, plan = _running(client, questions=1)
    done = _start(client, plan["id"])
    _judge(client, done, True)
    pending = _start(client, plan["id"])

    client.post(f"/plans/{plan['id']}/unstart")

    assert client.get(f"/recall-sessions/{pending['id']}").status_code == 404
    assert client.get(f"/recall-sessions/{done['id']}").status_code == 200
    assert _plan(client, s)["recall_session_id"] is None


# --- Au calendrier (#80 + #82) ---------------------------------------------------


def _recall_activities(db, plan_id: str):
    """Les activités Interro du cycle, par date."""
    from sophia.infrastructure.models import Activity, ActivityAct

    rows = (
        db.query(Activity)
        .join(ActivityAct)
        .filter(ActivityAct.plan_id == uuid.UUID(plan_id), ActivityAct.kind == "recall")
        .order_by(Activity.start_at)
        .all()
    )
    db.expire_all()
    return rows


def test_finishing_takes_the_posed_recall_then_poses_the_next(
    client: TestClient, db
) -> None:
    """L'interro posée (demain) est passée aujourd'hui : elle se coche et se
    déplace au jour de la passation ; la suivante se pose à son rappel."""
    _, plan = _running(client, questions=1)
    (posed,) = _recall_activities(db, plan["id"])
    assert posed.start_at.date() == TODAY + timedelta(days=1)
    assert not posed.done

    session = _start(client, plan["id"])
    _judge(client, session, True)

    taken, following = _recall_activities(db, plan["id"])
    assert (taken.id, taken.done, taken.start_at.date()) == (posed.id, True, TODAY)
    assert not following.done
    assert following.start_at.date() == TODAY + timedelta(days=7)


def test_without_a_posed_recall_the_passation_creates_one_done(
    client: TestClient, db
) -> None:
    from sophia.infrastructure.models import Activity

    _, plan = _running(client, questions=1)
    for activity in _recall_activities(db, plan["id"]):
        db.delete(db.get(Activity, activity.id))
    db.commit()

    session = _start(client, plan["id"])
    _judge(client, session, False)
    _know_all(client, session)

    taken, following = _recall_activities(db, plan["id"])
    assert (taken.done, taken.start_at.date()) == (True, TODAY)
    assert following.start_at.date() == TODAY + timedelta(days=7)


def test_closing_without_keeping_the_recall_withdraws_the_posed_one(
    client: TestClient, db
) -> None:
    _, plan = _running(client, questions=1)

    client.post(f"/plans/{plan['id']}/complete", json={})

    assert _recall_activities(db, plan["id"]) == []


def test_adding_the_recall_to_a_session_moves_it_there(client: TestClient, db) -> None:
    """Une seule interro non faite par cycle : ajoutée à une séance, l'interro
    posée par l'app s'y déplace (son activité, qui n'existait que pour elle,
    part)."""
    skill, plan = _running(client, questions=1)
    (posed,) = _recall_activities(db, plan["id"])
    domain_id = client.get(f"/skills/{skill}").json()["domain_id"]
    session = client.post(
        "/activities",
        json={
            "domain_id": domain_id,
            "title": "Leçon",
            "all_day": True,
            "start_at": f"{TODAY}T00:00:00",
            "end_at": f"{TODAY}T00:00:00",
        },
    ).json()

    resp = client.post(
        f"/activities/{session['id']}/acts",
        json={"skill_id": skill, "plan_id": plan["id"], "kind": "recall"},
    )

    assert resp.status_code in (200, 201), resp.text
    (moved,) = _recall_activities(db, plan["id"])
    assert str(moved.id) == session["id"]
    assert client.get(f"/activities/{posed.id}").status_code == 404


def _session_with_recall(client: TestClient, skill: str, plan_id: str, *acts) -> dict:
    """Une séance à heure ce soir (18 h–19 h) qui porte l'interro du cycle,
    plus `acts` : l'interro posée par l'app s'y déplace."""
    domain_id = client.get(f"/skills/{skill}").json()["domain_id"]
    resp = client.post(
        "/activities",
        json={
            "domain_id": domain_id,
            "title": "Cuisine",
            "all_day": False,
            "start_at": f"{TODAY}T18:00:00",
            "end_at": f"{TODAY}T19:00:00",
        },
    )
    assert resp.status_code == 201, resp.text
    session = resp.json()
    for act in ({"skill_id": skill, "plan_id": plan_id, "kind": "recall"}, *acts):
        resp = client.post(f"/activities/{session['id']}/acts", json=act)
        assert resp.status_code in (200, 201), resp.text
    return session


def test_a_mixed_session_is_left_alone_when_its_recall_is_taken(
    client: TestClient,
) -> None:
    """La séance porte l'interro et un autre acte : la passation marque
    l'acte passé, sans cocher ni déplacer la séance (20/10/2026) ; la suivante
    se pose quand même, et l'interro passée n'est plus en attente."""
    skill, plan = _running(client, questions=1)
    practice = {
        "skill_id": skill,
        "plan_id": plan["id"],
        "kind": "practice",
        "nature": "situation",
    }
    session = _session_with_recall(client, skill, plan["id"], practice)

    _judge(client, _start(client, plan["id"]), True)

    read = client.get(f"/activities/{session['id']}").json()
    assert (read["done"], read["all_day"]) == (False, False)
    assert read["start_at"].startswith(f"{TODAY}T18:00")
    (recall,) = [a for a in read["acts"] if a["kind"] == "recall"]
    assert recall["passed_on"] == str(TODAY)
    following = client.get(
        "/activities", params={"skill_id": skill, "start": f"{TODAY}T19:00:00"}
    ).json()
    assert [a["start_at"][:10] for a in following] == [str(TODAY + timedelta(days=7))]
    pending = client.get("/activities", params={"recall_pending": True}).json()
    assert session["id"] not in [a["id"] for a in pending]


def test_an_interro_alone_is_checked_and_keeps_its_slot_the_same_day(
    client: TestClient,
) -> None:
    skill, plan = _running(client, questions=1)
    session = _session_with_recall(client, skill, plan["id"])

    _judge(client, _start(client, plan["id"]), True)

    read = client.get(f"/activities/{session['id']}").json()
    assert (read["done"], read["all_day"]) == (True, False)
    assert read["start_at"].startswith(f"{TODAY}T18:00")
    assert read["acts"][0]["passed_on"] == str(TODAY)


def test_the_pending_recalls_list_only_the_recalls_still_to_take(
    client: TestClient, db
) -> None:
    """`recall_pending` : les activités non faites qui portent une interro —
    bornée à aujourd'hui, ce sont les interros en retard de la to-do (#84)."""
    from sophia.infrastructure.models import Activity

    _, plan = _running(client, questions=1)
    (posed,) = _recall_activities(db, plan["id"])
    # Une séance ordinaire, non faite, la veille : elle n'est pas une interro.
    resp = client.post(
        "/activities",
        json={
            "domain_id": str(posed.domain_id),
            "title": "Tennis",
            "all_day": True,
            "start_at": f"{TODAY - timedelta(days=1)}T00:00:00",
            "end_at": f"{TODAY - timedelta(days=1)}T00:00:00",
        },
    )
    assert resp.status_code == 201, resp.text
    today = f"{TODAY}T00:00:00"

    def pending(**query) -> list[str]:
        resp = client.get("/activities", params={"recall_pending": True, **query})
        assert resp.status_code == 200, resp.text
        return [a["id"] for a in resp.json()]

    assert pending() == [str(posed.id)]
    assert pending(end=today) == []  # posée demain : pas en retard

    row = db.get(Activity, posed.id)
    row.start_at = row.end_at = row.start_at - timedelta(days=4)
    db.commit()
    assert pending(end=today) == [str(posed.id)]

    client.patch(f"/activities/{posed.id}", json={"done": True})
    assert pending(end=today) == []


# --- Une seule courbe, terminée après J+90 (#102) ------------------------------


def test_j90_known_ends_the_curve(client: TestClient, db) -> None:
    from sophia.infrastructure.models import AcquisitionPlan

    s, plan = _running(client, questions=1)
    db.get(AcquisitionPlan, uuid.UUID(plan["id"])).recall_stage = 4
    db.commit()
    session = _start(client, plan["id"])

    done = _judge(client, session, True)

    assert (done["stage_before"], done["stage_after"]) == (4, 5)
    assert done["next_due_on"] is None
    read = _plan(client, s)
    assert read["recall_finished"] is True
    assert read["recall_next_due_at"] is None
    assert client.post(f"/plans/{plan['id']}/recall").status_code == 422
    # Plus d'interro posée au calendrier.
    assert not [
        a
        for a in _recall_activities(db, plan["id"])
        if not a.done and a.start_at.date() > TODAY
    ]


# --- Recommencer (#102) ----------------------------------------------------------


def test_restarting_goes_back_to_j1_and_abandons_the_open_session(
    client: TestClient, db
) -> None:
    from sophia.infrastructure.models import AcquisitionPlan

    s, plan = _running(client, questions=2)
    db.get(AcquisitionPlan, uuid.UUID(plan["id"])).recall_stage = 3
    db.commit()
    open_session = _start(client, plan["id"])
    _put(client, open_session["id"], open_session["answers"][0]["id"], known=True)

    resp = client.post(f"/plans/{plan['id']}/recall/restart")

    assert resp.status_code == 200, resp.text
    read = resp.json()
    assert (read["recall_stage"], read["recall_next_due_at"]) == (
        0,
        str(TODAY + timedelta(days=1)),
    )
    assert len(read["recall_restarted_at"]) == 1
    assert read["recall_session_id"] is None
    # La passation abandonnée ne bouge plus et n'entre pas dans l'historique.
    row = open_session["answers"][1]["id"]
    assert (
        client.put(
            f"/recall-sessions/{open_session['id']}/answers/{row}",
            json={"known": True},
        ).status_code
        == 422
    )
    assert client.get(f"/plans/{plan['id']}/recall-sessions").json() == []
    assert _start(client, plan["id"])["id"] != open_session["id"]
    # Une seule interro posée, demain.
    pending = [a for a in _recall_activities(db, plan["id"]) if not a.done]
    assert [a.start_at.date() for a in pending] == [TODAY + timedelta(days=1)]


def test_a_finished_curve_can_restart(client: TestClient, db) -> None:
    from sophia.infrastructure.models import AcquisitionPlan

    s, plan = _running(client, questions=1)
    cycle = db.get(AcquisitionPlan, uuid.UUID(plan["id"]))
    cycle.recall_stage, cycle.recall_next_due_at = 5, None
    db.commit()

    read = client.post(f"/plans/{plan['id']}/recall/restart").json()

    assert (read["recall_stage"], read["recall_finished"]) == (0, False)


def test_a_curve_never_started_does_not_restart(client: TestClient) -> None:
    s = _skill(client)
    plan = client.post(f"/skills/{s}/plans", json={"state": "active"}).json()

    assert client.post(f"/plans/{plan['id']}/recall/restart").status_code == 422


# --- L'interro suit les notes (#102) ----------------------------------------------


def test_an_open_session_follows_the_notes(client: TestClient) -> None:
    """Ajoutée : en fin de file. Supprimée : retirée, sauf si déjà sue.
    Modifiée : reposée telle quelle, chaque passage garde son texte."""
    s, plan = _running(client, questions=3)
    session = _start(client, plan["id"])
    known, missed, untouched = session["answers"]
    _put(client, session["id"], known["id"], known=True)
    _put(client, session["id"], missed["id"], answer="?", known=False)

    added = _question(client, s, "Nouvelle ?")
    client.patch(
        f"/note-questions/{missed['question_id']}", json={"prompt": "Reformulée ?"}
    )
    client.delete(f"/note-questions/{untouched['question_id']}")
    client.delete(f"/note-questions/{known['question_id']}")

    read = client.get(f"/recall-sessions/{session['id']}").json()
    by_prompt = {a["prompt"]: a for a in read["answers"]}
    assert set(by_prompt) == {"Q0", "Reformulée ?", "Nouvelle ?"}
    assert by_prompt["Q0"]["known"] is True  # sue, elle reste
    assert by_prompt["Nouvelle ?"]["question_id"] == added
    assert (
        by_prompt["Nouvelle ?"]["queue_rank"] > by_prompt["Reformulée ?"]["queue_rank"]
    )
    assert by_prompt["Reformulée ?"]["attempts"][0]["prompt"] == "Q2"
    assert read["total"] == 3


def test_removing_the_last_question_to_know_ends_the_session(
    client: TestClient,
) -> None:
    s, plan = _running(client, questions=2)
    session = _start(client, plan["id"])
    first, last = session["answers"]
    _put(client, session["id"], first["id"], known=True)

    client.delete(f"/note-questions/{last['question_id']}")

    read = client.get(f"/recall-sessions/{session['id']}").json()
    assert read["finished_at"] is not None
    assert _plan(client, s)["recall_stage"] == 1


# --- Réviser une question (#103) ------------------------------------------------


def test_a_revision_is_posed_moved_and_withdrawn(client: TestClient, db) -> None:
    s, plan = _running(client, questions=1)
    session = _start(client, plan["id"])
    row = session["answers"][0]["id"]
    url = f"/recall-sessions/{session['id']}/answers/{row}/revision"
    friday = TODAY + timedelta(days=3)

    posed = client.put(url, json={"day": str(friday)})

    assert posed.status_code == 200, posed.text
    assert posed.json()["answers"][0]["revision_on"] == str(friday)
    studies = [
        a
        for a in client.get("/activities", params={"skill_id": s}).json()
        if any(x["kind"] == "study" for x in a["acts"])
    ]
    assert [(a["title"], a["start_at"][:10]) for a in studies] == [
        ("Révision · Chandelle", str(friday))
    ]
    assert studies[0]["acts"][0]["plan_id"] == plan["id"]

    moved = client.put(url, json={"day": str(friday + timedelta(days=1))}).json()
    assert moved["answers"][0]["revision_on"] == str(friday + timedelta(days=1))
    assert client.get(f"/activities/{studies[0]['id']}").status_code == 200

    cleared = client.delete(url).json()
    assert cleared["answers"][0]["revision_on"] is None
    assert client.get(f"/activities/{studies[0]['id']}").status_code == 404
