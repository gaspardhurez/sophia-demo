"""Le rituel de semaine (#91, #92) : le domaine système, l'activité du rituel
que « Préparer » pose chaque dimanche, la préparation d'une semaine
(démarrer, projets revus, valider) et la lecture d'un projet pendant le
rituel."""

from datetime import date, timedelta

from fastapi.testclient import TestClient

from sophia.application.system_domain import SYSTEM_DOMAIN_ID
from sophia.domain.preparation import suggest_week_target, weeks_left
from tests.helpers import project_payload

TODAY = date.today()
THIS_MONDAY = TODAY - timedelta(days=TODAY.weekday())
THIS_SUNDAY = THIS_MONDAY + timedelta(days=6)
NEXT_MONDAY = THIS_MONDAY + timedelta(days=7)
SYSTEM = str(SYSTEM_DOMAIN_ID)


def _at(day: date, hour: int = 10) -> str:
    return f"{day}T{hour:02d}:00:00"


def _domain(client: TestClient, name: str = "Course") -> str:
    return client.post("/domains", json={"name": name}).json()["id"]


def _prepare(client: TestClient, until: date) -> None:
    resp = client.post("/planning/prepare", json={"until": str(until)})
    assert resp.status_code == 200, resp.text


def _rituals(client: TestClient) -> list[dict]:
    return client.get("/activities", params={"domain_id": SYSTEM}).json()


def _days(activities: list[dict]) -> list[str]:
    return [a["start_at"][:10] for a in activities]


# --- Le domaine système -------------------------------------------------------


def test_the_system_domain_is_hidden_and_locked(client: TestClient) -> None:
    mine = _domain(client)
    _prepare(client, THIS_SUNDAY)

    assert [d["id"] for d in client.get("/domains").json()] == [mine]
    system = client.get(f"/domains/{SYSTEM}").json()
    assert (system["name"], system["system"]) == ("Sophia", True)
    assert client.patch(f"/domains/{SYSTEM}", json={"name": "X"}).status_code == 422
    assert client.delete(f"/domains/{SYSTEM}").status_code == 422


def test_no_activity_is_added_by_hand_to_the_system_domain(
    client: TestClient,
) -> None:
    mine = _domain(client)
    _prepare(client, THIS_SUNDAY)

    resp = client.post("/activities", json={"domain_id": SYSTEM, "title": "X"})
    assert resp.status_code == 422
    activity = client.post("/activities", json={"domain_id": mine, "title": "X"})
    resp = client.patch(
        f"/activities/{activity.json()['id']}", json={"domain_id": SYSTEM}
    )
    assert resp.status_code == 422
    (ritual,) = _rituals(client)
    resp = client.patch(f"/activities/{ritual['id']}", json={"domain_id": mine})
    assert resp.status_code == 422


# --- L'activité du rituel ---------------------------------------------------


def test_preparing_poses_the_ritual_every_sunday(client: TestClient) -> None:
    _prepare(client, THIS_SUNDAY + timedelta(days=7))

    rituals = _rituals(client)
    assert _days(rituals) == [
        str(THIS_SUNDAY),
        str(THIS_SUNDAY + timedelta(days=7)),
    ]
    first = rituals[0]
    assert first["title"] == "Préparer la semaine"
    assert first["all_day"] is True
    assert first["projects"] == []
    assert first["ritual_week_start"] == str(NEXT_MONDAY)
    prep = client.get(f"/preparations/{NEXT_MONDAY}").json()
    assert prep["state"] == "todo"
    assert prep["activity_id"] == first["id"]
    assert prep["past_week_start"] == str(THIS_MONDAY)


def test_a_ritual_is_posed_once_and_never_comes_back(client: TestClient) -> None:
    _prepare(client, THIS_SUNDAY + timedelta(days=7))
    first, second = _rituals(client)

    client.delete(f"/activities/{first['id']}")
    client.patch(
        f"/activities/{second['id']}",
        json={"start_at": _at(THIS_SUNDAY, 0), "end_at": _at(THIS_SUNDAY, 0)},
    )
    _prepare(client, THIS_SUNDAY + timedelta(days=14))

    # Ni la supprimée ni la déplacée ne reviennent ; le dimanche suivant reçoit
    # la sienne.
    assert _days(_rituals(client)) == [
        str(THIS_SUNDAY),
        str(THIS_SUNDAY + timedelta(days=14)),
    ]
    prep = client.get(f"/preparations/{NEXT_MONDAY}").json()
    assert prep["activity_id"] is None


