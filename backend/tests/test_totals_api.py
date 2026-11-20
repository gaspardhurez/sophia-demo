"""Tests de l'objectif **Total** — Volume et Régularité réunifiés (24/09/2026).

La régularité n'a jamais mesuré de rythme : elle comptait les occurrences faites
d'une habitude contre une cible — un total au nombre de fois. Un Total dit donc
trois choses : comment il compte (valeur déclarée, durée lue, nombre), ce qu'il
compte (certaines activités types et/ou les séances d'apprentissage, ou toutes
les activités du projet — #37), et sa cible.

Ce qui se vérifie ici, c'est surtout ce que la réunification règle : plusieurs
Totaux sur un même projet, un choix de périmètre explicite qui ne bascule
jamais tout seul, et des valeurs qui disent leur unité.
"""

from datetime import date, datetime, timedelta

from fastapi.testclient import TestClient

from tests.helpers import project_payload

J0 = date.today()


def _day(offset: int = 0) -> str:
    return (J0 + timedelta(days=offset)).isoformat()


def _at(offset: int, hour: int) -> str:
    return (
        datetime.combine(J0 + timedelta(days=offset), datetime.min.time())
        .replace(hour=hour)
        .isoformat()
    )


def _domain(client: TestClient, name: str = "Sport") -> str:
    return client.post("/domains", json={"name": name}).json()["id"]


def _unit(client: TestClient, name: str) -> str:
    return client.post("/units", json={"name": name}).json()["id"]


