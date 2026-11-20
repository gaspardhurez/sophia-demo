"""Tests du cycle d'acquisition (V4, refondu le 01/10/2026) — plusieurs prévus,
un seul en cours, rattaché à ses projets, une rampe par cycle, plus de clôture
automatique, le constat."""

from datetime import date

from fastapi.testclient import TestClient

from tests.helpers import project_payload


def _domain(client: TestClient, name: str = "Tennis") -> str:
    return client.post("/domains", json={"name": name}).json()["id"]


def _skill(client: TestClient, domain_id: str, name: str = "Chandelle", **body) -> str:
    resp = client.post(f"/domains/{domain_id}/skills", json={"name": name, **body})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _plan(client: TestClient, skill_id: str, **body) -> dict:
    resp = client.post(f"/skills/{skill_id}/plans", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _plans(client: TestClient, skill_id: str) -> list[dict]:
    return client.get(f"/skills/{skill_id}/plans").json()


def _item(client: TestClient, skill_id: str, **body) -> dict:
    payload = {"title": "Panier", **body}
    resp = client.post(f"/skills/{skill_id}/practice", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _status(client: TestClient, skill_id: str) -> str:
    return client.get(f"/skills/{skill_id}").json()["status"]


def _project(client: TestClient, domain_id: str, title: str = "Tournoi", **body):
    resp = client.post(
        f"/domains/{domain_id}/projects", json=project_payload(title, **body)
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _project_status(client: TestClient, project_id: str) -> str:
    return client.get(f"/projects/{project_id}").json()["status"]


def _ramp(plan: dict) -> list[str]:
    return [x["item_id"] for x in sorted(plan["items"], key=lambda x: x["rank"])]


# --- Prévoir, commencer ---


def test_a_cycle_is_born_with_study_practice_and_application(
    client: TestClient,
) -> None:
    """Un seul réglage de naissance : Étude, Pratique, Application ; la
    Rétention éteinte. Prévoir ne change rien au statut."""
    d = _domain(client)
    s = _skill(client, d)

    plan = _plan(client, s)

    assert plan["state"] == "draft"
    assert (plan["study"], plan["isolated"], plan["situation"]) == (True, True, True)
    assert plan["retention"] is False
    assert _status(client, s) == "not_started"


def test_several_cycles_can_be_planned(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d)

    _plan(client, s, target_level="Geste défensif")
    _plan(client, s, target_level="Vers la grille")

    assert [p["state"] for p in _plans(client, s)] == ["draft", "draft"]


def test_opening_puts_the_skill_in_progress(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d)
    plan = _plan(client, s)

    opened = client.post(f"/plans/{plan['id']}/open").json()

    assert opened["state"] == "active"
    assert opened["opened_at"] is not None
    assert _status(client, s) == "in_progress"


def test_only_one_cycle_in_progress(client: TestClient) -> None:
    """Prévoir est toujours permis ; commencer un second cycle ne l'est pas."""
    d = _domain(client)
    s = _skill(client, d)
    _plan(client, s, state="active")
    planned = _plan(client, s)

    assert client.post(f"/plans/{planned['id']}/open").status_code == 422
    assert client.post(f"/skills/{s}/plans", json={"state": "active"}).status_code == (
        422
    )


def test_opening_a_cycle_proposes_no_recall_any_more(client: TestClient) -> None:
    """L'interro n'est plus un objet de la rampe (#81) : ouvrir un cycle qui
    étudie ne crée rien dans la bibliothèque ; sa courbe vit sur le cycle."""
    d = _domain(client)
    s = _skill(client, d)
    plan = _plan(client, s)
    drill = _item(client, s, plan_id=plan["id"])

    opened = client.post(f"/plans/{plan['id']}/open").json()

    assert _ramp(opened) == [drill["id"]]
    assert [i["id"] for i in client.get(f"/skills/{s}/practice").json()] == [
        drill["id"]
    ]


def test_a_cycle_without_study_proposes_no_recall(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d)
    plan = _plan(client, s, study=False)

    opened = client.post(f"/plans/{plan['id']}/open").json()

    assert opened["items"] == []
    assert client.get(f"/skills/{s}/practice").json() == []


# --- La rampe d'un cycle ---


def test_an_item_spotted_without_cycle_stays_in_the_library(
    client: TestClient,
) -> None:
    d = _domain(client)
    s = _skill(client, d)
    plan = _plan(client, s)

    _item(client, s)

    assert _plans(client, s)[0]["items"] == []
    assert plan["items"] == []


def test_an_item_created_in_a_cycle_lands_at_the_end_of_its_ramp(
    client: TestClient,
) -> None:
    d = _domain(client)
    s = _skill(client, d)
    plan = _plan(client, s)
    a = _item(client, s, title="A", plan_id=plan["id"])
    b = _item(client, s, title="B", plan_id=plan["id"])
    app = _item(client, s, title="Match", nature="situation", plan_id=plan["id"])

    ramp = {x["item_id"]: x["rank"] for x in _plans(client, s)[0]["items"]}

    assert (ramp[a["id"]], ramp[b["id"]], ramp[app["id"]]) == (0, 1, 0)


def test_a_cycle_picks_from_the_library(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d)
    plan = _plan(client, s)
    item = _item(client, s)

    picked = client.post(f"/plans/{plan['id']}/items", json={"item_id": item["id"]})
    again = client.post(f"/plans/{plan['id']}/items", json={"item_id": item["id"]})

    assert picked.status_code == 200
    assert _ramp(picked.json()) == [item["id"]]
    assert again.status_code == 422


def test_a_cycle_cannot_pick_from_another_skill(client: TestClient) -> None:
    d = _domain(client)
    s, other = _skill(client, d), _skill(client, d, "Volée")
    plan = _plan(client, s)
    foreign = _item(client, other)

    resp = client.post(f"/plans/{plan['id']}/items", json={"item_id": foreign["id"]})

    assert resp.status_code == 422


def test_removing_from_the_cycle_keeps_the_library(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d)
    plan = _plan(client, s)
    item = _item(client, s, plan_id=plan["id"])

    resp = client.delete(f"/plans/{plan['id']}/items/{item['id']}")

    assert resp.json()["items"] == []
    assert [i["id"] for i in client.get(f"/skills/{s}/practice").json()] == [item["id"]]


def test_the_ramp_is_reordered_by_sending_the_whole_list(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d)
    plan = _plan(client, s)
    a = _item(client, s, title="A", plan_id=plan["id"])
    b = _item(client, s, title="B", plan_id=plan["id"])
    c = _item(client, s, title="C", plan_id=plan["id"])

    resp = client.put(
        f"/plans/{plan['id']}/items/order",
        json={"nature": "isolated", "item_ids": [c["id"], a["id"], b["id"]]},
    )
    stale = client.put(
        f"/plans/{plan['id']}/items/order",
        json={"nature": "isolated", "item_ids": [c["id"], a["id"]]},
    )

    assert _ramp(resp.json()) == [c["id"], a["id"], b["id"]]
    assert stale.status_code == 422


def test_each_cycle_has_its_own_verdicts(client: TestClient) -> None:
    """Le verdict est celui du cycle : un second cycle reprend l'exercice
    non réussi."""
    d = _domain(client)
    s = _skill(client, d)
    first = _plan(client, s, state="active", study=False)
    item = _item(client, s, plan_id=first["id"])
    client.patch(f"/plans/{first['id']}/items/{item['id']}", json={"done": True})
    client.post(f"/plans/{first['id']}/complete")

    second = _plan(client, s, study=False)
    second = client.post(
        f"/plans/{second['id']}/items", json={"item_id": item["id"]}
    ).json()

    first_read = next(p for p in _plans(client, s) if p["id"] == first["id"])
    assert first_read["items"][0]["done"] is True
    assert second["items"][0]["done"] is False


def test_a_closed_cycle_is_still_adjusted_but_keeps_its_projects(
    client: TestClient,
) -> None:
    """Clos, un cycle se règle encore — c'est ainsi qu'on remplit un cycle
    déjà terminé —, mais ne change plus de projets ni d'état."""
    d = _domain(client)
    s = _skill(client, d)
    obj = _project(client, d, "Tournoi")
    plan = _plan(client, s, state="active", study=False, project_ids=[obj])
    client.post(f"/plans/{plan['id']}/complete")

    read = client.patch(
        f"/plans/{plan['id']}", json={"study": True, "name": "Les bases"}
    ).json()
    assert (read["study"], read["name"]) == (True, "Les bases")
    item = _item(client, s, plan_id=plan["id"])
    assert [i["item_id"] for i in _plans(client, s)[0]["items"]] == [item["id"]]
    same = client.patch(f"/plans/{plan['id']}", json={"project_ids": [obj]})
    assert same.status_code == 200

    resp = client.patch(f"/plans/{plan['id']}", json={"project_ids": []})
    assert resp.status_code == 422
    assert client.post(f"/plans/{plan['id']}/complete").status_code == 422


def test_sessions_count_per_cycle(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d)
    plan = _plan(client, s, state="active", study=False)
    item = _item(client, s, plan_id=plan["id"])
    act = {"skill_id": s, "kind": "practice", "practice_item_id": item["id"]}
    body = {"domain_id": d, "title": "Passe", "done": True}
    client.post("/activities", json={**body, "acts": [{**act, "plan_id": plan["id"]}]})
    client.post("/activities", json={**body, "acts": [act]})
    # Une activité qui porte deux actes sur l'objet ne compte qu'une passe.
    other = {**act, "kind": "study", "practice_item_id": None}
    client.post("/activities", json={**body, "done": False, "acts": [act, other]})

    read = _plans(client, s)[0]["items"][0]
    library = client.get(f"/skills/{s}/practice").json()[0]

    assert read["sessions"] == 1
    assert library["sessions"] == 2


# --- Satisfaction, pas de clôture automatique ---


def test_validating_the_last_item_does_not_close_the_cycle(
    client: TestClient,
) -> None:
    """Tout validé, le cycle est « à clore » : l'écran propose de terminer,
    rien ne se ferme dans le dos."""
    d = _domain(client)
    s = _skill(client, d)
    plan = _plan(client, s, state="active", study=False, situation=False)
    item = _item(client, s, plan_id=plan["id"])

    read = client.patch(
        f"/plans/{plan['id']}/items/{item['id']}", json={"done": True}
    ).json()

    assert read["state"] == "active"
    assert read["is_satisfied"] is True
    assert (read["done_items"], read["total_items"]) == (1, 1)


def test_an_empty_active_phase_is_not_satisfied(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d)
    plan = _plan(client, s, state="active", study=False)
    item = _item(client, s, plan_id=plan["id"])

    read = client.patch(
        f"/plans/{plan['id']}/items/{item['id']}", json={"done": True}
    ).json()

    # L'Application est activée et vide : il y a du travail.
    assert read["is_satisfied"] is False


def test_finished_study_does_not_count_among_ramp_items(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d)
    plan = _plan(client, s, state="active", situation=False)
    client.post(f"/plans/{plan['id']}/study/validate")
    item = _item(client, s, plan_id=plan["id"])

    read = client.patch(
        f"/plans/{plan['id']}/items/{item['id']}", json={"done": True}
    ).json()

    assert (read["done_items"], read["total_items"]) == (1, 1)
    assert read["is_satisfied"] is True


# --- Terminer, abandonner, reprendre ---


def test_completing_keeps_the_chosen_items_in_retention(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d)
    plan = _plan(client, s, state="active", study=False)
    kept = _item(client, s, title="Gardé", plan_id=plan["id"])
    _item(client, s, title="Pas gardé", plan_id=plan["id"])

    read = client.post(
        f"/plans/{plan['id']}/complete", json={"retention_item_ids": [kept["id"]]}
    ).json()

    assert read["state"] == "completed"
    assert {x["item_id"]: x["in_retention"] for x in read["items"]}[kept["id"]]
    assert sum(x["in_retention"] for x in read["items"]) == 1
    assert _status(client, s) == "acquired"


def test_the_user_can_complete_a_cycle_that_is_not_satisfied(
    client: TestClient,
) -> None:
    d = _domain(client)
    s = _skill(client, d)
    plan = _plan(client, s, state="active")

    assert client.post(f"/plans/{plan['id']}/complete").json()["state"] == ("completed")


def test_an_acquired_cycle_reopens_and_stops_filling_its_project(
    client: TestClient,
) -> None:
    """Le statut d'un cycle est manuel : on revient sur un acquis. Il repasse
    en cours avec ses réussites, et ne remplit plus son projet."""
    d = _domain(client)
    s = _skill(client, d)
    obj = _project(client, d, "Tournoi", skill_ids=[s])
    plan = _plans(client, s)[0]
    item = _item(client, s, plan_id=plan["id"])
    client.post(f"/plans/{plan['id']}/open")
    client.patch(f"/plans/{plan['id']}/items/{item['id']}", json={"done": True})
    client.post(f"/plans/{plan['id']}/complete")
    assert _project_status(client, obj) == "achieved"

    read = client.post(f"/plans/{plan['id']}/reopen").json()

    assert read["state"] == "active"
    assert read["closed_at"] is None
    done = {i["item_id"]: i["done"] for i in read["items"]}
    assert done[item["id"]] is True
    assert _project_status(client, obj) != "achieved"
    assert client.post(f"/plans/{plan['id']}/reopen").status_code == 422


def test_abandoning_closes_without_acquiring(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d)
    plan = _plan(client, s, state="active")

    read = client.post(f"/plans/{plan['id']}/abandon").json()

    assert read["state"] == "abandoned"
    assert read["closed_at"] is not None
    assert _status(client, s) == "not_started"


def test_an_abandoned_cycle_is_taken_back_up(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d)
    plan = _plan(client, s, state="active", target_level="Défense")
    client.post(f"/plans/{plan['id']}/abandon")

    read = client.post(f"/plans/{plan['id']}/reopen").json()

    assert read["state"] == "active"
    assert read["closed_at"] is None
    assert read["target_level"] == "Défense"


def test_taking_back_up_needs_no_cycle_in_progress(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d)
    plan = _plan(client, s, state="active")
    client.post(f"/plans/{plan['id']}/abandon")
    _plan(client, s, state="active")

    assert client.post(f"/plans/{plan['id']}/reopen").status_code == 422


def test_cycles_stack_into_a_mastery_history(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d)
    for level in ("Au panier", "En défense"):
        plan = _plan(client, s, state="active", target_level=level)
        client.post(f"/plans/{plan['id']}/complete")

    assert [p["target_level"] for p in _plans(client, s)] == [
        "Au panier",
        "En défense",
    ]


def test_a_cleared_target_level_is_stored_as_null(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d)
    plan = _plan(client, s, target_level="Défense")

    read = client.patch(f"/plans/{plan['id']}", json={"target_level": "  "}).json()

    assert read["target_level"] is None


def test_a_cycle_takes_an_optional_name_apart_from_its_level(
    client: TestClient,
) -> None:
    d = _domain(client)
    s = _skill(client, d)
    plan = _plan(client, s, target_level="Défense")
    assert plan["name"] is None

    read = client.patch(f"/plans/{plan['id']}", json={"name": "Tournoi de mars"}).json()
    assert (read["name"], read["target_level"]) == ("Tournoi de mars", "Défense")

    read = client.patch(f"/plans/{plan['id']}", json={"name": " "}).json()
    assert read["name"] is None


def test_a_skill_says_whether_a_cycle_is_open(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d)
    assert client.get(f"/skills/{s}").json()["has_open_cycle"] is False

    plan = _plan(client, s)
    assert client.get(f"/skills/{s}").json()["has_open_cycle"] is False

    client.post(f"/plans/{plan['id']}/open")
    assert client.get(f"/skills/{s}").json()["has_open_cycle"] is True


def _session(client: TestClient, d: str, plan: dict, **body) -> dict:
    """Une séance qui sert le cycle : un acte d'étude de son savoir."""
    act = {"skill_id": plan["skill_id"], "kind": "study", "plan_id": plan["id"]}
    body.setdefault("acts", [act])
    resp = client.post("/activities", json={"domain_id": d, "title": "Séance", **body})
    assert resp.status_code == 201, resp.text
    return resp.json()


def _activity_ids(client: TestClient) -> set[str]:
    return {a["id"] for a in client.get("/activities").json()}


def test_unstarting_puts_the_cycle_back_to_planned(client: TestClient) -> None:
    """Annuler le démarrage : réussites effacées ; séances faites gardées sans
    cycle, à venir supprimées ; le reste du cycle est gardé."""
    d = _domain(client)
    s = _skill(client, d)
    obj = _project(client, d, "Tournoi")
    plan = _plan(client, s, state="active", name="Bases", project_ids=[obj])
    item = _item(client, s, plan_id=plan["id"])
    client.patch(f"/plans/{plan['id']}/items/{item['id']}", json={"done": True})
    client.post(f"/plans/{plan['id']}/study/validate")
    done = _session(client, d, plan, done=True, start_at="2026-01-05T18:00")
    missed = _session(client, d, plan, start_at="2026-01-06T18:00")
    coming = _session(client, d, plan, start_at="2999-01-01T18:00")

    read = client.post(f"/plans/{plan['id']}/unstart").json()

    assert read["state"] == "draft"
    assert read["opened_at"] is None
    assert read["study_validated_at"] is None
    assert read["study_mastered"] is False
    assert item["id"] in {i["item_id"] for i in read["items"]}
    assert not any(i["done"] for i in read["items"])
    assert (read["name"], read["project_ids"]) == ("Bases", [obj])
    ids = _activity_ids(client)
    assert {done["id"], missed["id"]} <= ids
    assert coming["id"] not in ids
    kept = client.get(f"/activities/{done['id']}").json()
    assert [(a["skill_id"], a["plan_id"]) for a in kept["acts"]] == [(s, None)]
    assert client.post(f"/plans/{plan['id']}/unstart").status_code == 422


def test_a_cycle_without_project_is_deleted_with_its_coming_sessions(
    client: TestClient,
) -> None:
    d = _domain(client)
    s = _skill(client, d)
    plan = _plan(client, s, state="active")
    done = _session(client, d, plan, done=True, start_at="2026-01-05T18:00")
    coming = _session(client, d, plan, start_at="2999-01-01T18:00")

    assert client.delete(f"/plans/{plan['id']}").status_code == 204

    assert _plans(client, s) == []
    ids = _activity_ids(client)
    assert done["id"] in ids
    assert coming["id"] not in ids


def test_a_cycle_serving_an_project_is_not_deleted(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d)
    _project(client, d, "Tournoi", skill_ids=[s])
    plan = _plans(client, s)[0]

    assert client.delete(f"/plans/{plan['id']}").status_code == 422
    assert len(_plans(client, s)) == 1


def test_deleting_the_skill_takes_its_cycles(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d)
    _plan(client, s)

    assert client.delete(f"/skills/{s}").status_code == 204
    assert client.get(f"/skills/{s}/plans").json() == []


# --- Déjà terminé ---


def test_an_already_finished_cycle_is_born_acquired_on_its_period(
    client: TestClient,
) -> None:
    """Un acquis sans pratique dans l'app : le cycle naît clos acquis à sa
    période, vide, sans projet — il ne remplit rien."""
    d = _domain(client)
    s = _skill(client, d)
    obj = _project(client, d, "Tournoi", skill_ids=[s])

    read = _plan(
        client,
        s,
        state="completed",
        name="Les bases",
        started_on="2026-09-01",
        finished_on="2026-09-07",
    )

    assert read["state"] == "completed"
    assert read["observed"] is True
    assert read["opened_at"].startswith("2026-09-01")
    assert read["closed_at"].startswith("2026-09-07")
    assert read["project_ids"] == []
    assert _status(client, s) == "acquired"
    assert _project_status(client, obj) != "achieved"


def test_an_already_finished_cycle_needs_a_past_period_and_no_project(
    client: TestClient,
) -> None:
    d = _domain(client)
    s = _skill(client, d)
    obj = _project(client, d, "Tournoi")
    url = f"/skills/{s}/plans"
    ok = {"state": "completed", "started_on": "2026-09-01", "finished_on": "2026-09-07"}

    assert client.post(url, json={"state": "completed"}).status_code == 422
    backwards = {**ok, "started_on": "2026-09-08"}
    assert client.post(url, json=backwards).status_code == 422
    future = {**ok, "finished_on": "2999-01-01"}
    assert client.post(url, json=future).status_code == 422
    assert client.post(url, json={**ok, "project_ids": [obj]}).status_code == 422
    assert client.post(url, json={"state": "abandoned"}).status_code == 422
    assert _plans(client, s) == []


# --- Les projets d'un cycle ---


def test_linking_a_skill_prepares_a_draft_for_the_project(
    client: TestClient,
) -> None:
    d = _domain(client)
    s = _skill(client, d)

    obj = _project(client, d, skill_ids=[s])

    (plan,) = _plans(client, s)
    assert plan["state"] == "draft"
    assert plan["project_ids"] == [obj]


def test_each_project_gets_its_own_draft(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d)

    a = _project(client, d, "Tournoi", skill_ids=[s])
    b = _project(client, d, "Saison 2", skill_ids=[s])

    assert sorted(p["project_ids"][0] for p in _plans(client, s)) == sorted([a, b])


def test_unlinking_takes_back_an_empty_draft(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d)
    obj = _project(client, d, skill_ids=[s])

    client.put(f"/projects/{obj}/skills", json={"skill_ids": []})

    assert _plans(client, s) == []


def test_unlinking_keeps_a_prepared_draft_detached(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d)
    obj = _project(client, d, skill_ids=[s])
    (plan,) = _plans(client, s)
    client.patch(f"/plans/{plan['id']}", json={"target_level": "Défense"})

    client.put(f"/projects/{obj}/skills", json={"skill_ids": []})

    (kept,) = _plans(client, s)
    assert kept["project_ids"] == []


def test_a_changed_phase_counts_as_preparation(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d)
    obj = _project(client, d, skill_ids=[s])
    (plan,) = _plans(client, s)
    client.patch(f"/plans/{plan['id']}", json={"retention": True})

    client.put(f"/projects/{obj}/skills", json={"skill_ids": []})

    assert len(_plans(client, s)) == 1


def test_unlinking_never_touches_a_launched_cycle(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d)
    obj = _project(client, d, skill_ids=[s])
    (plan,) = _plans(client, s)
    client.post(f"/plans/{plan['id']}/open")

    client.put(f"/projects/{obj}/skills", json={"skill_ids": []})

    (kept,) = _plans(client, s)
    assert kept["state"] == "active"


def test_sharing_a_cycle_takes_the_project_from_its_draft(
    client: TestClient,
) -> None:
    """Partager le cycle en cours : le projet le rejoint, son brouillon vide
    disparaît."""
    d = _domain(client)
    s = _skill(client, d)
    tournoi = _project(client, d, "Tournoi", skill_ids=[s])
    saison2 = _project(client, d, "Saison 2", skill_ids=[s])
    current = next(p for p in _plans(client, s) if tournoi in p["project_ids"])
    client.post(f"/plans/{current['id']}/open")

    shared = client.patch(
        f"/plans/{current['id']}", json={"project_ids": [tournoi, saison2]}
    ).json()

    assert sorted(shared["project_ids"]) == sorted([tournoi, saison2])
    assert [p["id"] for p in _plans(client, s)] == [current["id"]]


def test_sharing_leaves_a_prepared_draft_detached(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d)
    tournoi = _project(client, d, "Tournoi", skill_ids=[s])
    saison2 = _project(client, d, "Saison 2", skill_ids=[s])
    plans = _plans(client, s)
    current = next(p for p in plans if tournoi in p["project_ids"])
    prepared = next(p for p in plans if saison2 in p["project_ids"])
    client.patch(f"/plans/{prepared['id']}", json={"target_level": "Grille"})

    client.patch(f"/plans/{current['id']}", json={"project_ids": [tournoi, saison2]})

    kept = next(p for p in _plans(client, s) if p["id"] == prepared["id"])
    assert kept["project_ids"] == []


def test_attaching_an_project_makes_it_target_the_skill(
    client: TestClient,
) -> None:
    d = _domain(client)
    s = _skill(client, d)
    obj = _project(client, d)
    plan = _plan(client, s)

    client.patch(f"/plans/{plan['id']}", json={"project_ids": [obj]})

    assert s in client.get(f"/projects/{obj}").json()["skill_ids"]
    assert len(_plans(client, s)) == 1


def test_detaching_an_project_gives_it_back_an_empty_draft(
    client: TestClient,
) -> None:
    d = _domain(client)
    s = _skill(client, d)
    obj = _project(client, d, skill_ids=[s])
    (plan,) = _plans(client, s)
    client.patch(f"/plans/{plan['id']}", json={"target_level": "Défense"})

    client.patch(f"/plans/{plan['id']}", json={"project_ids": []})

    plans = _plans(client, s)
    assert len(plans) == 2
    fresh = next(p for p in plans if p["id"] != plan["id"])
    assert fresh["project_ids"] == [obj]


def test_an_project_of_another_domain_is_refused(client: TestClient) -> None:
    d, other = _domain(client), _domain(client, "Cuisine")
    s = _skill(client, d)
    foreign = _project(client, other)
    plan = _plan(client, s)

    resp = client.patch(f"/plans/{plan['id']}", json={"project_ids": [foreign]})

    assert resp.status_code == 422


def test_abandoning_gives_the_project_back_a_draft(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d)
    obj = _project(client, d, skill_ids=[s])
    (plan,) = _plans(client, s)
    client.post(f"/plans/{plan['id']}/open")

    client.post(f"/plans/{plan['id']}/abandon")

    plans = _plans(client, s)
    assert [p["state"] for p in plans] == ["abandoned", "draft"]
    assert plans[1]["project_ids"] == [obj]


def test_taking_back_up_removes_the_empty_draft_it_left(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d)
    obj = _project(client, d, skill_ids=[s])
    (plan,) = _plans(client, s)
    client.post(f"/plans/{plan['id']}/open")
    client.post(f"/plans/{plan['id']}/abandon")

    read = client.post(f"/plans/{plan['id']}/reopen").json()

    assert read["project_ids"] == [obj]
    assert [p["id"] for p in _plans(client, s)] == [plan["id"]]


# --- La condition Apprentissage ---


def test_the_condition_reads_the_cycle_of_the_project(client: TestClient) -> None:
    """Un cycle acquis pour un projet ne remplit pas celui d'un autre : un
    projet posé sur un savoir remis en cycle vise le nouveau niveau."""
    d = _domain(client)
    s = _skill(client, d)
    first = _project(client, d, "Tournoi", skill_ids=[s])
    plan = next(p for p in _plans(client, s) if first in p["project_ids"])
    client.post(f"/plans/{plan['id']}/open")
    client.post(f"/plans/{plan['id']}/complete")

    later = _project(client, d, "Saison 2", skill_ids=[s])

    assert _project_status(client, first) == "achieved"
    assert _project_status(client, later) == "in_progress"


def test_a_reached_project_stays_reached(client: TestClient) -> None:
    """Rouvrir un savoir ne défait rien : le cycle clos reste clos."""
    d = _domain(client)
    s = _skill(client, d)
    obj = _project(client, d, skill_ids=[s])
    (plan,) = _plans(client, s)
    client.post(f"/plans/{plan['id']}/open")
    client.post(f"/plans/{plan['id']}/complete")

    _plan(client, s, state="active")

    assert _status(client, s) == "in_progress"
    assert _project_status(client, obj) == "achieved"


def test_an_abandoned_cycle_does_not_satisfy(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d)
    obj = _project(client, d, skill_ids=[s])
    (plan,) = _plans(client, s)
    client.post(f"/plans/{plan['id']}/open")
    client.post(f"/plans/{plan['id']}/abandon")

    assert _project_status(client, obj) == "in_progress"


def _level(client: TestClient, project_id: str, skill_id: str) -> int:
    learning = client.get(f"/projects/{project_id}").json()["learning"]
    return next(x["level"] for x in learning if x["skill_id"] == skill_id)


def test_learning_level_follows_the_cycle_of_the_project(
    client: TestClient,
) -> None:
    d = _domain(client)
    s = _skill(client, d)
    obj = _project(client, d, skill_ids=[s])
    (plan,) = _plans(client, s)
    assert _level(client, obj, s) == 0

    client.post(f"/plans/{plan['id']}/open")
    assert _level(client, obj, s) == 1

    client.post(f"/plans/{plan['id']}/study/validate")
    assert _level(client, obj, s) == 2

    client.post(f"/plans/{plan['id']}/complete")
    assert _level(client, obj, s) == 4


# --- Commencer depuis un projet ---


def test_starting_for_an_project_opens_its_cycle(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d)
    obj = _project(client, d, skill_ids=[s])
    (plan,) = _plans(client, s)

    read = client.post(f"/skills/{s}/plans/start", json={"project_id": obj}).json()

    assert read["id"] == plan["id"]
    assert read["state"] == "active"


def test_starting_without_project_opens_the_last_draft(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d)
    _plan(client, s)
    last = _plan(client, s)

    read = client.post(f"/skills/{s}/plans/start").json()

    assert read["id"] == last["id"]
    assert read["state"] == "active"


def test_starting_a_fresh_skill_creates_a_cycle(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d)

    read = client.post(f"/skills/{s}/plans/start").json()

    assert read["state"] == "active"
    assert (read["study"], read["isolated"], read["situation"]) == (True, True, True)


def test_starting_while_another_cycle_is_in_progress_is_refused(
    client: TestClient,
) -> None:
    d = _domain(client)
    s = _skill(client, d)
    _plan(client, s, state="active")
    obj = _project(client, d, skill_ids=[s])

    resp = client.post(f"/skills/{s}/plans/start", json={"project_id": obj})

    assert resp.status_code == 422


# --- Séances ---


def test_a_session_of_a_cycle_joins_its_projects(client: TestClient) -> None:
    """Une séance qui sert un cycle reçoit les projets de ce cycle, pas
    ceux de tous les projets qui visent le savoir."""
    d = _domain(client)
    s = _skill(client, d)
    tournoi = _project(client, d, "Tournoi", skill_ids=[s])
    _project(client, d, "Saison 2", skill_ids=[s])
    plan = next(p for p in _plans(client, s) if tournoi in p["project_ids"])
    today = date.today().isoformat()

    a = _session(
        client, d, plan, start_at=f"{today}T10:00:00", end_at=f"{today}T11:00:00"
    )

    assert [(x["skill_id"], x["plan_id"]) for x in a["acts"]] == [(s, plan["id"])]
    assert [o["project_id"] for o in a["projects"]] == [tournoi]


def test_a_session_cannot_serve_a_cycle_of_another_skill(client: TestClient) -> None:
    d = _domain(client)
    s, other = _skill(client, d), _skill(client, d, "Volée")
    plan = _plan(client, other)
    item = _item(client, s)

    resp = client.post(
        "/activities",
        json={
            "domain_id": d,
            "title": "Séance",
            "acts": [
                {
                    "skill_id": s,
                    "kind": "practice",
                    "plan_id": plan["id"],
                    "practice_item_id": item["id"],
                }
            ],
        },
    )

    assert resp.status_code == 422


def test_undoing_a_cycle_keeps_what_else_an_activity_holds(
    client: TestClient,
) -> None:
    """Une activité à venir qui porte aussi autre chose — un autre savoir, ou
    l'occurrence d'une activité type — perd l'acte du cycle défait, pas
    l'existence."""
    d = _domain(client)
    s, other = _skill(client, d), _skill(client, d, "Volée")
    plan = _plan(client, s, state="active")
    habit = client.post(
        "/activity-types", json={"domain_id": d, "title": "Tennis"}
    ).json()["id"]
    act = {"skill_id": s, "kind": "study", "plan_id": plan["id"]}
    shared = _session(
        client,
        d,
        plan,
        start_at="2999-01-01T18:00",
        acts=[act, {"skill_id": other, "kind": "study"}],
    )
    occurrence = _session(
        client, d, plan, start_at="2999-01-02T18:00", activity_type_id=habit
    )

    client.post(f"/plans/{plan['id']}/unstart")

    read = client.get(f"/activities/{shared['id']}").json()
    assert [a["skill_id"] for a in read["acts"]] == [other]
    assert client.get(f"/activities/{occurrence['id']}").json()["acts"] == []