def test_a_slot_is_planned_for_a_week_without_ritual(client: TestClient) -> None:
    slot = {"start_at": _at(TODAY, 18), "end_at": _at(TODAY, 19)}
    resp = client.post(f"/preparations/{THIS_MONDAY}/activity", json=slot)
    assert resp.status_code == 200, resp.text
    prep = resp.json()
    # Planifier ne démarre pas la préparation.
    assert prep["state"] == "todo"

    (ritual,) = _rituals(client)
    assert ritual["id"] == prep["activity_id"]
    assert ritual["all_day"] is False
    assert ritual["start_at"] == slot["start_at"]
    assert ritual["ritual_week_start"] == str(THIS_MONDAY)

    # Une seule activité par rituel.
    again = client.post(f"/preparations/{THIS_MONDAY}/activity", json=slot)
    assert again.status_code == 422


def test_a_deleted_ritual_can_be_planned_again(client: TestClient) -> None:
    _prepare(client, THIS_SUNDAY + timedelta(days=7))
    ritual = next(
        a for a in _rituals(client) if a["ritual_week_start"] == str(NEXT_MONDAY)
    )
    client.delete(f"/activities/{ritual['id']}")
    slot = {"start_at": _at(THIS_SUNDAY, 9), "end_at": _at(THIS_SUNDAY, 10)}
    resp = client.post(f"/preparations/{NEXT_MONDAY}/activity", json=slot)
    assert resp.status_code == 200, resp.text
    assert resp.json()["activity_id"] is not None


def test_a_slot_must_end_after_it_starts(client: TestClient) -> None:
    slot = {"start_at": _at(TODAY, 19), "end_at": _at(TODAY, 18)}
    resp = client.post(f"/preparations/{THIS_MONDAY}/activity", json=slot)
    assert resp.status_code == 422


def test_the_ritual_is_never_posed_in_the_past(client: TestClient) -> None:
    _prepare(client, THIS_MONDAY - timedelta(days=1))
    assert _rituals(client) == []


def test_ghosts_show_the_ritual_beyond_what_is_posed(client: TestClient) -> None:
    _prepare(client, THIS_SUNDAY)
    ghosts = client.get(
        "/planning/preview",
        params={
            "start": str(THIS_MONDAY),
            "end": str(THIS_MONDAY + timedelta(days=21)),
        },
    ).json()

    rituals = [g for g in ghosts if g["ritual_week_start"] is not None]
    assert [g["start_at"][:10] for g in rituals] == [
        str(THIS_SUNDAY + timedelta(days=7)),
        str(THIS_SUNDAY + timedelta(days=14)),
    ]
    assert rituals[0]["activity_type_id"] is None
    assert rituals[0]["domain_id"] == SYSTEM
    assert len(_rituals(client)) == 1  # rien d'écrit


# --- La préparation ---------------------------------------------------------


def test_a_week_is_named_by_its_monday(client: TestClient) -> None:
    tuesday = NEXT_MONDAY + timedelta(days=1)
    assert client.get(f"/preparations/{tuesday}").status_code == 422
    assert client.post(f"/preparations/{tuesday}/start").status_code == 422
    assert client.get(f"/preparations/{NEXT_MONDAY}").status_code == 404