def _type(client: TestClient, domain_id: str, title: str) -> str:
    payload = {"domain_id": domain_id, "title": title}
    resp = client.post("/activity-types", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _project(client: TestClient, domain_id: str, **body) -> str:
    payload = project_payload("Saison", **body)
    return client.post(f"/domains/{domain_id}/projects", json=payload).json()["id"]


def _total(client: TestClient, project_id: str, **body) -> dict:
    resp = client.post(f"/projects/{project_id}/totals", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()["totals"][-1]


def _activity(client: TestClient, domain_id: str, project_id: str, **body) -> dict:
    payload = {
        "domain_id": domain_id,
        "projects": [{"project_id": project_id}],
        "title": "Séance",
        "done": True,
        **body,
    }
    resp = client.post("/activities", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _read(client: TestClient, project_id: str) -> dict:
    return client.get(f"/projects/{project_id}").json()


def _only_total(client: TestClient, project_id: str) -> dict:
    (total,) = _read(client, project_id)["totals"]
    return total


# --- Trois façons de compter ---


def test_a_value_total_sums_what_activities_declare(client: TestClient) -> None:
    d = _domain(client)
    km = _unit(client, "km")
    obj = _project(client, d)
    _total(client, obj, mode="value", unit_id=km, target=300)

    _activity(client, d, obj, values=[{"unit_id": km, "value": 12}])
    _activity(client, d, obj, values=[{"unit_id": km, "value": 6.5}])

    assert _only_total(client, obj)["progress"] == 18.5


def test_a_value_total_ignores_other_units(client: TestClient) -> None:
    """Une sortie déclare « 10 km » et « 200 m de D+ » : le Total en km ne
    prend que les km. C'est ce que la valeur sans unité ne pouvait pas dire."""
    d = _domain(client)
    km, dplus = _unit(client, "km"), _unit(client, "m D+")
    obj = _project(client, d)
    _total(client, obj, mode="value", unit_id=km, target=300)

    _activity(
        client,
        d,
        obj,
        values=[{"unit_id": km, "value": 10}, {"unit_id": dplus, "value": 200}],
    )

    assert _only_total(client, obj)["progress"] == 10


def test_a_duration_total_reads_the_calendar(client: TestClient) -> None:
    """La durée ne se déclare pas : fin − début, en heures."""
    d = _domain(client)
    obj = _project(client, d)
    _total(client, obj, mode="duration", target=25)

    _activity(client, d, obj, start_at=_at(0, 9), end_at=_at(0, 11))
    _activity(client, d, obj, start_at=_at(1, 14), end_at=_at(1, 15))

    assert _only_total(client, obj)["progress"] == 3


def test_resizing_a_session_moves_the_duration(client: TestClient) -> None:
    """Le bug trouvé à l'usage : rallonger une activité au calendrier n'envoie
    que `end_at`. La durée se lit à chaque fois, la barre suit donc toujours."""
    d = _domain(client)
    obj = _project(client, d)
    _total(client, obj, mode="duration", target=25)
    a = _activity(client, d, obj, start_at=_at(0, 10), end_at=_at(0, 12))

    client.patch(f"/activities/{a['id']}", json={"end_at": _at(0, 13)})

    assert _only_total(client, obj)["progress"] == 3


def test_an_all_day_activity_has_no_duration(client: TestClient) -> None:
    """Sans horaires, pas de durée à lire : elle compte zéro. Effet assumé."""
    d = _domain(client)
    obj = _project(client, d)
    _total(client, obj, mode="duration", target=25)

    _activity(client, d, obj, all_day=True, start_at=_at(0, 0), end_at=_at(0, 0))

    assert _only_total(client, obj)["progress"] == 0


def test_a_count_total_counts_done_activities(client: TestClient) -> None:
    d = _domain(client, "Musculation")
    lift = _type(client, d, "Lift")
    obj = _project(client, d)
    _total(client, obj, mode="count", target=40, activity_type_ids=[lift])

    for _ in range(3):
        _activity(client, d, obj, activity_type_id=lift)
    _activity(client, d, obj, activity_type_id=lift, done=False, start_at=_at(1, 9))

    total = _only_total(client, obj)
    assert total["progress"] == 3


def test_the_unit_goes_with_the_value_mode_only(client: TestClient) -> None:
    d = _domain(client)
    km = _unit(client, "km")
    obj = _project(client, d)

    sans_unite = client.post(
        f"/projects/{obj}/totals", json={"mode": "value", "target": 10}
    )
    unite_en_trop = client.post(
        f"/projects/{obj}/totals",
        json={"mode": "duration", "unit_id": km, "target": 10},
    )

    assert sans_unite.status_code == 422
    assert unite_en_trop.status_code == 422


def test_a_duration_unit_does_not_count_a_value_total(client: TestClient) -> None:
    """Une durée se lit au calendrier (Total en durée) : l'API refuse ce que le
    menu du Total exclut déjà."""
    d = _domain(client)
    minute = client.post(
        "/units", json={"name": "minute", "seconds_per_unit": 60}
    ).json()["id"]
    obj = _project(client, d)

    created = client.post(
        f"/projects/{obj}/totals",
        json={"mode": "value", "unit_id": minute, "target": 600},
    )
    total = _total(client, obj, mode="value", unit_id=_unit(client, "km"), target=5)
    patched = client.patch(f"/totals/{total['id']}", json={"unit_id": minute})

    assert created.status_code == 422
    assert "durée" in created.json()["detail"]
    assert patched.status_code == 422
    assert _only_total(client, obj)["unit"]["name"] == "km"


# --- Ce qu'il compte : un choix explicite ---


def test_without_a_filter_a_total_counts_everything(client: TestClient) -> None:
    d = _domain(client)
    obj = _project(client, d)
    _total(client, obj, mode="count", target=10)

    _activity(client, d, obj)
    _activity(client, d, obj, activity_type_id=_type(client, d, "Run"))

    assert _only_total(client, obj)["progress"] == 2


def test_listing_types_restricts_the_total(client: TestClient) -> None:
    """« 50 h sur le court » : une séance d'étude rattachée au même projet
    reste visible dans son calendrier, sans peser sur la barre."""
    d = _domain(client, "Tennis")
    tennis = _type(client, d, "Tennis")
    obj = _project(client, d)
    _total(client, obj, mode="duration", target=50, activity_type_ids=[tennis])

    _activity(
        client, d, obj, activity_type_id=tennis, start_at=_at(0, 9), end_at=_at(0, 11)
    )
    _activity(client, d, obj, title="Étude", start_at=_at(1, 9), end_at=_at(1, 10))

    assert _only_total(client, obj)["progress"] == 2


def test_counting_a_type_links_it_to_the_project(client: TestClient) -> None:
    """Le « sur » ne compte que des activités types du projet : une absente
    y est liée au passage, en planification Manuelle (rien n'est généré)."""
    d = _domain(client)
    run = _type(client, d, "Run")
    obj = _project(client, d)

    _total(client, obj, mode="count", target=10, activity_type_ids=[run])

    links = _read(client, obj)["activity_types"]
    assert [(link["activity_type_id"], link["planning"]) for link in links] == [
        (run, "manual")
    ]


def test_learning_sessions_count_in_bloc(client: TestClient) -> None:
    """« sur Séances d'apprentissage » : les activités qui travaillent un
    savoir, cumulables avec des activités types (#37, §5)."""
    d = _domain(client, "Escalade")
    kite = _type(client, d, "Escalade")
    skill = client.post(f"/domains/{d}/skills", json={"name": "Water start"}).json()
    obj = _project(client, d)
    _total(
        client,
        obj,
        mode="count",
        target=10,
        activity_type_ids=[kite],
        learning_sessions=True,
    )

    _activity(client, d, obj, activity_type_id=kite)
    _activity(client, d, obj, acts=[{"skill_id": skill["id"], "kind": "study"}])
    _activity(client, d, obj, title="Autre")

    assert _only_total(client, obj)["progress"] == 2


def test_removing_the_only_counted_type_deletes_the_total(client: TestClient) -> None:
    """Retirer l'activité type retire du « sur » ; un Total qui ne comptait
    qu'elle est supprimé, jamais basculé sur « toutes les activités » en
    silence (remplace le refus de délier)."""
    d = _domain(client)
    run, lift = _type(client, d, "Run"), _type(client, d, "Lift")
    obj = _project(client, d)
    _total(client, obj, mode="count", target=10, activity_type_ids=[run])
    both = _total(client, obj, mode="count", target=20, activity_type_ids=[run, lift])

    resp = client.delete(f"/projects/{obj}/activity-types/{run}")

    assert resp.status_code == 200
    totals = resp.json()["totals"]
    assert [t["id"] for t in totals] == [both["id"]]
    assert totals[0]["activity_type_ids"] == [lift]


# --- Plusieurs Totaux, un statut ---


def test_an_project_carries_several_totals(client: TestClient) -> None:
    """Ce qu'aucun des deux anciens axes ne permettait : « 25 dodos » et
    « 20 marches », ou 300 km et 40 h, sur un même projet."""
    d = _domain(client, "Bien-être")
    dodo, marche = _type(client, d, "Dodo"), _type(client, d, "Marche")
    obj = _project(client, d)

    _total(client, obj, mode="count", target=25, activity_type_ids=[dodo])
    _total(client, obj, mode="count", target=20, activity_type_ids=[marche])

    totals = _read(client, obj)["totals"]
    assert [t["target"] for t in totals] == [25, 20]
    assert [t["position"] for t in totals] == [0, 1]


def test_every_total_conditions_the_status(client: TestClient) -> None:
    d = _domain(client)
    obj = _project(client, d)
    _total(client, obj, mode="count", target=1)
    _total(client, obj, mode="count", target=2)

    _activity(client, d, obj)
    assert _read(client, obj)["status"] != "achieved"

    _activity(client, d, obj)
    assert _read(client, obj)["status"] == "achieved"


def test_a_total_makes_the_project_tracked(client: TestClient) -> None:
    d = _domain(client)
    obj = _project(client, d)
    assert _read(client, obj)["is_tracked"] is False

    _total(client, obj, mode="count", target=5)

    assert _read(client, obj)["is_tracked"] is True


def test_leaving_the_value_mode_drops_the_unit(client: TestClient) -> None:
    d = _domain(client)
    obj = _project(client, d)
    total = _total(client, obj, mode="value", unit_id=_unit(client, "km"), target=9)

    resp = client.patch(f"/totals/{total['id']}", json={"mode": "duration"})

    assert resp.status_code == 200, resp.text
    assert resp.json()["totals"][0]["unit"] is None


def test_a_patch_is_checked_on_the_resulting_total(client: TestClient) -> None:
    """Un PATCH ne connaît pas ce qu'il ne touche pas : retirer l'unité d'un
    Total en valeur le laisserait incohérent une fois appliqué."""
    d = _domain(client)
    obj = _project(client, d)
    total = _total(client, obj, mode="value", unit_id=_unit(client, "km"), target=9)

    resp = client.patch(f"/totals/{total['id']}", json={"unit_id": None})

    assert resp.status_code == 422


# --- Les étapes distribuent des tranches ---


def _step(client: TestClient, project_id: str, title: str = "Mois 1") -> str:
    resp = client.post(f"/projects/{project_id}/steps", json={"title": title})
    return resp.json()["steps"][-1]["id"]


def test_a_step_takes_a_slice_of_a_total(client: TestClient) -> None:
    d = _domain(client)
    obj = _project(client, d)
    total = _total(client, obj, mode="count", target=30)
    step = _step(client, obj)

    resp = client.put(
        f"/steps/{step}/totals", json={"total_id": total["id"], "target": 10}
    )

    assert resp.status_code == 200, resp.text
    (share,) = resp.json()["steps"][0]["totals"]
    assert share["target"] == 10
    assert resp.json()["steps"][0]["is_manual"] is False


def test_slices_cannot_exceed_the_total(client: TestClient) -> None:
    d = _domain(client)
    obj = _project(client, d)
    total = _total(client, obj, mode="count", target=30)
    one, two = _step(client, obj, "Mois 1"), _step(client, obj, "Mois 2")

    client.put(f"/steps/{one}/totals", json={"total_id": total["id"], "target": 20})
    resp = client.put(
        f"/steps/{two}/totals", json={"total_id": total["id"], "target": 11}
    )

    assert resp.status_code == 422


def test_lowering_a_total_below_its_slices_is_refused(client: TestClient) -> None:
    """Même règle que la tranche, vue de l'autre bout : la cible ne passe pas
    sous la somme de ses tranches."""
    d = _domain(client)
    obj = _project(client, d)
    total = _total(client, obj, mode="count", target=30)
    one, two = _step(client, obj, "Mois 1"), _step(client, obj, "Mois 2")
    client.put(f"/steps/{one}/totals", json={"total_id": total["id"], "target": 10})
    client.put(f"/steps/{two}/totals", json={"total_id": total["id"], "target": 10})

    too_low = client.patch(f"/totals/{total['id']}", json={"target": 19})
    just_enough = client.patch(f"/totals/{total['id']}", json={"target": 20})

    assert too_low.status_code == 422
    assert "tranches" in too_low.json()["detail"]
    assert just_enough.status_code == 200, just_enough.text
    assert _only_total(client, obj)["target"] == 20


def test_a_step_cannot_slice_another_projects_total(client: TestClient) -> None:
    d = _domain(client)
    ailleurs = _total(client, _project(client, d), mode="count", target=5)
    step = _step(client, _project(client, d))

    resp = client.put(
        f"/steps/{step}/totals", json={"total_id": ailleurs["id"], "target": 1}
    )

    assert resp.status_code == 422


def test_deleting_a_total_removes_its_slices(client: TestClient) -> None:
    d = _domain(client)
    obj = _project(client, d)
    total = _total(client, obj, mode="count", target=30)
    step = _step(client, obj)
    client.put(f"/steps/{step}/totals", json={"total_id": total["id"], "target": 10})

    body = client.delete(f"/totals/{total['id']}").json()

    assert body["totals"] == []
    assert body["steps"][0]["totals"] == []


# --- Les valeurs déclarées sur une activité ---


def test_an_activity_declares_one_value_per_unit(client: TestClient) -> None:
    d = _domain(client)
    km = _unit(client, "km")

    resp = client.post(
        "/activities",
        json={
            "domain_id": d,
            "title": "Sortie",
            "values": [{"unit_id": km, "value": 1}, {"unit_id": km, "value": 2}],
        },
    )

    assert resp.status_code == 422


def test_updating_values_replaces_the_list(client: TestClient) -> None:
    d = _domain(client)
    km, dplus = _unit(client, "km"), _unit(client, "m D+")
    activity = client.post(
        "/activities",
        json={
            "domain_id": d,
            "title": "Sortie",
            "values": [{"unit_id": km, "value": 1}],
        },
    ).json()

    body = client.patch(
        f"/activities/{activity['id']}",
        json={"values": [{"unit_id": dplus, "value": 200}]},
    ).json()

    assert [(v["unit"]["name"], v["value"]) for v in body["values"]] == [("m D+", 200)]


def test_a_partial_patch_keeps_the_values(client: TestClient) -> None:
    """Cocher une séance ne doit pas effacer ce qu'on y a déclaré."""
    d = _domain(client)
    km = _unit(client, "km")
    activity = client.post(
        "/activities",
        json={
            "domain_id": d,
            "title": "Sortie",
            "values": [{"unit_id": km, "value": 8}],
        },
    ).json()

    body = client.patch(f"/activities/{activity['id']}", json={"done": True}).json()

    assert [v["value"] for v in body["values"]] == [8]


# ── Le mot d'un Total au nombre (#58) ───────────────────────────────────────


def test_a_count_total_says_fois_until_named(client: TestClient) -> None:
    obj = _project(client, _domain(client))
    total = _total(client, obj, mode="count", target=30)
    assert total["count_name"] is None
    assert total["count_effective_plural"] is None
    assert total["count_emoji"] is None


def test_a_count_total_takes_its_own_word(client: TestClient) -> None:
    obj = _project(client, _domain(client))
    total = _total(client, obj, mode="count", target=30)
    resp = client.patch(
        f"/totals/{total['id']}",
        json={"count_name": " nuit ", "count_emoji": "💤"},
    )
    assert resp.status_code == 200, resp.text
    read = resp.json()["totals"][0]
    assert read["count_name"] == "nuit"
    assert read["count_plural"] is None
    assert read["count_effective_plural"] == "nuits"
    assert read["count_emoji"] == "💤"


def test_the_plural_is_kept_for_words_ending_in_s_x_z(client: TestClient) -> None:
    obj = _project(client, _domain(client))
    total = _total(client, obj, mode="count", target=3)
    resp = client.patch(f"/totals/{total['id']}", json={"count_name": "prix"})
    assert resp.json()["totals"][0]["count_effective_plural"] == "prix"


def test_a_typed_plural_wins(client: TestClient) -> None:
    obj = _project(client, _domain(client))
    total = _total(client, obj, mode="count", target=3)
    resp = client.patch(
        f"/totals/{total['id']}",
        json={"count_name": "cheval", "count_plural": "chevaux"},
    )
    assert resp.json()["totals"][0]["count_effective_plural"] == "chevaux"


def test_going_back_to_fois_clears_the_word(client: TestClient) -> None:
    obj = _project(client, _domain(client))
    total = _total(client, obj, mode="count", target=3)
    client.patch(
        f"/totals/{total['id']}",
        json={"count_name": "leçon", "count_plural": "leçons", "count_emoji": "👨‍🏫"},
    )
    resp = client.patch(
        f"/totals/{total['id']}",
        json={"count_name": None, "count_plural": None, "count_emoji": None},
    )
    read = resp.json()["totals"][0]
    assert (read["count_name"], read["count_plural"], read["count_emoji"]) == (
        None,
        None,
        None,
    )


def test_leaving_count_mode_drops_the_word(client: TestClient) -> None:
    obj = _project(client, _domain(client))
    total = _total(client, obj, mode="count", target=3)
    client.patch(
        f"/totals/{total['id']}", json={"count_name": "séance", "count_emoji": "🎾"}
    )
    resp = client.patch(f"/totals/{total['id']}", json={"mode": "duration"})
    read = resp.json()["totals"][0]
    assert read["count_name"] is None
    assert read["count_emoji"] is None


def test_the_word_belongs_to_one_total(client: TestClient) -> None:
    obj = _project(client, _domain(client))
    first = _total(client, obj, mode="count", target=3)
    _total(client, obj, mode="count", target=5)
    resp = client.patch(f"/totals/{first['id']}", json={"count_name": "nuit"})
    totals = resp.json()["totals"]
    assert [t["count_name"] for t in totals] == ["nuit", None]


def test_an_interro_counts_by_the_usual_rules(client: TestClient) -> None:
    """L'interro est un acte (#85, point 3) : c'est l'activité qui la porte qui
    compte, aux règles habituelles. « Jamais ratée » ne vaut qu'à l'affichage :
    elle ne compte au réel que cochée."""
    d = _domain(client, "Tennis")
    skill = client.post(f"/domains/{d}/skills", json={"name": "Volée"}).json()["id"]
    client.post(
        f"/skills/{skill}/note-questions",
        json={"kind": "factual", "prompt": "Prise ?", "answer": "Continentale"},
    )
    plan = client.post(f"/skills/{skill}/plans", json={"state": "active"}).json()
    launched = client.post(f"/plans/{plan['id']}/recall/launch", json={})
    assert launched.status_code == 200
    obj = _project(client, d)
    _total(client, obj, mode="count", target=10, learning_sessions=True)
    recall = [{"skill_id": skill, "plan_id": plan["id"], "kind": "recall"}]

    late = _activity(
        client,
        d,
        obj,
        done=False,
        start_at=_at(-2, 9),
        end_at=_at(-2, 10),
        acts=recall,
    )

    total = _only_total(client, obj)
    assert total["progress"] == 0

    client.patch(f"/activities/{late['id']}", json={"done": True})
    total = _only_total(client, obj)
    assert total["progress"] == 1

    client.patch(
        f"/activities/{late['id']}",
        json={"done": False, "start_at": _at(2, 9), "end_at": _at(2, 10)},
    )
    total = _only_total(client, obj)
    assert total["progress"] == 0
