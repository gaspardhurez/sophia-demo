"""Filet de sécurité sur le CRUD Domain — valide aussi que le harnais tourne."""

from fastapi.testclient import TestClient

from tests.helpers import project_payload


def test_create_domain(client: TestClient) -> None:
    resp = client.post("/domains", json={"name": "Maths", "emoji": "📐"})

    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Maths"
    assert body["emoji"] == "📐"
    assert body["vision"] is None
    assert "id" in body


def test_create_domain_rejects_empty_name(client: TestClient) -> None:
    resp = client.post("/domains", json={"name": ""})

    assert resp.status_code == 422


def test_domain_color_set_update_and_validation(client: TestClient) -> None:
    created = client.post("/domains", json={"name": "Cuisine", "color": "amber"})
    assert created.status_code == 201
    assert created.json()["color"] == "amber"

    patched = client.patch(f"/domains/{created.json()['id']}", json={"color": "rose"})
    assert patched.status_code == 200
    assert patched.json()["color"] == "rose"

    # Couleur hors palette → rejetée.
    bad = client.post("/domains", json={"name": "X", "color": "chartreuse"})
    assert bad.status_code == 422


def test_a_domain_always_has_a_color(client: TestClient) -> None:
    """Sans couleur, un domaine reçoit la suivante dans l'ordre de la palette
    (celle que le formulaire présélectionne) ; on ne peut pas la lui retirer."""
    first = client.post("/domains", json={"name": "Maths"}).json()
    second = client.post("/domains", json={"name": "Sport"}).json()
    assert (first["color"], second["color"]) == ("emerald", "teal")

    erased = client.patch(f"/domains/{first['id']}", json={"color": None})
    assert erased.status_code == 422
    # Absente, elle reste inchangée.
    kept = client.patch(f"/domains/{first['id']}", json={"name": "Algèbre"})
    assert kept.json()["color"] == "emerald"


def test_create_and_update_domain_vision(client: TestClient) -> None:
    created = client.post(
        "/domains", json={"name": "Photo", "vision": "Composer de belles images"}
    ).json()
    assert created["vision"] == "Composer de belles images"

    resp = client.patch(f"/domains/{created['id']}", json={"vision": "Sortir un album"})
    assert resp.status_code == 200
    assert resp.json()["vision"] == "Sortir un album"


def test_get_domain(client: TestClient) -> None:
    created = client.post("/domains", json={"name": "Physique"}).json()

    resp = client.get(f"/domains/{created['id']}")

    assert resp.status_code == 200
    assert resp.json()["id"] == created["id"]


def test_get_unknown_domain_returns_404(client: TestClient) -> None:
    resp = client.get("/domains/00000000-0000-0000-0000-000000000000")

    assert resp.status_code == 404


def test_list_domains_sorted_by_name(client: TestClient) -> None:
    client.post("/domains", json={"name": "Zoologie"})
    client.post("/domains", json={"name": "Algèbre"})

    resp = client.get("/domains")

    assert resp.status_code == 200
    names = [d["name"] for d in resp.json()]
    assert names == ["Algèbre", "Zoologie"]


def test_update_domain(client: TestClient) -> None:
    created = client.post("/domains", json={"name": "Chimie"}).json()

    resp = client.patch(f"/domains/{created['id']}", json={"emoji": "⚗️"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["emoji"] == "⚗️"
    assert body["name"] == "Chimie"  # champ non touché préservé


def test_domaine_cree_actif_et_se_met_en_veille(client: TestClient) -> None:
    """Un domaine naît actif — mettre en veille est un geste, pas un défaut.

    Et la veille ne touche à rien d'autre : le domaine reste lisible, ses
    projets et son arbre restent en place. Seul l'accueil le range.
    """
    created = client.post("/domains", json={"name": "Escalade"}).json()
    assert created["status"] == "active"

    resp = client.patch(f"/domains/{created['id']}", json={"status": "paused"})

    assert resp.status_code == 200
    assert resp.json()["status"] == "paused"
    assert resp.json()["name"] == "Escalade"
    # Toujours listé : la page « Domaines » les montre tous, sans filtre.
    assert any(d["id"] == created["id"] for d in client.get("/domains").json())


def test_statut_de_domaine_inconnu_refuse(client: TestClient) -> None:
    created = client.post("/domains", json={"name": "Voile"}).json()

    resp = client.patch(f"/domains/{created['id']}", json={"status": "dormant"})

    assert resp.status_code == 422


def test_delete_domain(client: TestClient) -> None:
    created = client.post("/domains", json={"name": "Éphémère"}).json()

    resp = client.delete(f"/domains/{created['id']}")

    assert resp.status_code == 204
    assert client.get(f"/domains/{created['id']}").status_code == 404


def test_usage_counts_what_a_deletion_takes(client: TestClient) -> None:
    """Design #51 : la modale de suppression énumère, en nombres, ce qui part —
    seulement ce qui appartient à ce domaine."""
    d = client.post("/domains", json={"name": "Cuisine"}).json()["id"]
    other = client.post("/domains", json={"name": "Piano"}).json()["id"]
    for dom in (d, other):
        client.post(f"/domains/{dom}/skills", json={"name": "Sauces"})
        client.post(f"/domains/{dom}/projects", json=project_payload("Menus"))
        client.post("/activities", json={"domain_id": dom, "title": "Cuisine"})
        client.post("/activity-types", json={"domain_id": dom, "title": "Courses"})
        client.post(f"/domains/{dom}/metrics", json={"name": "Temps de préparation"})
    client.post(f"/domains/{d}/skills", json={"name": "Couteau"})
    client.post("/activities", json={"domain_id": d, "title": "Marché"})

    usage = client.get(f"/domains/{d}/usage")

    assert usage.status_code == 200
    assert usage.json() == {
        "skills": 2,
        "projects": 1,
        "activities": 2,
        "activity_types": 1,
        "metrics": 1,
        "unlinked": [],
    }


def test_usage_of_an_unknown_domain_is_404(client: TestClient) -> None:
    resp = client.get("/domains/00000000-0000-0000-0000-000000000000/usage")

    assert resp.status_code == 404
