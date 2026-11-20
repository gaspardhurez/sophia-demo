"""Tests de l'API Project : CRUD, statut/achieved_at, liens compétences."""

import uuid
from datetime import date, timedelta

from fastapi.testclient import TestClient

from tests.helpers import project_ids, project_payload


def _domain(client: TestClient, name: str = "Cuisine") -> str:
    return client.post("/domains", json={"name": name}).json()["id"]


def _skill(client: TestClient, domain_id: str, name: str) -> str:
    return client.post(f"/domains/{domain_id}/skills", json={"name": name}).json()["id"]


def _project(client: TestClient, domain_id: str, **body) -> dict:
    payload = project_payload("Maîtriser les sauces mères", **body)
    resp = client.post(f"/domains/{domain_id}/projects", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


# --- CRUD ---


def test_create_project_defaults(client: TestClient) -> None:
    domain_id = _domain(client)

    obj = _project(
        client,
        domain_id,
        description="les 5 sauces",
        start_at="2026-09-01",
        due_at="2099-12-31",
    )

    assert obj["title"] == "Maîtriser les sauces mères"
    # Rien de décidé : le stocké est `todo`, l'affiché se lit sur la période.
    assert obj["manual_status"] == "todo"
    assert obj["status"] == "in_progress"
    assert (obj["start_at"], obj["due_at"]) == ("2026-09-01", "2099-12-31")
    assert obj["achieved_at"] is None
    assert obj["skill_ids"] == []


# --- La période est obligatoire (design #32) ---


def test_creating_without_a_period_is_refused(client: TestClient) -> None:
    domain_id = _domain(client)
    url = f"/domains/{domain_id}/projects"

    assert client.post(url, json={"title": "X"}).status_code == 422
    assert (
        client.post(url, json={"title": "X", "due_at": "2099-12-31"}).status_code == 422
    )
    assert (
        client.post(url, json={"title": "X", "start_at": "2026-01-01"}).status_code
        == 422
    )
    body = {"title": "X", "start_at": None, "due_at": "2099-12-31"}
    assert client.post(url, json=body).status_code == 422
    assert client.get(url).json() == []


def test_a_start_after_the_end_is_refused(client: TestClient) -> None:
    domain_id = _domain(client)
    url = f"/domains/{domain_id}/projects"

    backwards = {"title": "X", "start_at": "2026-10-02", "due_at": "2026-10-01"}
    one_day = {"title": "X", "start_at": "2026-10-01", "due_at": "2026-10-01"}

    assert client.post(url, json=backwards).status_code == 422
    assert client.post(url, json=one_day).status_code == 201


def test_patching_the_start_to_null_is_refused(client: TestClient) -> None:
    """Le début ne s'efface pas ; la fin, si (#196, cf. test_project_without_end)."""
    domain_id = _domain(client)
    obj = _project(client, domain_id)

    resp = client.patch(f"/projects/{obj['id']}", json={"start_at": None})
    assert resp.status_code == 422

    read = client.get(f"/projects/{obj['id']}").json()
    assert (read["start_at"], read["due_at"]) == (obj["start_at"], obj["due_at"])


def test_patching_without_the_period_keeps_it(client: TestClient) -> None:
    """Omises, les dates ne bougent pas."""
    domain_id = _domain(client)
    obj = _project(client, domain_id)

    resp = client.patch(f"/projects/{obj['id']}", json={"title": "Renommé"})

    assert resp.status_code == 200
    assert (resp.json()["start_at"], resp.json()["due_at"]) == (
        obj["start_at"],
        obj["due_at"],
    )


def test_patching_a_start_after_the_end_is_refused(client: TestClient) -> None:
    domain_id = _domain(client)
    obj = _project(client, domain_id, start_at="2026-09-01", due_at="2026-09-30")

    both = {"start_at": "2026-10-02", "due_at": "2026-10-01"}
    assert client.patch(f"/projects/{obj['id']}", json=both).status_code == 422


def test_create_project_with_skills(client: TestClient) -> None:
    domain_id = _domain(client)
    a = _skill(client, domain_id, "Émulsions")
    b = _skill(client, domain_id, "Fonds")

    obj = _project(client, domain_id, skill_ids=[a, b])

    assert set(obj["skill_ids"]) == {a, b}


def test_create_project_in_unknown_domain_404(client: TestClient) -> None:
    resp = client.post(f"/domains/{uuid.uuid4()}/projects", json=project_payload("X"))

    assert resp.status_code == 404


def test_list_projects_scoped_to_domain(client: TestClient) -> None:
    cuisine = _domain(client, "Cuisine")
    piano = _domain(client, "Piano")
    _project(client, cuisine, title="Sauces mères")
    _project(client, piano, title="Grade 3 ABRSM")

    resp = client.get(f"/domains/{cuisine}/projects")

    assert resp.status_code == 200
    titles = [o["title"] for o in resp.json()]
    assert titles == ["Sauces mères"]


def test_list_all_projects_cross_domain(client: TestClient) -> None:
    cuisine = _domain(client, "Cuisine")
    piano = _domain(client, "Piano")
    _project(client, cuisine, title="Sauces mères")
    _project(client, piano, title="Grade 3 ABRSM")

    resp = client.get("/projects")

    assert resp.status_code == 200
    body = resp.json()
    assert {o["title"] for o in body} == {"Sauces mères", "Grade 3 ABRSM"}
    # Chaque projet porte ses domaines, pour l'affichage cross-domaine.
    assert {o["domain_ids"][0] for o in body} == {cuisine, piano}


def test_delete_project(client: TestClient) -> None:
    domain_id = _domain(client)
    obj = _project(client, domain_id)

    assert client.delete(f"/projects/{obj['id']}").status_code == 204
    assert client.get(f"/projects/{obj['id']}").status_code == 404


# --- Statut / achieved_at ---


def test_marking_achieved_sets_achieved_at(client: TestClient) -> None:
    domain_id = _domain(client)
    obj = _project(client, domain_id)

    resp = client.patch(f"/projects/{obj['id']}", json={"status": "achieved"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "achieved"
    assert body["achieved_at"] is not None


def test_reopening_clears_achieved_at(client: TestClient) -> None:
    domain_id = _domain(client)
    obj = _project(client, domain_id, status="achieved")
    assert obj["achieved_at"] is not None

    resp = client.patch(f"/projects/{obj['id']}", json={"status": "todo"})

    assert resp.status_code == 200
    assert resp.json()["achieved_at"] is None


# --- Liens compétences ---


def test_set_skills_replaces_links(client: TestClient) -> None:
    domain_id = _domain(client)
    a = _skill(client, domain_id, "Émulsions")
    b = _skill(client, domain_id, "Fonds")
    obj = _project(client, domain_id, skill_ids=[a])

    resp = client.put(f"/projects/{obj['id']}/skills", json={"skill_ids": [b]})

    assert resp.status_code == 200
    assert resp.json()["skill_ids"] == [b]


def test_link_unknown_skill_returns_422(client: TestClient) -> None:
    domain_id = _domain(client)

    resp = client.post(
        f"/domains/{domain_id}/projects",
        json=project_payload("X", skill_ids=[str(uuid.uuid4())]),
    )

    assert resp.status_code == 422


def test_link_skill_from_other_domain_returns_422(client: TestClient) -> None:
    cuisine = _domain(client, "Cuisine")
    piano = _domain(client, "Piano")
    foreign = _skill(client, piano, "Gammes")

    resp = client.post(
        f"/domains/{cuisine}/projects",
        json=project_payload("X", skill_ids=[foreign]),
    )

    assert resp.status_code == 422


# --- Les compétences liées sont des CONDITIONS (décision du 27/08/2026) -----


def _acquire(client: TestClient, skill_id: str) -> None:
    """Terminer acquis les cycles de ce savoir — ceux de ses projets.

    Le statut saisi à la main ne remplit plus la condition : elle lit le
    cycle rattaché au projet."""
    for plan in client.get(f"/skills/{skill_id}/plans").json():
        if plan["state"] == "draft":
            resp = client.post(f"/plans/{plan['id']}/open")
            assert resp.status_code == 200, resp.text
        if plan["state"] in ("draft", "active"):
            resp = client.post(f"/plans/{plan['id']}/complete")
            assert resp.status_code == 200, resp.text


def test_linked_skills_make_the_project_derivable(client: TestClient) -> None:
    """Lier une compétence **engage**. Le lien était de la cartographie héritée
    de la V1 : il ne décidait de rien, comme le statut manuel qu'on lui
    reproche."""
    d = _domain(client)
    skill = _skill(client, d, "Sortie de vitre")
    obj = client.post(
        f"/domains/{d}/projects",
        json=project_payload("Jeu complet", skill_ids=[skill]),
    ).json()

    assert obj["is_tracked"] is True
    assert obj["status"] == "in_progress"

    _acquire(client, skill)

    assert client.get(f"/projects/{obj['id']}").json()["status"] == "achieved"


def test_every_linked_skill_counts(client: TestClient) -> None:
    d = _domain(client)
    first, second = _skill(client, d, "Chandelle"), _skill(client, d, "Volée")
    obj = client.post(
        f"/domains/{d}/projects",
        json=project_payload("Jeu complet", skill_ids=[first, second]),
    ).json()["id"]

    _acquire(client, first)
    assert client.get(f"/projects/{obj}").json()["status"] == "in_progress"

    _acquire(client, second)
    assert client.get(f"/projects/{obj}").json()["status"] == "achieved"


def test_a_step_skill_is_always_an_project_condition(client: TestClient) -> None:
    """Une compétence d'étape engage forcément le projet.

    Depuis que l'étape ne fait que **distribuer**, elle ne peut porter que ce que
    le projet a déclaré : « compétence d'étape qui ne compte pas » n'existe
    plus, et la distinction directes / effectives devient vide.
    """
    d = _domain(client)
    skill = _skill(client, d, "Chandelle")
    obj = client.post(
        f"/domains/{d}/projects",
        json=project_payload("Jeu complet", skill_ids=[skill]),
    ).json()["id"]
    client.post(
        f"/projects/{obj}/steps",
        json={"title": "Coups de fond", "skill_ids": [skill]},
    )

    read = client.get(f"/projects/{obj}").json()
    assert read["is_tracked"] is True
    assert read["status"] == "in_progress"

    _acquire(client, skill)

    assert client.get(f"/projects/{obj}").json()["status"] == "achieved"


def test_unlinking_the_last_skill_gives_the_status_back(client: TestClient) -> None:
    d = _domain(client)
    skill = _skill(client, d, "Chandelle")
    obj = client.post(
        f"/domains/{d}/projects",
        json=project_payload("Jeu complet", skill_ids=[skill]),
    ).json()["id"]
    assert client.get(f"/projects/{obj}").json()["is_tracked"] is True

    client.put(f"/projects/{obj}/skills", json={"skill_ids": []})

    assert client.get(f"/projects/{obj}").json()["is_tracked"] is False


# --- Abandonner (décision du 24/09/2026, design #27) --------------------------


def _abandon_setup(client: TestClient) -> dict:
    today = date.today()
    hier = f"{today - timedelta(days=1)}T09:00:00"
    demain = f"{today + timedelta(days=1)}T09:00:00"
    d = client.post("/domains", json={"name": "Tennis"}).json()["id"]
    obj = client.post(
        f"/domains/{d}/projects",
        json=project_payload("Saison", start_at=str(today - timedelta(days=7))),
    ).json()["id"]
    habit = client.post(
        "/activity-types", json={"domain_id": d, "title": "Tennis"}
    ).json()["id"]
    client.put(f"/projects/{obj}/activity-types/{habit}", json={"planning": "manual"})
    skill = client.post(f"/domains/{d}/skills", json={"name": "Chandelle"}).json()["id"]

    def act(**body) -> str:
        payload = {
            "domain_id": d,
            "projects": [{"project_id": obj}],
            "title": "Séance",
            **body,
        }
        resp = client.post("/activities", json=payload)
        assert resp.status_code == 201, resp.text
        return resp.json()["id"]

    return {
        "project": obj,
        "habit": habit,
        "past": act(start_at=hier, done=True),
        "future": act(start_at=demain),
        "learning": act(start_at=demain, acts=[{"skill_id": skill, "kind": "study"}]),
        "occurrence": act(start_at=demain, activity_type_id=habit),
        "past_occurrence": act(start_at=hier, activity_type_id=habit, done=True),
    }


_ALL = ("past", "future", "learning", "occurrence", "past_occurrence")


def test_abandoning_removes_nothing(client: TestClient) -> None:
    """Sortie d'un projet (#37, modifie #32) : toutes les activités restent,
    passées comme à venir, générées comme manuelles, avec leur lien."""
    s = _abandon_setup(client)

    resp = client.patch(f"/projects/{s['project']}", json={"status": "abandoned"})
    assert resp.status_code == 200, resp.text

    for key in _ALL:
        activity = client.get(f"/activities/{s[key]}")
        assert activity.status_code == 200, key
        assert project_ids(activity.json()) == [s["project"]], key


def test_reopening_keeps_generated_occurrences(client: TestClient) -> None:
    s = _abandon_setup(client)
    client.patch(f"/projects/{s['project']}", json={"status": "abandoned"})

    client.patch(f"/projects/{s['project']}", json={"status": "todo"})

    occurrence = client.get(f"/activities/{s['occurrence']}").json()
    assert project_ids(occurrence) == [s["project"]]


# --- Supprimer (design #32, modifié par #37) ----------------------------------


def test_deleting_keeps_every_activity_without_its_link(client: TestClient) -> None:
    """Supprimer le projet retire ses liens ; les activités restent toutes."""
    s = _abandon_setup(client)

    assert client.delete(f"/projects/{s['project']}").status_code == 204

    for key in _ALL:
        resp = client.get(f"/activities/{s[key]}")
        assert resp.status_code == 200, key
        assert project_ids(resp.json()) == [], key
    assert client.get(f"/activity-types/{s['habit']}").status_code == 200


def test_deleting_keeps_the_other_projects(client: TestClient) -> None:
    """Une activité liée à deux projets garde celui qui reste."""
    s = _abandon_setup(client)
    domain_id = client.get(f"/projects/{s['project']}").json()["domain_ids"][0]
    other = client.post(
        f"/domains/{domain_id}/projects", json=project_payload("Autre saison")
    ).json()["id"]
    client.patch(
        f"/activities/{s['future']}",
        json={"projects": [{"project_id": s["project"]}, {"project_id": other}]},
    )

    client.delete(f"/projects/{s['project']}")

    assert project_ids(client.get(f"/activities/{s['future']}").json()) == [other]


def test_patching_one_bound_is_checked_against_the_other(client: TestClient) -> None:
    """Une seule borne envoyée se compare à celle déjà posée (design #32)."""
    domain_id = _domain(client)
    project = _project(client, domain_id, start_at="2026-09-01", due_at="2026-09-30")
    late_start = client.patch(
        f"/projects/{project['id']}", json={"start_at": "2026-10-15"}
    )
    early_due = client.patch(
        f"/projects/{project['id']}", json={"due_at": "2026-08-01"}
    )
    assert late_start.status_code == 422
    assert early_due.status_code == 422
    kept = client.get(f"/projects/{project['id']}").json()
    assert (kept["start_at"], kept["due_at"]) == ("2026-09-01", "2026-09-30")


# --- Brouillons de cycle : le lien les prépare, la suppression les remporte ---


def _plans(client: TestClient, skill_id: str) -> list[dict]:
    return client.get(f"/skills/{skill_id}/plans").json()


def test_creating_with_skills_prepares_their_drafts(client: TestClient) -> None:
    """Comme `PUT …/skills` : s'engager sur un savoir lui prépare un cycle."""
    domain_id = _domain(client)
    skill = _skill(client, domain_id, "Béchamel")

    _project(client, domain_id, skill_ids=[skill])

    assert [p["state"] for p in _plans(client, skill)] == ["draft"]


def test_a_step_only_distributes_the_cycle_of_its_project(
    client: TestClient,
) -> None:
    """Une étape ne distribue que ce que le projet a déclaré : elle ne
    prépare pas de second cycle, celui du projet suffit."""
    domain_id = _domain(client)
    skill = _skill(client, domain_id, "Velouté")
    project = _project(client, domain_id, skill_ids=[skill])

    resp = client.post(
        f"/projects/{project['id']}/steps",
        json={"title": "Les liaisons", "skill_ids": [skill]},
    )

    assert resp.status_code == 201, resp.text
    plans = _plans(client, skill)
    assert [p["state"] for p in plans] == ["draft"]
    assert plans[0]["project_ids"] == [project["id"]]


def test_deleting_takes_back_the_untouched_drafts(client: TestClient) -> None:
    domain_id = _domain(client)
    vierge = _skill(client, domain_id, "Béchamel")
    cadre = _skill(client, domain_id, "Espagnole")
    nomme = _skill(client, domain_id, "Velouté")
    project = _project(client, domain_id, skill_ids=[vierge, cadre, nomme])
    draft = _plans(client, cadre)[0]
    client.patch(f"/plans/{draft['id']}", json={"target_level": "Sans grumeaux"})
    named = _plans(client, nomme)[0]
    client.patch(f"/plans/{named['id']}", json={"name": "Les veloutés"})

    assert client.delete(f"/projects/{project['id']}").status_code == 204

    assert _plans(client, vierge) == []
    assert len(_plans(client, cadre)) == 1
    assert len(_plans(client, nomme)) == 1


# --- Abandonner une création : ce que ses liens ont posé part avec elle ---


def _discard_setup(client: TestClient) -> dict:
    """Un projet dont une activité type posée chaque jour a couvert
    aujourd'hui (et la suite de la semaine), plus une activité à part."""
    domain_id = _domain(client)
    project = _project(client, domain_id)["id"]
    habit = client.post(
        "/activity-types", json={"domain_id": domain_id, "title": "Fond"}
    ).json()["id"]
    resp = client.put(
        f"/projects/{project}/activity-types/{habit}", json={"planning": "daily"}
    )
    assert resp.status_code == 200, resp.text
    today = date.today()
    # Une semaine préparée : au moins deux occurrences, quel que soit le jour.
    until = str(today + timedelta(days=7))
    assert client.post("/planning/prepare", json={"until": until}).status_code == 200
    posed = client.get(
        "/activities",
        params={
            "start": f"{today}T00:00:00",
            "end": f"{today + timedelta(days=8)}T00:00:00",
        },
    ).json()
    occurrences = sorted(
        (a for a in posed if a["activity_type_id"] == habit),
        key=lambda a: a["start_at"],
    )
    assert len(occurrences) >= 2, occurrences
    manual = client.post(
        "/activities",
        json={
            "domain_id": domain_id,
            "projects": [{"project_id": project}],
            "title": "Séance à part",
            "start_at": f"{today + timedelta(days=1)}T10:00:00",
        },
    ).json()["id"]
    return {
        "project": project,
        "domain": domain_id,
        "occurrences": [a["id"] for a in occurrences],
        "manual": manual,
    }


def test_an_ordinary_delete_keeps_the_posed_occurrences(client: TestClient) -> None:
    s = _discard_setup(client)

    client.delete(f"/projects/{s['project']}")

    for occurrence in s["occurrences"]:
        assert client.get(f"/activities/{occurrence}").status_code == 200


def test_discarding_a_creation_removes_its_untouched_occurrences(
    client: TestClient,
) -> None:
    s = _discard_setup(client)
    touched, *rest = s["occurrences"]
    # Touchée : une note lui donne une vie propre, elle reste.
    client.patch(f"/activities/{touched}", json={"notes": "Sortie avec le club"})

    resp = client.delete(f"/projects/{s['project']}", params={"discard_posed": True})

    assert resp.status_code == 204
    assert client.get(f"/activities/{touched}").status_code == 200
    for occurrence in rest:
        assert client.get(f"/activities/{occurrence}").status_code == 404
    # Sans activité type, elle n'a pas été posée par un lien.
    assert client.get(f"/activities/{s['manual']}").status_code == 200


def test_discarding_keeps_an_occurrence_shared_with_another_project(
    client: TestClient,
) -> None:
    s = _discard_setup(client)
    other = client.post(
        f"/domains/{s['domain']}/projects", json=project_payload("Autre saison")
    ).json()["id"]
    shared = s["occurrences"][0]
    client.patch(
        f"/activities/{shared}",
        json={"projects": [{"project_id": s["project"]}, {"project_id": other}]},
    )

    client.delete(f"/projects/{s['project']}", params={"discard_posed": True})

    assert project_ids(client.get(f"/activities/{shared}").json()) == [other]


# --- L'emoji d'un projet ---


def test_a_project_chooses_its_emoji(client: TestClient) -> None:
    domain_id = _domain(client)
    obj = _project(client, domain_id)
    # Sans choix : nul, l'écran prend celui du domaine principal.
    assert obj["emoji"] is None

    set_ = client.patch(f"/projects/{obj['id']}", json={"emoji": "🥫"})
    assert set_.json()["emoji"] == "🥫"

    cleared = client.patch(f"/projects/{obj['id']}", json={"emoji": None})
    assert cleared.json()["emoji"] is None

    created = _project(client, domain_id, emoji="🍲")
    assert created["emoji"] == "🍲"
