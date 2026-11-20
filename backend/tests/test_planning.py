"""Tests de la planification (#37).

Plus rien ne se génère à la lecture du calendrier : on **prépare** jusqu'à une
date, et chaque lien retient jusqu'où il a posé. Ce qui se vérifie ici :

- un lien pose ses jours dans la période de son projet ouvert, sur ses
  étapes allumées, et se met au niveau des autres dès sa création ;
- sans créneau, une seule case par jour et par activité type, liée à tous les
  projets qui la planifient ; avec créneau, un bloc par lien ;
- le repli du domaine ne pose que là où aucun projet ouvert ne porte
  l'activité type ;
- un jour posé ne se repose jamais ; « Repartir de zéro » le dit ;
- l'aperçu (les fantômes) voit au-delà sans rien écrire.
"""

from datetime import date, timedelta

from fastapi.testclient import TestClient

from tests.helpers import project_ids, project_payload

TODAY = date.today()
ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]


def _day(offset: int) -> date:
    return TODAY + timedelta(days=offset)


def _domain(client: TestClient) -> str:
    return client.post("/domains", json={"name": "Sport"}).json()["id"]


def _type(client: TestClient, domain_id: str, title: str = "Run", **body) -> str:
    resp = client.post(
        "/activity-types", json={"domain_id": domain_id, "title": title, **body}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _project(client: TestClient, domain_id: str, **body) -> str:
    resp = client.post(
        f"/domains/{domain_id}/projects", json=project_payload("Semi", **body)
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _link(client: TestClient, obj: str, type_id: str, **body) -> dict:
    payload = {"planning": "daily", **body}
    resp = client.put(f"/projects/{obj}/activity-types/{type_id}", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _prepare(client: TestClient, until: date) -> None:
    resp = client.post("/planning/prepare", json={"until": str(until)})
    assert resp.status_code == 200, resp.text


def _posed(client: TestClient, type_id: str, frm: date, to: date) -> list[dict]:
    """Les occurrences de cette activité type sur [frm, to] (lecture seule)."""
    acts = client.get(
        "/activities",
        params={
            "start": f"{frm}T00:00:00",
            "end": f"{to + timedelta(days=1)}T00:00:00",
        },
    ).json()
    return [a for a in acts if a["activity_type_id"] == type_id]


def _days(acts: list[dict]) -> list[date]:
    return sorted(date.fromisoformat(a["start_at"][:10]) for a in acts)


# --- Un lien pose ses jours ---------------------------------------------------


def test_a_new_link_poses_up_to_the_level_at_once(client: TestClient) -> None:
    """Sans rien de préparé, le niveau est la fin de la semaine en cours."""
    d = _domain(client)
    run = _type(client, d)
    obj = _project(client, d)

    _link(client, obj, run)

    end_of_week = _day(6 - TODAY.weekday())
    acts = _posed(client, run, TODAY, _day(30))
    assert _days(acts) == [_day(i) for i in range((end_of_week - TODAY).days + 1)]
    assert all(project_ids(a) == [obj] for a in acts)
    level = client.get("/planning/level").json()["posed_until"]
    assert level == str(end_of_week)


def test_weekly_poses_only_its_days_and_never_the_past(client: TestClient) -> None:
    d = _domain(client)
    run = _type(client, d)
    obj = _project(client, d)
    weekday = _day(1).weekday()

    _link(client, obj, run, planning="weekly", weekdays=[weekday])
    _prepare(client, _day(14))

    days = _days(_posed(client, run, _day(-7), _day(14)))
    assert days == [_day(1), _day(8)]


def test_manual_poses_nothing(client: TestClient) -> None:
    d = _domain(client)
    run = _type(client, d)
    obj = _project(client, d)

    _link(client, obj, run, planning="manual")
    _prepare(client, _day(14))

    assert _posed(client, run, TODAY, _day(14)) == []


def test_reading_the_calendar_writes_nothing(client: TestClient) -> None:
    """Fini la génération à la lecture : lire une semaine lointaine ne pose
    rien."""
    d = _domain(client)
    run = _type(client, d)
    obj = _project(client, d, due_at=str(_day(60)))
    _link(client, obj, run)

    assert _posed(client, run, _day(30), _day(40)) == []


def test_a_link_poses_only_while_its_project_is_open(client: TestClient) -> None:
    """Le jour posé est jugé, pas le jour où l'on prépare : un projet qui
    commence dans trois jours reçoit ses jours à partir de là."""
    d = _domain(client)
    run = _type(client, d)
    obj = _project(client, d, start_at=str(_day(3)), due_at=str(_day(5)))

    _link(client, obj, run)
    _prepare(client, _day(10))

    assert _days(_posed(client, run, TODAY, _day(10))) == [_day(3), _day(4), _day(5)]


def test_an_abandoned_project_receives_nothing(client: TestClient) -> None:
    d = _domain(client)
    run = _type(client, d)
    obj = _project(client, d)
    _link(client, obj, run, planning="manual")
    client.patch(f"/projects/{obj}", json={"status": "abandoned"})

    _link(client, obj, run)
    _prepare(client, _day(10))

    assert _posed(client, run, TODAY, _day(10)) == []


def test_a_switched_off_step_receives_nothing(client: TestClient) -> None:
    """Le switch des cartes d'étape : éteint, le lien ne pose rien pendant
    cette étape. L'étape est reçue à la création de l'occurrence."""
    d = _domain(client)
    run = _type(client, d)
    obj = _project(client, d, due_at=str(_day(20)))
    first = client.post(
        f"/projects/{obj}/steps",
        json={"title": "Base", "start_at": str(TODAY), "due_at": str(_day(4))},
    ).json()["steps"][0]["id"]
    second = client.post(
        f"/projects/{obj}/steps",
        json={"title": "Volume", "start_at": str(_day(5)), "due_at": str(_day(9))},
    ).json()["steps"][1]["id"]

    _link(client, obj, run, off_step_ids=[first])
    _prepare(client, _day(9))

    acts = _posed(client, run, TODAY, _day(9))
    assert _days(acts) == [_day(i) for i in range(5, 10)]
    assert {a["projects"][0]["step_id"] for a in acts} == {second}


def test_a_day_outside_every_step_follows_the_link(client: TestClient) -> None:
    """Un jour qu'aucune étape ne couvre : le lien allumé partout y pose, le
    lien réparti sur des étapes (éteint sur au moins une) n'y pose rien."""
    d = _domain(client)
    dodo, bouge = _type(client, d, "Lecture du soir"), _type(client, d, "Marche")
    obj = _project(client, d, due_at=str(_day(20)))
    first = client.post(
        f"/projects/{obj}/steps",
        json={"title": "Sommeil", "start_at": str(TODAY), "due_at": str(_day(2))},
    ).json()["steps"][0]["id"]
    client.post(
        f"/projects/{obj}/steps",
        json={"title": "Mouvement", "start_at": str(_day(4)), "due_at": str(_day(6))},
    )

    _link(client, obj, dodo)
    _link(client, obj, bouge, off_step_ids=[first])
    _prepare(client, _day(6))

    # Le jour 3 n'est dans aucune étape.
    assert _day(3) in _days(_posed(client, dodo, TODAY, _day(6)))
    assert _days(_posed(client, bouge, TODAY, _day(6))) == [
        _day(4),
        _day(5),
        _day(6),
    ]


# --- Case du jour, bloc au créneau --------------------------------------------


def test_the_day_case_is_shared_by_every_project(client: TestClient) -> None:
    """Sans créneau : une seule case par jour, liée à tous les projets qui
    planifient l'activité type ce jour-là."""
    d = _domain(client)
    dodo = _type(client, d, "Lecture du soir")
    semi = _project(client, d)
    trail = _project(client, d)

    _link(client, semi, dodo)
    _link(client, trail, dodo)

    acts = _posed(client, dodo, TODAY, TODAY)
    assert len(acts) == 1
    assert sorted(project_ids(acts[0])) == sorted([semi, trail])
    assert acts[0]["all_day"] is True


def test_a_slot_poses_one_block_per_link(client: TestClient) -> None:
    """Avec créneau : un bloc à l'heure par lien — le Run du Semi n'est pas le
    Run du Trail."""
    d = _domain(client)
    run = _type(client, d)
    semi = _project(client, d)
    trail = _project(client, d)
    slot = {"slot_start": "18:30:00", "slot_minutes": 45}

    _link(client, semi, run, **slot)
    _link(client, trail, run, **slot)

    acts = _posed(client, run, TODAY, TODAY)
    assert len(acts) == 2
    assert sorted(project_ids(a)[0] for a in acts) == sorted([semi, trail])
    assert acts[0]["start_at"].endswith("18:30:00")
    assert acts[0]["end_at"].endswith("19:15:00")
    assert acts[0]["all_day"] is False


def test_a_slot_needs_both_hour_and_duration(client: TestClient) -> None:
    d = _domain(client)
    run = _type(client, d)
    obj = _project(client, d)

    resp = client.put(
        f"/projects/{obj}/activity-types/{run}",
        json={"planning": "daily", "slot_start": "18:30:00"},
    )
    assert resp.status_code == 422


# --- Posé, pas reposé ---------------------------------------------------------


def test_preparing_twice_poses_nothing_twice(client: TestClient) -> None:
    d = _domain(client)
    run = _type(client, d)
    obj = _project(client, d)
    _link(client, obj, run)

    _prepare(client, _day(10))
    _prepare(client, _day(10))

    assert len(_posed(client, run, TODAY, _day(10))) == 11


def test_a_deleted_occurrence_does_not_come_back(client: TestClient) -> None:
    d = _domain(client)
    run = _type(client, d)
    obj = _project(client, d)
    _link(client, obj, run)
    (first,) = _posed(client, run, TODAY, TODAY)

    client.delete(f"/activities/{first['id']}")
    _prepare(client, _day(10))

    assert _posed(client, run, TODAY, TODAY) == []


def test_keeping_the_existing_applies_after_what_is_posed(client: TestClient) -> None:
    """« Conserver l'existant » (défaut) : ce qui est posé reste, la nouvelle
    planification vaut au-delà."""
    d = _domain(client)
    run = _type(client, d)
    obj = _project(client, d)
    _link(client, obj, run)
    _prepare(client, _day(6))

    _link(client, obj, run, planning="weekly", weekdays=[_day(10).weekday()])
    _prepare(client, _day(13))

    assert _days(_posed(client, run, TODAY, _day(13))) == [
        *[_day(i) for i in range(7)],
        _day(10),
    ]


def test_starting_over_replaces_what_is_posed_from_tomorrow(
    client: TestClient,
) -> None:
    """« Repartir de zéro » : ce qui est posé à partir de demain est retiré,
    puis reposé aussitôt avec la nouvelle planification, jusqu'au même niveau."""
    d = _domain(client)
    run = _type(client, d)
    obj = _project(client, d)
    _link(client, obj, run)
    _prepare(client, _day(6))
    target = _day(3).weekday()

    resp = client.put(
        f"/projects/{obj}/activity-types/{run}",
        params={"reset": True},
        json={"planning": "weekly", "weekdays": [target]},
    )

    assert resp.status_code == 200
    assert _days(_posed(client, run, TODAY, _day(6))) == [TODAY, _day(3)]


# --- Le repli du domaine ------------------------------------------------------


def test_an_active_fallback_poses_without_project(client: TestClient) -> None:
    d = _domain(client)
    menage = _type(
        client,
        d,
        "Ménage",
        fallback_active=True,
        fallback_planning="weekly",
        fallback_weekdays=[_day(2).weekday()],
    )

    _prepare(client, _day(9))

    acts = _posed(client, menage, TODAY, _day(9))
    assert _days(acts) == [_day(2), _day(9)]
    assert all(a["projects"] == [] for a in acts)


def test_the_fallback_steps_aside_while_an_project_carries_the_type(
    client: TestClient,
) -> None:
    """Jamais en plus d'un lien de projet : le repli ne pose que les jours où
    aucun projet ouvert ne porte l'activité type."""
    d = _domain(client)
    run = _type(client, d)
    obj = _project(client, d, start_at=str(_day(-10)), due_at=str(_day(2)))
    _link(client, obj, run, planning="weekly", weekdays=[_day(1).weekday()])
    client.patch(
        f"/activity-types/{run}",
        json={"fallback_active": True, "fallback_planning": "daily"},
    )

    _prepare(client, _day(4))

    acts = _posed(client, run, TODAY, _day(4))
    by_day = {date.fromisoformat(a["start_at"][:10]): project_ids(a) for a in acts}
    assert by_day == {_day(1): [obj], _day(3): [], _day(4): []}


def test_preserving_after_the_project_continues_in_the_domain(
    client: TestClient,
) -> None:
    """« Préserver après le projet » : à la clôture, la planification du lien
    continue dans le domaine."""
    d = _domain(client)
    run = _type(client, d)
    obj = _project(client, d, start_at=str(_day(-10)), due_at=str(_day(1)))
    _link(client, obj, run, preserve_after=True)

    _prepare(client, _day(3))

    acts = _posed(client, run, TODAY, _day(3))
    by_day = {date.fromisoformat(a["start_at"][:10]): project_ids(a) for a in acts}
    assert by_day == {TODAY: [obj], _day(1): [obj], _day(2): [], _day(3): []}


def test_abandoning_hands_the_planning_over_to_the_domain(
    client: TestClient,
) -> None:
    """À l'abandon, le repli reprend aussitôt la planification du lien
    préservé : il s'allume avec ses jours, et la préservation retombe."""
    d = _domain(client)
    run = _type(client, d)
    obj = _project(client, d, start_at=str(_day(-10)), due_at=str(_day(30)))
    _link(client, obj, run, planning="weekly", weekdays=[0, 3], preserve_after=True)

    before = client.get(f"/activity-types/{run}").json()
    assert before["fallback_active"] is False

    client.patch(f"/projects/{obj}", json={"status": "abandoned"})

    after = client.get(f"/activity-types/{run}").json()
    assert after["fallback_active"] is True
    assert after["fallback_planning"] == "weekly"
    assert after["fallback_weekdays"] == [0, 3]
    (link,) = client.get(f"/projects/{obj}").json()["activity_types"]
    assert link["preserve_after"] is False


def test_an_project_past_its_end_hands_over_at_the_next_preparation(
    client: TestClient,
) -> None:
    """Une clôture sans geste (l'échéance passée) passe la main à la
    préparation suivante, sans reposer ce que la continuation a posé."""
    d = _domain(client)
    run = _type(client, d)
    obj = _project(client, d, start_at=str(_day(-10)), due_at=str(_day(-1)))
    _link(client, obj, run, preserve_after=True)

    _prepare(client, _day(3))

    fallback = client.get(f"/activity-types/{run}").json()
    assert fallback["fallback_active"] is True
    assert fallback["fallback_planning"] == "daily"
    assert _days(_posed(client, run, TODAY, _day(3))) == [
        TODAY,
        _day(1),
        _day(2),
        _day(3),
    ]


def test_a_handed_over_planning_stops_with_the_fallback(client: TestClient) -> None:
    """Passée au domaine, la planification se règle par le repli : l'éteindre
    l'arrête, le lien préservé ne la rallume pas."""
    d = _domain(client)
    run = _type(client, d)
    obj = _project(client, d, start_at=str(_day(-10)), due_at=str(_day(30)))
    _link(client, obj, run, preserve_after=True)
    client.patch(f"/projects/{obj}", json={"status": "abandoned"})

    client.patch(f"/activity-types/{run}", json={"fallback_active": False})
    _prepare(client, _day(20))

    assert client.get(f"/activity-types/{run}").json()["fallback_active"] is False
    posed = _posed(client, run, TODAY, _day(20))
    assert all(date.fromisoformat(a["start_at"][:10]) <= _day(6) for a in posed)


def test_removing_and_continuing_in_the_domain_lights_the_fallback(
    client: TestClient,
) -> None:
    d = _domain(client)
    run = _type(client, d)
    obj = _project(client, d)
    _link(client, obj, run, planning="weekly", weekdays=[_day(2).weekday()])
    _prepare(client, _day(6))

    resp = client.delete(
        f"/projects/{obj}/activity-types/{run}", params={"then_domain": True}
    )
    _prepare(client, _day(9))

    assert resp.status_code == 200
    fallback = client.get(f"/activity-types/{run}").json()
    assert fallback["fallback_active"] is True
    assert fallback["fallback_weekdays"] == [_day(2).weekday()]
    # Ce qui était posé reste avec son projet ; la suite est au domaine.
    acts = _posed(client, run, TODAY, _day(9))
    assert [project_ids(a) for a in acts] == [[obj], []]


def test_continuing_a_slotted_link_does_not_double_the_posed_days(
    client: TestClient,
) -> None:
    """Le repli repart au lendemain de ce que le lien retiré a posé : un jour
    qui a déjà son bloc ne reçoit pas en plus une case du jour."""
    d = _domain(client)
    run = _type(client, d)
    obj = _project(client, d)
    _link(client, obj, run, slot_start="18:30:00", slot_minutes=45)
    _prepare(client, _day(3))
    # Le lien a pu poser au-delà (la semaine en cours est préparée d'office).
    last = date.fromisoformat(client.get("/planning/level").json()["posed_until"])
    after = last + timedelta(days=1)

    resp = client.delete(
        f"/projects/{obj}/activity-types/{run}", params={"then_domain": True}
    )
    _prepare(client, after + timedelta(days=1))

    assert resp.status_code == 200
    acts = _posed(client, run, TODAY, after + timedelta(days=1))
    by_day: dict[date, list] = {}
    for a in acts:
        by_day.setdefault(date.fromisoformat(a["start_at"][:10]), []).append(
            (a["all_day"], project_ids(a))
        )
    assert all(len(v) == 1 for v in by_day.values())
    assert by_day[last] == [(False, [obj])]
    assert by_day[after] == [(True, [])]


def test_only_a_daily_day_case_goes_to_the_daily_row(client: TestClient) -> None:
    """La rangée « quotidien » n'accueille que les cases d'une planification
    quotidienne ; une case hebdomadaire se lit avec les activités du jour."""
    d = _domain(client)
    run = _type(client, d, "Run")
    yoga = _type(client, d, "Yoga")
    obj = _project(client, d)
    _link(client, obj, run)
    _link(client, obj, yoga, planning="weekly", weekdays=[TODAY.weekday()])
    _prepare(client, TODAY)

    assert [a["daily"] for a in _posed(client, run, TODAY, TODAY)] == [True]
    assert [a["daily"] for a in _posed(client, yoga, TODAY, TODAY)] == [False]


def test_a_daily_fallback_case_is_daily_and_ghosts_say_so(
    client: TestClient,
) -> None:
    d = _domain(client)
    run = _type(client, d, "Run", fallback_active=True, fallback_planning="daily")
    swim = _type(
        client,
        d,
        "Swim",
        fallback_active=True,
        fallback_planning="weekly",
        fallback_weekdays=list(range(7)),
    )
    _prepare(client, TODAY)

    assert [a["daily"] for a in _posed(client, run, TODAY, TODAY)] == [True]
    assert [a["daily"] for a in _posed(client, swim, TODAY, TODAY)] == [False]
    level = date.fromisoformat(client.get("/planning/level").json()["posed_until"])
    ghosts = client.get(
        "/planning/preview",
        params={"start": str(TODAY), "end": str(level + timedelta(days=2))},
    ).json()
    daily = {g["activity_type_id"]: g["daily"] for g in ghosts}
    assert daily == {run: True, swim: False}


# --- Les fantômes -------------------------------------------------------------


def test_the_preview_sees_beyond_what_is_posed_without_writing(
    client: TestClient,
) -> None:
    d = _domain(client)
    run = _type(client, d)
    obj = _project(client, d, due_at=str(_day(60)))
    _link(client, obj, run, planning="weekly", weekdays=[TODAY.weekday()])
    level = date.fromisoformat(client.get("/planning/level").json()["posed_until"])

    ghosts = client.get(
        "/planning/preview",
        params={"start": str(TODAY), "end": str(_day(15))},
    ).json()
    # Le rituel de semaine a ses propres fantômes (cf. test_preparations).
    ghosts = [g for g in ghosts if g["activity_type_id"] == run]

    assert [g["start_at"][:10] for g in ghosts] == [str(_day(7)), str(_day(14))]
    assert all(date.fromisoformat(g["start_at"][:10]) > level for g in ghosts)
    assert ghosts[0]["projects"] == [{"project_id": obj, "step_id": None}]
    assert _posed(client, run, _day(7), _day(15)) == []
