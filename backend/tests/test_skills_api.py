"""Tests de l'API Skill : CRUD, reparent, cascade et mapping des erreurs."""

import uuid

from fastapi.testclient import TestClient

from tests.helpers import project_payload


def _domain(client: TestClient, name: str = "Maths") -> str:
    return client.post("/domains", json={"name": name}).json()["id"]


def _skill(
    client: TestClient, domain_id: str, name: str, parent_id: str | None = None
) -> dict:
    payload = {"name": name}
    if parent_id is not None:
        payload["parent_skill_id"] = parent_id
    resp = client.post(f"/domains/{domain_id}/skills", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


# --- CRUD ---


def test_create_skill_defaults(client: TestClient) -> None:
    domain_id = _domain(client)

    skill = _skill(client, domain_id, "Algèbre")

    assert skill["name"] == "Algèbre"
    assert skill["domain_id"] == domain_id
    assert skill["parent_skill_id"] is None
    assert skill["status"] == "not_started"
    assert skill["order"] == 0


def test_create_skill_in_unknown_domain_404(client: TestClient) -> None:
    resp = client.post(f"/domains/{uuid.uuid4()}/skills", json={"name": "X"})

    assert resp.status_code == 404


def test_list_skills_scoped_to_domain(client: TestClient) -> None:
    maths = _domain(client, "Maths")
    physique = _domain(client, "Physique")
    _skill(client, maths, "Algèbre")
    _skill(client, physique, "Mécanique")

    resp = client.get(f"/domains/{maths}/skills")

    assert resp.status_code == 200
    names = [s["name"] for s in resp.json()]
    assert names == ["Algèbre"]


def test_update_skill_status(client: TestClient) -> None:
    domain_id = _domain(client)
    skill = _skill(client, domain_id, "Algèbre")

    resp = client.patch(f"/skills/{skill['id']}", json={"status": "in_progress"})

    assert resp.status_code == 200
    assert resp.json()["status"] == "in_progress"


def test_delete_skill_cascades_subtree(client: TestClient) -> None:
    domain_id = _domain(client)
    root = _skill(client, domain_id, "Algèbre")
    child = _skill(client, domain_id, "Équations", parent_id=root["id"])

    resp = client.delete(f"/skills/{root['id']}")

    assert resp.status_code == 204
    assert client.get(f"/skills/{child['id']}").status_code == 404


# --- Création : invariants ---


def test_create_at_any_depth(client: TestClient) -> None:
    """L'arbre n'a plus de plafond : un domaine large demande un niveau de
    tiroirs avant d'arriver aux sujets, et trois n'y suffisaient pas."""
    domain_id = _domain(client)
    parent = _skill(client, domain_id, "CS")
    for nom in ("DSA", "Graphes", "Parcours"):
        parent = _skill(client, domain_id, nom, parent_id=parent["id"])

    resp = client.post(
        f"/domains/{domain_id}/skills",
        json={"name": "BFS", "parent_skill_id": parent["id"]},
    )

    assert resp.status_code == 201, resp.text


def test_create_with_parent_in_other_domain_returns_422(client: TestClient) -> None:
    maths = _domain(client, "Maths")
    physique = _domain(client, "Physique")
    parent = _skill(client, physique, "Mécanique")

    resp = client.post(
        f"/domains/{maths}/skills",
        json={"name": "Algèbre", "parent_skill_id": parent["id"]},
    )

    assert resp.status_code == 422


# --- Reparent ---


def test_reparent_moves_skill(client: TestClient) -> None:
    domain_id = _domain(client)
    root = _skill(client, domain_id, "Algèbre")
    leaf = _skill(client, domain_id, "Nombres")

    resp = client.post(
        f"/skills/{leaf['id']}/reparent", json={"new_parent_id": root["id"]}
    )

    assert resp.status_code == 200
    assert resp.json()["parent_skill_id"] == root["id"]


def test_reparent_to_root(client: TestClient) -> None:
    domain_id = _domain(client)
    root = _skill(client, domain_id, "Algèbre")
    child = _skill(client, domain_id, "Équations", parent_id=root["id"])

    resp = client.post(f"/skills/{child['id']}/reparent", json={"new_parent_id": None})

    assert resp.status_code == 200
    assert resp.json()["parent_skill_id"] is None


def test_reparent_under_descendant_returns_409(client: TestClient) -> None:
    domain_id = _domain(client)
    root = _skill(client, domain_id, "Algèbre")
    child = _skill(client, domain_id, "Équations", parent_id=root["id"])

    resp = client.post(
        f"/skills/{root['id']}/reparent", json={"new_parent_id": child["id"]}
    )

    assert resp.status_code == 409


def test_reparent_unknown_skill_404(client: TestClient) -> None:
    resp = client.post(f"/skills/{uuid.uuid4()}/reparent", json={"new_parent_id": None})

    assert resp.status_code == 404


# --- Pas de nature de nœud : tout est savoir (23/09/2026) ---


def test_un_noeud_n_expose_pas_de_nature(client: TestClient) -> None:
    """La catégorie n'existe plus dans le modèle — elle ne fuit pas dans l'API."""
    d = _domain(client)

    assert "kind" not in _skill(client, d, "Split-step")


def test_decomposer_un_savoir_ne_lui_retire_rien(client: TestClient) -> None:
    """Ajouter des enfants à un savoir travaillé : il continue sa vie.

    C'est le geste que la nature déclarée rendait pénible — requalifier, délier
    d'abord, perdre le statut. Ici, rien ne bouge.
    """
    d = _domain(client)
    s = _skill(client, d, "Chandelle")
    client.patch(f"/skills/{s['id']}", json={"status": "in_progress"})
    obj = client.post(f"/domains/{d}/projects", json=project_payload("Saison 1")).json()
    client.put(f"/projects/{obj['id']}/skills", json={"skill_ids": [s["id"]]})

    _skill(client, d, "Chandelle défensive", parent_id=s["id"])
    _skill(client, d, "Chandelle agressive", parent_id=s["id"])

    assert client.get(f"/skills/{s['id']}").json()["status"] == "in_progress"
    linked = client.get(f"/projects/{obj['id']}").json()["skill_ids"]
    assert linked == [s["id"]]


def test_un_parent_a_son_propre_statut(client: TestClient) -> None:
    """Pas d'agrégation : le parent répond pour lui, pas pour ses enfants."""
    d = _domain(client)
    parent = _skill(client, d, "Posture & appuis")
    child = _skill(client, d, "Split-step", parent_id=parent["id"])

    resp = client.patch(f"/skills/{parent['id']}", json={"status": "acquired"})

    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "acquired"
    assert client.get(f"/skills/{child['id']}").json()["status"] == "not_started"


def test_un_parent_se_lie_avec_ses_enfants(client: TestClient) -> None:
    """Lier le parent et ses enfants au même projet est un cas voulu."""
    d = _domain(client)
    parent = _skill(client, d, "Déplacement")
    child = _skill(client, d, "Body drag", parent_id=parent["id"])
    obj = client.post(f"/domains/{d}/projects", json=project_payload("Saison 1")).json()

    resp = client.put(
        f"/projects/{obj['id']}/skills",
        json={"skill_ids": [parent["id"], child["id"]]},
    )

    assert resp.status_code == 200, resp.text


def test_a_new_skill_lands_last_among_its_siblings(client: TestClient) -> None:
    """Sans rang demandé, il ne partage pas celui de l'aîné."""
    domain_id = _domain(client)
    parent = _skill(client, domain_id, "Algèbre")
    first = _skill(client, domain_id, "Zèbre", parent["id"])
    second = _skill(client, domain_id, "Anneaux", parent["id"])

    assert first["order"] == 0
    assert second["order"] == 1
    # À la racine, seuls les frères de la racine comptent.
    assert _skill(client, domain_id, "Analyse")["order"] == 1


# --- Niveau : la jauge à quatre crans (#44) ---


def test_skill_level_follows_status_and_cycle(client: TestClient) -> None:
    """0 vierge, 1 en cours sans cycle actif, la sous-phase du cycle, 4 acquis."""
    domain_id = _domain(client)
    fresh = _skill(client, domain_id, "Vierge")
    started = _skill(client, domain_id, "Commencé")
    client.patch(f"/skills/{started['id']}", json={"status": "in_progress"})
    practising = _skill(client, domain_id, "En pratique")
    resp = client.post(
        f"/skills/{practising['id']}/plans",
        json={
            "state": "active",
            "study": True,
            "isolated": True,
        },
    )
    assert resp.status_code == 201, resp.text
    validated = client.post(f"/plans/{resp.json()['id']}/study/validate")
    assert validated.status_code == 200, validated.text
    acquired = _skill(client, domain_id, "Acquis")
    client.patch(f"/skills/{acquired['id']}", json={"status": "acquired"})

    levels = {
        s["name"]: s["level"] for s in client.get(f"/domains/{domain_id}/skills").json()
    }

    assert fresh["level"] == 0
    assert levels == {"Vierge": 0, "Commencé": 1, "En pratique": 2, "Acquis": 4}
