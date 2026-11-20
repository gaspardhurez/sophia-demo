"""Tests des **Réalisations** — l'axe qualitatif du tracking de projet.

Ce qui se vérifie ici n'est pas le CRUD mais la **place de l'axe** : une
réalisation rend un projet dérivable alors qu'elle ne porte aucun nombre, et
elle pèse dans le statut au même titre qu'une cible chiffrée.
"""

import uuid

from fastapi.testclient import TestClient

from tests.helpers import project_payload


def _domain(client: TestClient, name: str = "Aventure") -> str:
    return client.post("/domains", json={"name": name}).json()["id"]


def _project(client: TestClient, domain_id: str, **body) -> str:
    payload = project_payload("Une grande aventure", **body)
    return client.post(f"/domains/{domain_id}/projects", json=payload).json()["id"]


def _achievement(client: TestClient, project_id: str, title: str, **body) -> dict:
    resp = client.post(
        f"/projects/{project_id}/achievements",
        json={"title": title, **body},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _read(client: TestClient, project_id: str) -> dict:
    return client.get(f"/projects/{project_id}").json()


def test_declared_undone(client: TestClient) -> None:
    """Une réalisation naît **non faite** : on déclare ce qu'on s'engage à
    accomplir, on ne constate pas."""
    d = _domain(client)
    obj = _project(client, d)

    a = _achievement(client, obj, "Partir en bikepacking", emoji="🚲")

    assert a["done"] is False
    assert a["emoji"] == "🚲"
    assert [x["title"] for x in _read(client, obj)["achievements"]] == [
        "Partir en bikepacking"
    ]


def test_an_achievement_makes_the_project_derivable(client: TestClient) -> None:
    """Le point de l'axe : sans nombre, le projet se dérivait à la main.

    « J'ai fait le voyage » est une condition aussi ferme qu'une cible chiffrée,
    et elle n'a aucune raison de retomber dans la saisie manuelle faute de
    quantité à comparer.
    """
    d = _domain(client)
    obj = _project(client, d)

    assert _read(client, obj)["is_tracked"] is False

    a = _achievement(client, obj, "Partir en bikepacking")

    read = _read(client, obj)
    assert read["is_tracked"] is True
    assert read["status"] == "in_progress"

    client.patch(f"/achievements/{a['id']}", json={"done": True})

    assert _read(client, obj)["status"] == "achieved"


def test_every_achievement_counts(client: TestClient) -> None:
    """Pas de majorité : toutes les conditions, ou rien."""
    d = _domain(client)
    obj = _project(client, d)
    first = _achievement(client, obj, "Réserver")
    second = _achievement(client, obj, "Partir")

    client.patch(f"/achievements/{first['id']}", json={"done": True})
    assert _read(client, obj)["status"] == "in_progress"

    client.patch(f"/achievements/{second['id']}", json={"done": True})
    assert _read(client, obj)["status"] == "achieved"


def test_an_achievement_weighs_as_much_as_a_number(client: TestClient) -> None:
    """Le trou que cet axe comble, reproduit : un projet dont la cible
    chiffrée est dépassée n'est pas atteint tant que ce qu'il fallait faire ne
    l'est pas. Par exemple un projet `achieved` à 30 h sur 20 alors que le
    travail prévu restait à faire.
    """
    d = _domain(client, "Dev")
    obj = _project(client, d, title="Lancer une application")
    client.post(f"/projects/{obj}/totals", json={"mode": "count", "target": 1})
    client.post(
        "/activities",
        json={
            "domain_id": d,
            "projects": [{"project_id": obj}],
            "title": "Session",
            "done": True,
        },
    )
    assert _read(client, obj)["status"] == "achieved"  # avant : le chiffre seul

    a = _achievement(client, obj, "Métriques livrées")

    assert _read(client, obj)["status"] == "in_progress"

    client.patch(f"/achievements/{a['id']}", json={"done": True})
    assert _read(client, obj)["status"] == "achieved"


def test_unchecking_reopens(client: TestClient) -> None:
    """Le statut est dérivé, donc il se relit — décocher rouvre le projet."""
    d = _domain(client)
    obj = _project(client, d)
    a = _achievement(client, obj, "Partir")
    client.patch(f"/achievements/{a['id']}", json={"done": True})
    assert _read(client, obj)["status"] == "achieved"

    client.patch(f"/achievements/{a['id']}", json={"done": False})

    assert _read(client, obj)["status"] == "in_progress"


def test_abandon_still_wins(client: TestClient) -> None:
    """L'abandon reste la décision qu'aucune condition ne dira."""
    d = _domain(client)
    obj = _project(client, d)
    a = _achievement(client, obj, "Partir")
    client.patch(f"/achievements/{a['id']}", json={"done": True})

    client.patch(f"/projects/{obj}", json={"status": "abandoned"})

    assert _read(client, obj)["status"] == "abandoned"


def test_rename_and_delete(client: TestClient) -> None:
    d = _domain(client)
    obj = _project(client, d)
    a = _achievement(client, obj, "Partir")

    renamed = client.patch(
        f"/achievements/{a['id']}", json={"title": "Partir en bikepacking"}
    ).json()
    assert renamed["title"] == "Partir en bikepacking"
    assert renamed["done"] is False  # renommer ne coche pas

    assert client.delete(f"/achievements/{a['id']}").status_code == 204
    read = _read(client, obj)
    assert read["achievements"] == []
    # Plus aucune condition : on retombe sur le statut saisi à la main.
    assert read["is_tracked"] is False


def test_deleting_the_project_takes_its_achievements(
    client: TestClient,
) -> None:
    """Elles n'existent que pour lui — contrairement à une métrique, qui vit au
    niveau du domaine et survit au projet qui la visait."""
    d = _domain(client)
    obj = _project(client, d)
    a = _achievement(client, obj, "Partir")

    assert client.delete(f"/projects/{obj}").status_code == 204

    assert (
        client.patch(f"/achievements/{a['id']}", json={"done": True}).status_code == 404
    )


def test_unknown_ids_404(client: TestClient) -> None:
    d = _domain(client)
    assert (
        client.post(
            f"/projects/{uuid.uuid4()}/achievements", json={"title": "X"}
        ).status_code
        == 404
    )
    assert client.delete(f"/achievements/{uuid.uuid4()}").status_code == 404
    _project(client, d)


# --- Distribution d'une réalisation à une étape ----------------------------


def test_an_achievement_can_be_placed_on_a_step(client: TestClient) -> None:
    """La réalisation est la condition, l'étape lui donne son moment."""
    d = _domain(client)
    obj = _project(client, d)
    step = client.post(f"/projects/{obj}/steps", json={"title": "Été"}).json()["steps"][
        -1
    ]
    a = _achievement(client, obj, "Partir")

    placed = client.patch(
        f"/achievements/{a['id']}", json={"step_id": step["id"]}
    ).json()

    assert placed["step_id"] == step["id"]
    # L'étape suit la réalisation qu'elle porte.
    read = _read(client, obj)
    assert read["steps"][0]["done"] is False
    client.patch(f"/achievements/{a['id']}", json={"done": True})
    assert _read(client, obj)["steps"][0]["done"] is True


def test_an_achievement_cannot_land_on_another_projects_step(
    client: TestClient,
) -> None:
    d = _domain(client)
    mine, other = _project(client, d), _project(client, d, title="Autre")
    foreign = client.post(f"/projects/{other}/steps", json={"title": "Été"}).json()[
        "steps"
    ][-1]
    a = _achievement(client, mine, "Partir")

    resp = client.patch(f"/achievements/{a['id']}", json={"step_id": foreign["id"]})

    assert resp.status_code == 422


def test_deleting_the_step_keeps_the_achievement(client: TestClient) -> None:
    """Supprimer une étape **délie** : la condition survit, elle perd sa place."""
    d = _domain(client)
    obj = _project(client, d)
    step = client.post(f"/projects/{obj}/steps", json={"title": "Été"}).json()["steps"][
        -1
    ]
    a = _achievement(client, obj, "Partir")
    client.patch(f"/achievements/{a['id']}", json={"step_id": step["id"]})

    assert client.delete(f"/steps/{step['id']}").status_code == 204

    read = _read(client, obj)
    assert [x["title"] for x in read["achievements"]] == ["Partir"]
    assert read["achievements"][0]["step_id"] is None
    assert read["status"] == "in_progress"  # toujours une condition du projet


def test_ticking_dates_the_achievement(client: TestClient) -> None:
    """La carte dit le jour où c'est fait ; décocher efface la date."""
    obj = _project(client, _domain(client))
    a = _achievement(client, obj, "Traverser")
    assert a["done_at"] is None

    ticked = client.patch(f"/achievements/{a['id']}", json={"done": True}).json()
    assert ticked["done_at"] is not None

    renamed = client.patch(
        f"/achievements/{a['id']}", json={"title": "Traverser à la voile"}
    ).json()
    assert renamed["done_at"] == ticked["done_at"]  # renommer ne redate pas

    unticked = client.patch(f"/achievements/{a['id']}", json={"done": False}).json()
    assert unticked["done_at"] is None
