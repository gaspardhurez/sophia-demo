"""Tests de l'API Activity (V2 — Exécution) : CRUD, validation du rattachement
à une étape, et progression quantitative dérivée (barre d'étape = somme des
valeurs des activités faites)."""

import uuid
from datetime import date, timedelta

from fastapi.testclient import TestClient

from tests.helpers import project_payload


def _domain(client: TestClient, name: str = "Sport") -> str:
    return client.post("/domains", json={"name": name}).json()["id"]


def _project(client: TestClient, domain_id: str, title: str = "Semi") -> str:
    return client.post(
        f"/domains/{domain_id}/projects", json=project_payload(title)
    ).json()["id"]


def _step(client: TestClient, project_id: str, **body) -> dict:
    payload = {"title": "Sept : 50 km", **body}
    resp = client.post(f"/projects/{project_id}/steps", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()["steps"][-1]


def _link(project_id: str, step_id: str | None = None) -> dict:
    return {"project_id": project_id, "step_id": step_id}


def _projects(activity: dict) -> list[tuple[str, str | None]]:
    return [(o["project_id"], o["step_id"]) for o in activity["projects"]]


def _activity(client: TestClient, domain_id: str, **body) -> dict:
    payload = {"domain_id": domain_id, "title": "Sortie", **body}
    resp = client.post("/activities", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


# --- CRUD ---


def test_create_activity_domain_only(client: TestClient) -> None:
    domain_id = _domain(client)

    a = _activity(client, domain_id, title="RDV kiné")

    assert a["title"] == "RDV kiné"
    assert a["domain_id"] == domain_id
    assert a["projects"] == []
    assert a["done"] is False


def _km_project(client: TestClient, domain_id: str) -> tuple[str, str, str]:
    """Un projet « 200 km » (Total en valeur) et une étape qui en porte 50.

    Renvoie le projet, l'étape et l'unité km.
    """
    km = client.post("/units", json={"name": "km"}).json()["id"]
    oid = _project(client, domain_id, title="200 km")
    total = client.post(
        f"/projects/{oid}/totals",
        json={"mode": "value", "unit_id": km, "target": 200},
    ).json()["totals"][0]
    step = _step(client, oid)
    client.put(
        f"/steps/{step['id']}/totals", json={"total_id": total["id"], "target": 50}
    )
    return oid, step["id"], km


def _km(value: float, km: str) -> list[dict]:
    return [{"unit_id": km, "value": value}]


def _step_read(client: TestClient, project_id: str, step_id: str) -> dict:
    return next(
        s
        for s in client.get(f"/projects/{project_id}").json()["steps"]
        if s["id"] == step_id
    )


def test_create_activity_linked_to_step(client: TestClient) -> None:
    domain_id = _domain(client)
    oid, step, km = _km_project(client, domain_id)

    a = _activity(client, domain_id, projects=[_link(oid, step)], values=_km(8, km))

    assert _projects(a) == [(oid, step)]
    assert [v["value"] for v in a["values"]] == [8]


def test_create_activity_unknown_domain_404(client: TestClient) -> None:
    resp = client.post(
        "/activities", json={"domain_id": str(uuid.uuid4()), "title": "X"}
    )
    assert resp.status_code == 404


def test_create_activity_unknown_step_422(client: TestClient) -> None:
    domain_id = _domain(client)
    obj = _project(client, domain_id)
    resp = client.post(
        "/activities",
        json={
            "domain_id": domain_id,
            "title": "X",
            "projects": [_link(obj, str(uuid.uuid4()))],
        },
    )
    assert resp.status_code == 422


def test_link_step_of_another_project_422(client: TestClient) -> None:
    """L'étape d'un lien appartient au projet de ce lien."""
    domain_id = _domain(client)
    semi = _project(client, domain_id, "Semi")
    trail = _project(client, domain_id, "Trail")
    trail_step = _step(client, trail)

    resp = client.post(
        "/activities",
        json={
            "domain_id": domain_id,
            "title": "X",
            "projects": [_link(semi, trail_step["id"])],
        },
    )
    assert resp.status_code == 422


def test_the_old_single_link_fields_are_refused(client: TestClient) -> None:
    """Un client resté sur `project_id` perdrait son rattachement en silence."""
    domain_id = _domain(client)
    obj = _project(client, domain_id)

    resp = client.post(
        "/activities",
        json={"domain_id": domain_id, "title": "X", "project_id": obj},
    )
    assert resp.status_code == 422


def test_update_and_delete_activity(client: TestClient) -> None:
    domain_id = _domain(client)
    km = client.post("/units", json={"name": "km"}).json()["id"]
    a = _activity(client, domain_id, values=_km(5, km))

    patched = client.patch(
        f"/activities/{a['id']}", json={"values": _km(8, km), "done": True}
    )
    assert patched.status_code == 200
    assert [v["value"] for v in patched.json()["values"]] == [8]
    assert patched.json()["done"] is True

    assert client.delete(f"/activities/{a['id']}").status_code == 204
    assert client.get(f"/activities/{a['id']}").status_code == 404


# --- Liste filtrable ---


def test_notes_aller_retour_et_effacement(client: TestClient) -> None:
    """Le compte-rendu de la séance : écrit, relu, réécrit, effacé."""
    domain_id = _domain(client)
    a = _activity(client, domain_id)
    assert a["notes"] is None

    resp = client.patch(f"/activities/{a['id']}", json={"notes": "Jambes lourdes"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["notes"] == "Jambes lourdes"

    assert (
        client.patch(f"/activities/{a['id']}", json={"notes": None}).json()["notes"]
        is None
    )


def test_un_patch_partiel_nefface_pas_les_notes(client: TestClient) -> None:
    """Le panneau renvoie son rattachement à chaque frappe sans jamais parler
    des notes : `exclude_unset` doit les laisser intactes. Sinon cocher une
    séance effacerait ce qu'on venait d'y écrire."""
    domain_id = _domain(client)
    a = _activity(client, domain_id, notes="Squat 4x5 @80")

    resp = client.patch(f"/activities/{a['id']}", json={"done": True})

    assert resp.json()["notes"] == "Squat 4x5 @80"


def test_list_activities_by_domain(client: TestClient) -> None:
    sport = _domain(client, "Sport")
    musique = _domain(client, "Musique")
    _activity(client, sport, title="Run")
    _activity(client, musique, title="Piano")

    resp = client.get("/activities", params={"domain_id": sport})

    assert resp.status_code == 200
    titles = [a["title"] for a in resp.json()]
    assert titles == ["Run"]


def test_list_activities_by_window(client: TestClient) -> None:
    domain_id = _domain(client)
    _activity(client, domain_id, title="Dans", start_at="2026-09-10T09:00:00")
    _activity(client, domain_id, title="Hors", start_at="2026-10-10T09:00:00")

    resp = client.get(
        "/activities",
        params={"start": "2026-09-01T00:00:00", "end": "2026-10-01T00:00:00"},
    )

    assert resp.status_code == 200
    assert [a["title"] for a in resp.json()] == ["Dans"]


def test_update_activity_change_domain(client: TestClient) -> None:
    sport = _domain(client, "Sport")
    cuisine = _domain(client, "Cuisine")
    a = _activity(client, sport, title="X")

    resp = client.patch(f"/activities/{a['id']}", json={"domain_id": cuisine})

    assert resp.status_code == 200
    assert resp.json()["domain_id"] == cuisine


def test_update_domain_with_conflicting_step_422(client: TestClient) -> None:
    sport = _domain(client, "Sport")
    cuisine = _domain(client, "Cuisine")
    obj = _project(client, sport)
    step = _step(client, obj)
    a = _activity(client, sport, projects=[_link(obj, step["id"])])

    # Changer de domaine sans lâcher le projet (qui relève de l'ancien) → 422.
    conflict = client.patch(f"/activities/{a['id']}", json={"domain_id": cuisine})
    assert conflict.status_code == 422

    # En détachant le projet, le changement passe.
    ok = client.patch(
        f"/activities/{a['id']}", json={"domain_id": cuisine, "projects": []}
    )
    assert ok.status_code == 200
    assert ok.json()["domain_id"] == cuisine
    assert ok.json()["projects"] == []


def test_list_activities_by_project(client: TestClient) -> None:
    domain_id = _domain(client)
    obj_a = _project(client, domain_id, title="Semi")
    obj_b = _project(client, domain_id, title="Marathon")
    step_a = _step(client, obj_a)

    _activity(client, domain_id, title="Vise A", projects=[_link(obj_a, step_a["id"])])
    _activity(client, domain_id, title="Vise B", projects=[_link(obj_b)])
    _activity(
        client,
        domain_id,
        title="Vise les deux",
        projects=[_link(obj_a), _link(obj_b)],
    )
    _activity(client, domain_id, title="Sans projet")

    resp = client.get("/activities", params={"project_id": obj_a})

    assert resp.status_code == 200
    assert sorted(a["title"] for a in resp.json()) == ["Vise A", "Vise les deux"]
    by_step = client.get("/activities", params={"step_id": step_a["id"]}).json()
    assert [a["title"] for a in by_step] == ["Vise A"]


def test_an_activity_counts_for_several_projects(client: TestClient) -> None:
    """Une course de préparation compte pour le Semi et pour le Trail (#37)."""
    domain_id = _domain(client)
    semi = _project(client, domain_id, "Semi")
    trail = _project(client, domain_id, "Trail")
    for oid in (semi, trail):
        client.post(f"/projects/{oid}/totals", json={"mode": "count", "target": 5})

    _activity(client, domain_id, projects=[_link(semi), _link(trail)], done=True)

    for oid in (semi, trail):
        read = client.get(f"/projects/{oid}").json()
        assert read["totals"][0]["progress"] == 1


def test_relinking_keeps_the_links_that_stay(client: TestClient) -> None:
    """« Compter sans prendre » : ajouter le Trail ne retire pas le Semi, et
    changer l'étape d'un lien ne touche pas à l'autre."""
    domain_id = _domain(client)
    semi = _project(client, domain_id, "Semi")
    trail = _project(client, domain_id, "Trail")
    step = _step(client, semi)
    a = _activity(client, domain_id, projects=[_link(semi)])

    resp = client.patch(
        f"/activities/{a['id']}",
        json={"projects": [_link(semi, step["id"]), _link(trail)]},
    )

    assert resp.status_code == 200
    assert sorted(_projects(resp.json())) == sorted([(semi, step["id"]), (trail, None)])


def test_the_same_project_twice_422(client: TestClient) -> None:
    domain_id = _domain(client)
    obj = _project(client, domain_id)

    resp = client.post(
        "/activities",
        json={
            "domain_id": domain_id,
            "title": "X",
            "projects": [_link(obj), _link(obj)],
        },
    )
    assert resp.status_code == 422


def test_activity_project_from_other_domain_422(client: TestClient) -> None:
    sport = _domain(client, "Sport")
    musique = _domain(client, "Musique")
    foreign = _project(client, musique)

    resp = client.post(
        "/activities",
        json={"domain_id": sport, "title": "X", "projects": [_link(foreign)]},
    )
    assert resp.status_code == 422


def test_an_activity_type_from_another_domain_422(client: TestClient) -> None:
    """Une activité typée vit dans le domaine de son type : à la création, et
    quand on voudrait changer son domaine."""
    sport = _domain(client, "Sport")
    musique = _domain(client, "Musique")
    run = client.post(
        "/activity-types", json={"domain_id": sport, "title": "Run"}
    ).json()["id"]

    foreign = client.post(
        "/activities",
        json={"domain_id": musique, "title": "Run", "activity_type_id": run},
    )
    assert foreign.status_code == 422

    typed = _activity(client, sport, title="Run", activity_type_id=run)
    moved = client.patch(f"/activities/{typed['id']}", json={"domain_id": musique})
    assert moved.status_code == 422
    # Rester dans son domaine passe toujours.
    same = client.patch(f"/activities/{typed['id']}", json={"domain_id": sport})
    assert same.status_code == 200


def test_a_duration_unit_is_not_declared_422(client: TestClient) -> None:
    """La durée se lit sur l'activité : une unité de durée ne se déclare pas."""
    sport = _domain(client)
    minute = client.post(
        "/units", json={"name": "minute", "seconds_per_unit": 60}
    ).json()["id"]
    values = [{"unit_id": minute, "value": 45}]

    created = client.post(
        "/activities", json={"domain_id": sport, "title": "X", "values": values}
    )
    assert created.status_code == 422

    a = _activity(client, sport)
    patched = client.patch(f"/activities/{a['id']}", json={"values": values})
    assert patched.status_code == 422


def test_project_progress_rolls_up(client: TestClient) -> None:
    domain_id = _domain(client)
    oid, step, km = _km_project(client, domain_id)

    # Une activité sur la tranche + une directement sur le projet, toutes deux faites.
    _activity(
        client, domain_id, projects=[_link(oid, step)], values=_km(30, km), done=True
    )
    _activity(client, domain_id, projects=[_link(oid)], values=_km(20, km), done=True)

    read = client.get(f"/projects/{oid}").json()
    assert read["totals"][0]["progress"] == 50  # 30 (tranche) + 20 (direct)
    assert read["totals"][0]["unit"]["name"] == "km"
    # La tranche ne compte que la sienne.
    assert read["steps"][0]["totals"][0]["progress"] == 30


# --- Progression quantitative dérivée ---


def test_step_progress_counts_only_done(client: TestClient) -> None:
    domain_id = _domain(client)
    oid, step, km = _km_project(client, domain_id)

    _activity(
        client, domain_id, projects=[_link(oid, step)], values=_km(8, km), done=True
    )
    _activity(
        client, domain_id, projects=[_link(oid, step)], values=_km(12, km), done=False
    )

    read = _step_read(client, oid, step)
    assert read["totals"][0]["progress"] == 8  # l'activité non faite ne compte pas
    assert read["done"] is False


def test_step_done_when_target_reached(client: TestClient) -> None:
    domain_id = _domain(client)
    oid, step, km = _km_project(client, domain_id)

    _activity(
        client, domain_id, projects=[_link(oid, step)], values=_km(30, km), done=True
    )
    _activity(
        client, domain_id, projects=[_link(oid, step)], values=_km(25, km), done=True
    )

    read = _step_read(client, oid, step)
    assert read["totals"][0]["progress"] == 55
    assert read["done"] is True  # tranche atteinte → étape faite (dérivée)


# --- Actes d'apprentissage (#82) ---


def _skill(client: TestClient, domain_id: str, name: str, **body) -> str:
    resp = client.post(f"/domains/{domain_id}/skills", json={"name": name, **body})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _study(skill_id: str, **act) -> dict:
    return {"skill_id": skill_id, "kind": "study", **act}


def _acts(activity: dict) -> list[tuple]:
    return [
        (a["skill_id"], a["kind"], a["plan_id"], a["practice_item_id"])
        for a in activity["acts"]
    ]


def test_an_activity_holds_several_acts(client: TestClient) -> None:
    """Une Session Dev peut porter l'étude d'un savoir et l'exercice d'un
    autre : les actes sont contenus dans l'activité."""
    d = _domain(client)
    volee = _skill(client, d, "Volée")
    chandelle = _skill(client, d, "Chandelle")
    item = client.post(f"/skills/{chandelle}/practice", json={"title": "Panier"}).json()

    a = _activity(
        client,
        d,
        title="Tennis",
        acts=[
            _study(volee),
            {"skill_id": chandelle, "kind": "practice", "practice_item_id": item["id"]},
        ],
    )

    assert _acts(a) == [
        (volee, "study", None, None),
        (chandelle, "practice", None, item["id"]),
    ]


def test_acts_and_steps_are_orthogonal(client: TestClient) -> None:
    """Une séance peut remplir une tranche ET travailler un savoir : deux
    questions différentes posées à la même activité, sans dérivation."""
    domain_id = _domain(client)
    obj = _project(client, domain_id)
    step = _step(client, obj, unit="session", target=10)
    skill_id = _skill(client, domain_id, "Water start")

    a = _activity(
        client,
        domain_id,
        projects=[_link(obj, step["id"])],
        acts=[_study(skill_id)],
    )

    assert _projects(a) == [(obj, step["id"])]
    assert _acts(a) == [(skill_id, "study", None, None)]


def test_an_act_rejects_a_skill_from_another_domain(client: TestClient) -> None:
    domain_id = _domain(client)
    other = _domain(client, "Cuisine")
    foreign = _skill(client, other, "Émulsions")

    resp = client.post(
        "/activities",
        json={"domain_id": domain_id, "title": "Séance", "acts": [_study(foreign)]},
    )

    assert resp.status_code == 422


def test_an_act_works_a_parent(client: TestClient) -> None:
    """Un parent est un savoir : une séance peut le travailler."""
    domain_id = _domain(client)
    parent = _skill(client, domain_id, "Posture & appuis")
    _skill(client, domain_id, "Split-step", parent_skill_id=parent)

    resp = client.post(
        "/activities",
        json={"domain_id": domain_id, "title": "Séance", "acts": [_study(parent)]},
    )

    assert resp.status_code == 201, resp.text


def test_an_act_rejects_an_unknown_skill(client: TestClient) -> None:
    domain_id = _domain(client)

    resp = client.post(
        "/activities",
        json={
            "domain_id": domain_id,
            "title": "Séance",
            "acts": [_study(str(uuid.uuid4()))],
        },
    )

    assert resp.status_code == 422


def test_the_old_single_skill_fields_are_refused(client: TestClient) -> None:
    """`skill_id`, `practice_item_id`, `plan_id` ont disparu : un client resté
    dessus est refusé plutôt que de perdre son savoir sans le savoir."""
    domain_id = _domain(client)
    skill_id = _skill(client, domain_id, "Water start")

    resp = client.post(
        "/activities",
        json={"domain_id": domain_id, "title": "Séance", "skill_id": skill_id},
    )

    assert resp.status_code == 422


def test_what_an_act_does_must_fit(client: TestClient) -> None:
    """Un exercice vise un objet ; l'étude, aucun ; l'interro est celle d'un
    cycle ; le même acte n'entre pas deux fois."""
    d = _domain(client)
    skill = _skill(client, d, "Chandelle")
    item = client.post(f"/skills/{skill}/practice", json={"title": "Panier"}).json()

    def post(*acts: dict) -> int:
        return client.post(
            "/activities", json={"domain_id": d, "title": "S", "acts": list(acts)}
        ).status_code

    assert post({"skill_id": skill, "kind": "practice"}) == 422
    assert post(_study(skill, practice_item_id=item["id"])) == 422
    assert post({"skill_id": skill, "kind": "recall"}) == 422
    assert post(_study(skill), _study(skill)) == 422


def test_an_act_rejects_an_item_or_a_cycle_of_another_skill(
    client: TestClient,
) -> None:
    d = _domain(client)
    skill = _skill(client, d, "Chandelle")
    other = _skill(client, d, "Volée")
    item = client.post(f"/skills/{other}/practice", json={"title": "Panier"}).json()
    plan = client.post(f"/skills/{other}/plans", json={}).json()

    def post(act: dict) -> int:
        return client.post(
            "/activities", json={"domain_id": d, "title": "S", "acts": [act]}
        ).status_code

    assert (
        post({"skill_id": skill, "kind": "practice", "practice_item_id": item["id"]})
        == 422
    )
    assert post(_study(skill, plan_id=plan["id"])) == 422
    assert post(_study(skill, plan_id=str(uuid.uuid4()))) == 422


def test_acts_are_added_and_removed_one_by_one(client: TestClient) -> None:
    d = _domain(client)
    volee = _skill(client, d, "Volée")
    chandelle = _skill(client, d, "Chandelle")
    a = _activity(client, d, title="Tennis")

    first = client.post(f"/activities/{a['id']}/acts", json=_study(volee))
    second = client.post(f"/activities/{a['id']}/acts", json=_study(chandelle))
    again = client.post(f"/activities/{a['id']}/acts", json=_study(chandelle))

    assert first.status_code == 200, first.text
    assert [x[0] for x in _acts(second.json())] == [volee, chandelle]
    assert again.status_code == 422

    act_id = second.json()["acts"][0]["id"]
    removed = client.delete(f"/activities/{a['id']}/acts/{act_id}")
    assert removed.status_code == 200, removed.text
    assert [x[0] for x in _acts(removed.json())] == [chandelle]
    assert client.delete(f"/activities/{a['id']}/acts/{act_id}").status_code == 404


def test_moving_to_another_domain_refuses_to_drop_the_acts(
    client: TestClient,
) -> None:
    """Changer de domaine sortirait les savoirs de la vue : on refuse plutôt
    que de délier en silence."""
    domain_id = _domain(client)
    other = _domain(client, "Cuisine")
    skill_id = _skill(client, domain_id, "Water start")
    a = _activity(client, domain_id, acts=[_study(skill_id)])

    resp = client.patch(f"/activities/{a['id']}", json={"domain_id": other})

    assert resp.status_code == 422


def test_a_skill_history_is_a_filtered_view_of_the_calendar(
    client: TestClient,
) -> None:
    domain_id = _domain(client)
    skill_id = _skill(client, domain_id, "Water start")
    other_skill = _skill(client, domain_id, "Transition")
    _activity(client, domain_id, title="Séance 1", acts=[_study(skill_id)])
    _activity(
        client,
        domain_id,
        title="Séance 2",
        acts=[_study(other_skill), _study(skill_id)],
    )
    _activity(client, domain_id, title="Autre", acts=[_study(other_skill)])
    _activity(client, domain_id, title="RDV kiné")

    history = client.get("/activities", params={"skill_id": skill_id}).json()

    assert {a["title"] for a in history} == {"Séance 1", "Séance 2"}


def test_deleting_a_skill_keeps_the_sessions(client: TestClient) -> None:
    """La séance a bien eu lieu : elle ne s'efface pas avec le nœud, seul son
    acte part."""
    domain_id = _domain(client)
    skill_id = _skill(client, domain_id, "Water start")
    a = _activity(client, domain_id, title="Session kite", acts=[_study(skill_id)])

    assert client.delete(f"/skills/{skill_id}").status_code == 204

    read = client.get(f"/activities/{a['id']}").json()
    assert read["acts"] == []
    assert read["title"] == "Session kite"


# --- Les projets qu'apportent les actes (#37, §3 ; #82) ---


def _learning_project(client: TestClient, domain_id: str, skill_id: str, **body):
    resp = client.post(
        f"/domains/{domain_id}/projects",
        json=project_payload("Escalade", skill_ids=[skill_id], **body),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _session(client: TestClient, domain_id: str, skill_id: str, **body) -> dict:
    today = date.today().isoformat()
    return _activity(
        client,
        domain_id,
        title="Séance",
        acts=[_study(skill_id)],
        start_at=f"{today}T10:00:00",
        end_at=f"{today}T11:00:00",
        **body,
    )


def test_a_learning_session_joins_the_projects_aiming_at_its_skill(
    client: TestClient,
) -> None:
    """Sans projets fournis, une séance reçoit les projets ouverts qui visent
    son savoir, avec l'étape qui le porte dans la séquence."""
    d = _domain(client)
    skill = _skill(client, d, "Water start")
    other = _skill(client, d, "Jibe")
    obj = _learning_project(client, d, skill)
    step = _step(client, obj)
    client.put(f"/steps/{step['id']}/skills", json={"skill_ids": [skill]})
    elsewhere = _learning_project(client, d, other)

    a = _session(client, d, skill)

    assert _projects(a) == [(obj, step["id"])]
    assert elsewhere not in [o for o, _ in _projects(a)]


def test_given_projects_win_over_the_learning_rule(client: TestClient) -> None:
    """Le geste l'emporte : une liste fournie, même vide, est respectée."""
    d = _domain(client)
    skill = _skill(client, d, "Water start")
    _learning_project(client, d, skill)

    a = _session(client, d, skill, projects=[])

    assert a["projects"] == []


def test_a_learning_session_skips_closed_or_distant_projects(
    client: TestClient,
) -> None:
    """Seuls les projets ouverts le jour de la séance ; sans date, aucun."""
    d = _domain(client)
    skill = _skill(client, d, "Water start")
    future = _learning_project(
        client,
        d,
        skill,
        start_at=str(date.today() + timedelta(days=10)),
        due_at=str(date.today() + timedelta(days=40)),
    )
    abandoned = _learning_project(client, d, skill)
    client.patch(f"/projects/{abandoned}", json={"status": "abandoned"})

    dated = _session(client, d, skill)
    undated = _activity(client, d, title="Pool", acts=[_study(skill)])

    assert future not in [o for o, _ in _projects(dated)]
    assert dated["projects"] == []
    assert undated["projects"] == []


def test_adding_an_act_of_a_cycle_adds_its_projects(client: TestClient) -> None:
    """Un acte d'un cycle donne à l'activité les projets du cycle, sans
    toucher à ceux qu'elle avait ; le retirer ne retire rien."""
    d = _domain(client)
    skill = _skill(client, d, "Chandelle")
    obj = _learning_project(client, d, skill)
    mine = _project(client, d)
    plan = client.get(f"/skills/{skill}/plans").json()[0]
    today = date.today().isoformat()
    a = _activity(
        client,
        d,
        title="Tennis",
        projects=[_link(mine)],
        start_at=f"{today}T18:00:00",
        end_at=f"{today}T20:00:00",
    )

    added = client.post(
        f"/activities/{a['id']}/acts", json=_study(skill, plan_id=plan["id"])
    ).json()

    assert {o for o, _ in _projects(added)} == {mine, obj}
    act_id = added["acts"][0]["id"]
    removed = client.delete(f"/activities/{a['id']}/acts/{act_id}").json()
    assert {o for o, _ in _projects(removed)} == {mine, obj}


def test_adding_an_act_without_cycle_adds_no_project(client: TestClient) -> None:
    """Hors cycle, l'ajout ne touche à aucun lien (seule la création sans liste
    reçoit les projets qui visent le savoir)."""
    d = _domain(client)
    skill = _skill(client, d, "Water start")
    _learning_project(client, d, skill)
    today = date.today().isoformat()
    a = _activity(
        client,
        d,
        projects=[],
        start_at=f"{today}T10:00:00",
        end_at=f"{today}T11:00:00",
    )

    added = client.post(f"/activities/{a['id']}/acts", json=_study(skill)).json()

    assert added["projects"] == []


# --- Activité type posée à la main : ses projets à la création ---


def _planned_type(client: TestClient, domain_id: str, project_id: str, **link):
    """Une activité type planifiée par le projet (Manuelle par défaut : rien
    n'est posé d'avance, seul le dépôt à la main crée des activités)."""
    resp = client.post(
        "/activity-types", json={"domain_id": domain_id, "title": "Recette"}
    )
    type_id = resp.json()["id"]
    resp = client.put(
        f"/projects/{project_id}/activity-types/{type_id}",
        json={"planning": "manual", **link},
    )
    assert resp.status_code == 200, resp.text
    return type_id


def _dropped(client: TestClient, domain_id: str, type_id: str, **body) -> dict:
    today = date.today().isoformat()
    return _activity(
        client,
        domain_id,
        title="Recette",
        activity_type_id=type_id,
        start_at=f"{today}T19:00:00",
        end_at=f"{today}T20:00:00",
        **body,
    )


def test_a_dropped_type_joins_the_projects_planning_it(client: TestClient) -> None:
    """Sans projets fournis, l'activité type reçoit les projets ouverts qui
    la planifient, avec l'étape du jour — quel que soit le jour de sa
    planification."""
    d = _domain(client, "Cuisine")
    obj = _project(client, d, "Cuisine maison")
    today = date.today()
    step = _step(
        client,
        obj,
        start_at=str(today - timedelta(days=3)),
        due_at=str(today + timedelta(days=3)),
    )
    other = _project(client, d, "Pâtisserie")
    type_id = _planned_type(
        client, d, obj, planning="weekly", weekdays=[(today.weekday() + 1) % 7]
    )

    a = _dropped(client, d, type_id)

    assert _projects(a) == [(obj, step["id"])]
    assert other not in [o for o, _ in _projects(a)]


def test_given_projects_win_over_the_type_rule(client: TestClient) -> None:
    d = _domain(client, "Cuisine")
    type_id = _planned_type(client, d, _project(client, d))

    a = _dropped(client, d, type_id, projects=[])

    assert a["projects"] == []


def test_a_dropped_type_skips_closed_projects_and_off_steps(
    client: TestClient,
) -> None:
    """Pas de projet fermé, pas d'étape éteinte pour ce lien ; sans date,
    aucun projet."""
    d = _domain(client, "Cuisine")
    today = date.today()
    abandoned = _project(client, d, "Abandonné")
    off = _project(client, d, "Éteint")
    step = _step(
        client,
        off,
        start_at=str(today - timedelta(days=3)),
        due_at=str(today + timedelta(days=3)),
    )
    type_id = _planned_type(client, d, abandoned)
    client.put(
        f"/projects/{off}/activity-types/{type_id}",
        json={"planning": "manual", "off_step_ids": [step["id"]]},
    )
    client.patch(f"/projects/{abandoned}", json={"status": "abandoned"})

    dated = _dropped(client, d, type_id)
    undated = _activity(client, d, title="Recette", activity_type_id=type_id)

    assert dated["projects"] == []
    assert undated["projects"] == []