def test_the_week_is_posed_project_by_project(client: TestClient) -> None:
    """Le calendrier se construit au fil de la préparation : démarrer pose les
    replis des domaines ; ouvrir la semaine prochaine d'un projet pose ses
    activités types ; valider pose le reste."""
    d = _domain(client)
    obj = _project(client, d)
    run = client.post("/activity-types", json={"domain_id": d, "title": "Run"}).json()[
        "id"
    ]
    client.put(f"/projects/{obj}/activity-types/{run}", json={"planning": "daily"})
    client.post(
        "/activity-types",
        json={
            "domain_id": d,
            "title": "Lecture",
            "fallback_active": True,
            "fallback_planning": "daily",
        },
    )

    def next_week() -> list[dict]:
        return client.get(
            "/activities",
            params={
                "domain_id": d,
                "start": _at(NEXT_MONDAY, 0),
                "end": _at(NEXT_MONDAY + timedelta(days=7), 0),
            },
        ).json()

    # Démarrer pose ce qui ne relève d'aucun projet : le repli du domaine.
    prep = client.post(f"/preparations/{NEXT_MONDAY}/start").json()
    assert prep["state"] == "in_progress"
    assert prep["started_at"] is not None
    assert {a["title"] for a in next_week()} == {"Lecture"}

    resp = client.post(f"/preparations/{NEXT_MONDAY}/projects/{obj}/pose")
    assert resp.status_code == 200, resp.text
    assert len(resp.json()["next"]["activities"]) == 7
    assert {a["title"] for a in next_week()} == {"Run", "Lecture"}

    # Valider pose le reste : le rituel suivant ; rien n'est posé deux fois.
    client.post(f"/preparations/{NEXT_MONDAY}/validate")
    assert {a["title"] for a in next_week()} == {"Run", "Lecture"}
    assert len(next_week()) == 14
    assert str(NEXT_MONDAY + timedelta(days=6)) in _days(_rituals(client))

    again = client.post(f"/preparations/{NEXT_MONDAY}/start").json()
    assert again["id"] == prep["id"]
    assert again["started_at"] == prep["started_at"]


def test_posing_one_project_does_not_pull_the_others(client: TestClient) -> None:
    """Préparer un projet ne pose que lui : ni le rechargement de l'app ni le
    rattrapage d'une activité type d'un autre projet ne s'alignent sur lui
    (18/10/2026)."""
    d = _domain(client)
    posed = _project(client, d)
    other = _project(client, d)

    def daily(obj: str, title: str) -> str:
        t = client.post("/activity-types", json={"domain_id": d, "title": title})
        tid = t.json()["id"]
        client.put(f"/projects/{obj}/activity-types/{tid}", json={"planning": "daily"})
        return tid

    daily(posed, "Run")
    lift = daily(other, "Lift")

    def next_week() -> set[str]:
        return {
            a["title"]
            for a in client.get(
                "/activities",
                params={
                    "domain_id": d,
                    "start": _at(NEXT_MONDAY, 0),
                    "end": _at(NEXT_MONDAY + timedelta(days=7), 0),
                },
            ).json()
        }

    client.post(f"/preparations/{NEXT_MONDAY}/projects/{posed}/pose")
    assert next_week() == {"Run"}
    # L'ouverture de l'app : la semaine en cours seulement.
    client.post("/planning/prepare", json={"until": None})
    assert next_week() == {"Run"}
    # Une planification changée sur l'autre projet : son niveau, pas celui
    # de la préparation.
    client.put(
        f"/projects/{other}/activity-types/{lift}",
        json={"planning": "weekly", "weekdays": [0, 2]},
    )
    assert next_week() == {"Run"}


def test_projects_are_marked_reviewed(client: TestClient) -> None:
    d = _domain(client)
    obj = client.post(f"/domains/{d}/projects", json=project_payload("Trail")).json()[
        "id"
    ]
    url = f"/preparations/{NEXT_MONDAY}/projects/{obj}/reviewed"
    assert client.put(url).status_code == 404  # pas de préparation

    client.post(f"/preparations/{NEXT_MONDAY}/start")
    client.put(url)
    prep = client.put(url).json()
    assert [r["project_id"] for r in prep["reviewed"]] == [obj]

    prep = client.delete(url).json()
    assert prep["reviewed"] == []


def test_validating_checks_and_moves_the_ritual_to_today(client: TestClient) -> None:
    client.post(f"/preparations/{NEXT_MONDAY}/start")
    before = client.get(f"/preparations/{NEXT_MONDAY}").json()

    prep = client.post(f"/preparations/{NEXT_MONDAY}/validate").json()
    assert prep["state"] == "validated"
    assert prep["validated_at"] is not None
    ritual = client.get(f"/activities/{prep['activity_id']}").json()
    assert ritual["done"] is True
    assert ritual["start_at"][:10] == str(TODAY)
    if before["activity_id"] is not None:
        assert prep["activity_id"] == before["activity_id"]

    # Déjà validée : rien ne bouge.
    again = client.post(f"/preparations/{NEXT_MONDAY}/validate").json()
    assert again["validated_at"] == prep["validated_at"]


def test_validating_without_its_activity_creates_one_done_today(
    client: TestClient,
) -> None:
    _prepare(client, THIS_SUNDAY)
    (ritual,) = _rituals(client)
    client.delete(f"/activities/{ritual['id']}")

    prep = client.post(f"/preparations/{NEXT_MONDAY}/validate").json()
    assert prep["state"] == "validated"
    new = client.get(f"/activities/{prep['activity_id']}").json()
    assert new["id"] != ritual["id"]
    assert (new["done"], new["start_at"][:10]) == (True, str(TODAY))
    assert new["ritual_week_start"] == str(NEXT_MONDAY)


# --- Un projet pendant le rituel ------------------------------------------


def _project(client: TestClient, d: str, **body) -> str:
    payload = project_payload(
        "Trail",
        start_at=str(TODAY - timedelta(days=60)),
        due_at=str(TODAY + timedelta(days=60)),
        **body,
    )
    return client.post(f"/domains/{d}/projects", json=payload).json()["id"]


def _session(client: TestClient, d: str, obj: str, day: date, done: bool, **body):
    resp = client.post(
        "/activities",
        json={
            "domain_id": d,
            "title": "Séance",
            "start_at": _at(day),
            "end_at": _at(day, 11),
            "done": done,
            "projects": [{"project_id": obj}],
            **body,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _metric(client: TestClient, d: str, obj: str, name: str, target: float) -> str:
    m = client.post(f"/domains/{d}/metrics", json={"name": name}).json()["id"]
    client.put(f"/projects/{obj}/metrics", json={"metric_id": m, "target": target})
    return m


def _value(client: TestClient, m: str, value: float, day: date, **body) -> dict:
    return client.post(
        f"/metrics/{m}/values",
        json={"value": value, "measured_at": str(day), **body},
    ).json()


def _week(client: TestClient, obj: str) -> dict:
    resp = client.get(f"/preparations/{NEXT_MONDAY}/projects/{obj}")
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_the_past_week_of_an_project(client: TestClient) -> None:
    d = _domain(client)
    obj = _project(client, d)
    total = client.post(
        f"/projects/{obj}/totals", json={"mode": "count", "target": 10}
    ).json()
    earlier = _session(client, d, obj, THIS_MONDAY - timedelta(days=3), True)
    done = _session(client, d, obj, THIS_MONDAY + timedelta(days=1), True)
    missed = _session(client, d, obj, THIS_MONDAY + timedelta(days=2), False)
    _session(client, d, obj, NEXT_MONDAY + timedelta(days=2), False)

    squat = _metric(client, d, obj, "Squat", 120)
    _value(client, squat, 100, THIS_MONDAY - timedelta(days=5))
    _value(client, squat, 105, THIS_MONDAY + timedelta(days=1), activity_id=done["id"])
    flat = _metric(client, d, obj, "Gainage", 200)
    _value(client, flat, 90, THIS_MONDAY - timedelta(days=5))
    _value(client, flat, 90, THIS_MONDAY + timedelta(days=1), activity_id=done["id"])

    checked = client.post(
        f"/projects/{obj}/achievements", json={"title": "Reco"}
    ).json()
    client.patch(f"/achievements/{checked['id']}", json={"done": True})
    client.post(f"/projects/{obj}/achievements", json={"title": "Pas cochée"})

    week = _week(client, obj)
    past = week["past"]
    assert week["past"]["step_id"] is None
    assert week["past"]["steps"] == []
    assert past["week_start"] == str(THIS_MONDAY)
    assert past["totals"] == [
        {"total_id": total["totals"][0]["id"], "target": 10, "progress": 2, "gain": 1}
    ]
    # Les Résultats d'un projet n'ont pas d'ordre : on les lit par nom.
    rows = {r["name"]: r for r in past["results"]}
    squat_row, flat_row = rows["Squat"], rows["Gainage"]
    assert squat_row["week_best"]["value"] == 105
    assert squat_row["best_before"]["value"] == 100
    assert squat_row["delta"] == 5
    assert squat_row["is_met"] is False
    # Pas de +0 : la semaine n'a pas battu la saison.
    assert flat_row["delta"] is None
    assert [a["title"] for a in past["achievements"]] == ["Reco"]
    assert [a["id"] for a in past["done_activities"]] == [done["id"]]
    assert [a["id"] for a in past["missed_activities"]] == [missed["id"]]
    assert earlier["id"] not in {a["id"] for a in past["done_activities"]}


def test_learning_in_the_past_week(client: TestClient) -> None:
    d = _domain(client, "Tennis")
    skill = client.post(f"/domains/{d}/skills", json={"name": "Chandelle"}).json()["id"]
    obj = _project(client, d, skill_ids=[skill])
    (plan,) = client.get(f"/skills/{skill}/plans").json()
    client.post(f"/plans/{plan['id']}/open")
    client.patch(f"/plans/{plan['id']}", json={"study": False, "situation": False})
    started = client.post(
        f"/skills/{skill}/practice", json={"title": "Panier", "plan_id": plan["id"]}
    ).json()
    old = client.post(
        f"/skills/{skill}/practice", json={"title": "Mur", "plan_id": plan["id"]}
    ).json()
    untouched = client.post(
        f"/skills/{skill}/practice", json={"title": "Smash", "plan_id": plan["id"]}
    ).json()

    def practice(item: dict, day: date) -> None:
        act = {
            "skill_id": skill,
            "kind": "practice",
            "practice_item_id": item["id"],
            "plan_id": plan["id"],
        }
        _session(client, d, obj, day, True, acts=[act])

    practice(old, THIS_MONDAY - timedelta(days=4))
    practice(old, THIS_MONDAY + timedelta(days=1))
    practice(started, THIS_MONDAY + timedelta(days=2))
    client.patch(f"/plans/{plan['id']}/items/{started['id']}", json={"done": True})

    (row,) = _week(client, obj)["past"]["learning"]
    assert row["skill_id"] == skill
    assert row["plan_id"] == plan["id"]
    assert row["acquired_this_week"] is False
    items = {i["item_id"]: i for i in row["items"]}
    assert set(items) == {started["id"], old["id"]}
    assert untouched["id"] not in items
    assert items[started["id"]]["started_this_week"] is True
    assert items[started["id"]]["completed_this_week"] is True
    assert items[started["id"]]["in_progress"] is False
    assert items[old["id"]]["started_this_week"] is False
    assert items[old["id"]]["in_progress"] is True
    assert items[started["id"]]["sessions_this_week"] == 1
    assert items[old["id"]]["sessions_this_week"] == 1
    # Le critère (#157) : 3 passes à 5/5 par défaut ; réussi à la main, il
    # est plein, sinon sans retour au niveau, rien.
    assert items[started["id"]]["criterion_passes"] == 3
    assert items[started["id"]]["criterion_level"] == 5
    assert items[started["id"]]["criterion_reached"] == 3
    assert items[old["id"]]["criterion_reached"] == 0

    client.post(f"/plans/{plan['id']}/complete")
    (row,) = _week(client, obj)["past"]["learning"]
    assert row["acquired_this_week"] is True
    assert row["level"] == 4


def test_pieces_worked_in_the_past_week(client: TestClient) -> None:
    d = _domain(client, "Cuisine")
    skill = client.post(f"/domains/{d}/skills", json={"name": "Recette"}).json()["id"]
    obj = _project(client, d, skill_ids=[skill])
    (plan,) = client.get(f"/skills/{skill}/plans").json()
    client.post(f"/plans/{plan['id']}/open")

    def act(kind: str, **extra) -> dict:
        return {"skill_id": skill, "kind": kind, "plan_id": plan["id"], **extra}

    study = act("study")
    _session(client, d, obj, THIS_MONDAY - timedelta(days=2), True, acts=[study])
    _session(client, d, obj, THIS_MONDAY, True, acts=[study])
    _session(client, d, obj, THIS_MONDAY + timedelta(days=1), True, acts=[study])
    _session(client, d, obj, THIS_MONDAY + timedelta(days=2), False, acts=[study])
    _session(
        client,
        d,
        obj,
        THIS_MONDAY + timedelta(days=2),
        True,
        acts=[act("practice", nature="isolated")],
    )

    (row,) = _week(client, obj)["past"]["learning"]
    # Faites et dans la semaine seulement ; une séance compte une fois.
    assert row["study_sessions"] == 2
    assert row["practice_sessions"] == 1
    assert row["application_sessions"] == 0
    assert row["recalls_this_week"] == 0
    assert "study_done_this_week" not in row


def test_the_coming_week_of_an_project(client: TestClient) -> None:
    d = _domain(client)
    skill = client.post(f"/domains/{d}/skills", json={"name": "Descente"}).json()["id"]
    obj = _project(client, d, skill_ids=[skill])
    squat = _metric(client, d, obj, "Squat", 120)
    _value(client, squat, 100, THIS_MONDAY - timedelta(days=5))
    session = _session(
        client,
        d,
        obj,
        NEXT_MONDAY + timedelta(days=3),
        False,
        acts=[{"skill_id": skill, "kind": "study"}],
    )
    target = _value(client, squat, 110, NEXT_MONDAY, activity_id=session["id"])
    linked = client.post(f"/projects/{obj}/achievements", json={"title": "Reco"}).json()
    client.post(f"/projects/{obj}/achievements", json={"title": "Plus tard"})
    client.post(
        f"/activities/{session['id']}/achievements",
        json={"achievement_id": linked["id"]},
    )

    upcoming = _week(client, obj)["next"]
    (result,) = upcoming["results"]
    assert result["current"]["value"] == 100
    due = TODAY + timedelta(days=60)
    assert result["deadline"] == str(due)
    assert result["suggestion"] == suggest_week_target(
        100, 120, "up", weeks_left(NEXT_MONDAY, due)
    )
    assert [(v["id"], v["counts"]) for v in result["targets"]] == [
        (target["id"], False)
    ]
    assert [a["id"] for a in upcoming["achievements"]] == [linked["id"]]
    (act,) = upcoming["acts"]
    assert act["activity_id"] == session["id"]
    assert act["act"]["skill_id"] == skill
    assert [a["id"] for a in upcoming["activities"]] == [session["id"]]


def test_the_scope_is_the_current_step(client: TestClient) -> None:
    """#91, objectif par objectif : ce que l'étape en cours porte se lit dans
    l'étape (tranche, palier), le reste dans le projet."""
    d = _domain(client)
    obj = _project(client, d)
    total = client.post(
        f"/projects/{obj}/totals", json={"mode": "count", "target": 12}
    ).json()["totals"][0]["id"]
    hours = client.post(
        f"/projects/{obj}/totals", json={"mode": "count", "target": 30}
    ).json()["totals"][1]["id"]
    squat = _metric(client, d, obj, "Squat", 120)
    gainage = _metric(client, d, obj, "Gainage", 200)
    client.post(f"/projects/{obj}/achievements", json={"title": "Hors étape"})
    in_step = client.post(
        f"/projects/{obj}/achievements", json={"title": "Dans l'étape"}
    ).json()
    step_due = TODAY + timedelta(days=20)
    client.post(
        f"/projects/{obj}/steps",
        json={
            "title": "Développement",
            "start_at": str(TODAY - timedelta(days=10)),
            "due_at": str(step_due),
        },
    )
    step = client.get(f"/projects/{obj}").json()["steps"][0]["id"]
    client.put(f"/steps/{step}/totals", json={"total_id": total, "target": 4})
    client.put(f"/steps/{step}/metrics", json={"metric_id": squat, "target": 105})
    client.patch(f"/achievements/{in_step['id']}", json={"step_id": step})
    session = _session(client, d, obj, NEXT_MONDAY, False)
    client.post(
        f"/activities/{session['id']}/achievements",
        json={"achievement_id": in_step["id"]},
    )

    week = _week(client, obj)
    assert week["past"]["step_id"] == week["next"]["step_id"] == step
    # Le Total confié à l'étape : sa tranche ; celui qu'aucune étape ne porte :
    # celui du projet.
    assert sorted(
        (t["total_id"], t["target"]) for t in week["past"]["totals"]
    ) == sorted([(total, 4), (hours, 30)])

    # Distribué à une autre étape seulement, il quitte le périmètre.
    client.post(
        f"/projects/{obj}/steps",
        json={"title": "Plus tard", "start_at": str(step_due + timedelta(days=1))},
    )
    later = client.get(f"/projects/{obj}").json()["steps"][1]["id"]
    client.put(f"/steps/{later}/totals", json={"total_id": hours, "target": 10})
    assert [t["total_id"] for t in _week(client, obj)["past"]["totals"]] == [total]
    results = {r["metric_id"]: r for r in week["next"]["results"]}
    assert (results[squat]["target"], results[squat]["deadline"]) == (
        105,
        str(step_due),
    )
    assert results[gainage]["target"] == 200
    assert [a["id"] for a in week["next"]["achievements"]] == [in_step["id"]]


def test_the_past_week_reads_the_last_level_of_the_week(client: TestClient) -> None:
    # #139 : chaque objet, et chaque pièce générique, dit le niveau de son
    # dernier retour de la semaine — celui de la séance la plus tardive.
    d = _domain(client, "Tennis")
    skill = client.post(f"/domains/{d}/skills", json={"name": "Chandelle"}).json()["id"]
    obj = _project(client, d, skill_ids=[skill])
    (plan,) = client.get(f"/skills/{skill}/plans").json()
    client.post(f"/plans/{plan['id']}/open")
    item = client.post(
        f"/skills/{skill}/practice", json={"title": "Panier", "plan_id": plan["id"]}
    ).json()
    on_item = {
        "skill_id": skill,
        "kind": "practice",
        "practice_item_id": item["id"],
        "plan_id": plan["id"],
    }
    generic = {
        "skill_id": skill,
        "kind": "practice",
        "nature": "isolated",
        "plan_id": plan["id"],
    }

    def rated(day: date, act: dict, level: int | None) -> None:
        a = _session(client, d, obj, day, True, acts=[act])
        if level is not None:
            url = f"/activities/{a['id']}/acts/{a['acts'][0]['id']}/feedback"
            assert client.put(url, json={"level": level}).status_code == 200

    rated(THIS_MONDAY + timedelta(days=3), on_item, 4)
    rated(THIS_MONDAY + timedelta(days=1), on_item, 2)
    rated(THIS_MONDAY + timedelta(days=4), on_item, None)  # sans retour
    rated(THIS_MONDAY - timedelta(days=3), on_item, 5)  # semaine d'avant
    rated(THIS_MONDAY + timedelta(days=2), generic, 3)

    (row,) = _week(client, obj)["past"]["learning"]
    (read,) = row["items"]
    assert read["sessions_this_week"] == 3
    # Une seule passe à 5/5 (la semaine d'avant compte : le critère est au
    # cycle, pas à la semaine).
    assert read["criterion_reached"] == 1
    assert read["last_level"] == 4
    assert row["practice_last_level"] == 3
    assert row["application_last_level"] is None


def test_a_week_across_two_steps(client: TestClient) -> None:
    """#183 : une semaine qui croise deux étapes les liste, avec leurs jours
    dedans ; par défaut, celle qui couvre le lundi ; `next_step` en choisit
    une autre, et le périmètre la suit (réalisations, savoirs)."""
    d = _domain(client)
    obj = _project(client, d)
    wednesday = NEXT_MONDAY + timedelta(days=2)
    for title, start, due in [
        ("Fondations", TODAY - timedelta(days=20), wednesday),
        ("Vitesse", wednesday + timedelta(days=1), TODAY + timedelta(days=40)),
    ]:
        client.post(
            f"/projects/{obj}/steps",
            json={"title": title, "start_at": str(start), "due_at": str(due)},
        )
    first, second = (s["id"] for s in client.get(f"/projects/{obj}").json()["steps"])
    later = client.post(
        f"/projects/{obj}/achievements", json={"title": "Sprint"}
    ).json()
    client.patch(f"/achievements/{later['id']}", json={"step_id": second})
    session = _session(client, d, obj, NEXT_MONDAY + timedelta(days=4), False)
    client.post(
        f"/activities/{session['id']}/achievements",
        json={"achievement_id": later["id"]},
    )

    week = _week(client, obj)
    assert week["next"]["step_id"] == first
    assert [
        (s["step_id"], s["first_day"], s["last_day"]) for s in week["next"]["steps"]
    ] == [
        (first, str(NEXT_MONDAY), str(wednesday)),
        (
            second,
            str(wednesday + timedelta(days=1)),
            str(NEXT_MONDAY + timedelta(days=6)),
        ),
    ]
    assert week["next"]["achievements"] == []
    # La semaine écoulée tient dans la première : une seule étape, pas de choix.
    assert [s["step_id"] for s in week["past"]["steps"]] == [first]

    resp = client.get(
        f"/preparations/{NEXT_MONDAY}/projects/{obj}", params={"next_step": second}
    )
    chosen = resp.json()["next"]
    assert chosen["step_id"] == second
    assert [a["id"] for a in chosen["achievements"]] == [later["id"]]
    assert chosen["skill_ids"] == []

    # Une étape qui ne croise pas la semaine ne se choisit pas : le défaut.
    resp = client.get(
        f"/preparations/{NEXT_MONDAY}/projects/{obj}", params={"past_step": second}
    )
    assert resp.json()["past"]["step_id"] == first
