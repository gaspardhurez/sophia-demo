"""Tests de l'API des activités types (#37) : ce qu'on fait, au niveau du domaine.

Leur planification se vérifie dans `test_planning.py` ; ici, l'objet lui-même,
son lien à un projet (domaine, étapes) et ce que sa suppression emporte — ou
plutôt n'emporte pas.
"""

from datetime import date

from fastapi.testclient import TestClient

from tests.helpers import project_payload

TODAY = date.today()


def _domain(client: TestClient, name: str = "Sport") -> str:
    return client.post("/domains", json={"name": name}).json()["id"]


def _type(client: TestClient, domain_id: str, title: str = "Run", **body) -> dict:
    resp = client.post(
        "/activity-types", json={"domain_id": domain_id, "title": title, **body}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _project(client: TestClient, domain_id: str) -> str:
    return client.post(
        f"/domains/{domain_id}/projects", json=project_payload("Semi")
    ).json()["id"]


def test_create_list_and_update(client: TestClient) -> None:
    sport, cuisine = _domain(client), _domain(client, "Cuisine")
    run = _type(client, sport, emoji="🏃", description="Au moins 20 minutes")
    _type(client, cuisine, "Recette")

    listed = client.get("/activity-types", params={"domain_id": sport}).json()
    patched = client.patch(
        f"/activity-types/{run['id']}", json={"title": "Sortie"}
    ).json()

    assert [t["title"] for t in listed] == ["Run"]
    assert run["description"] == "Au moins 20 minutes"
    assert run["fallback_active"] is False
    assert patched["title"] == "Sortie"


def test_create_in_an_unknown_domain_404(client: TestClient) -> None:
    resp = client.post(
        "/activity-types",
        json={"domain_id": "00000000-0000-0000-0000-000000000000", "title": "X"},
    )
    assert resp.status_code == 404


def test_a_type_is_planned_only_in_its_domain(client: TestClient) -> None:
    sport, cuisine = _domain(client), _domain(client, "Cuisine")
    recette = _type(client, cuisine, "Recette")
    obj = _project(client, sport)

    resp = client.put(
        f"/projects/{obj}/activity-types/{recette['id']}",
        json={"planning": "manual"},
    )
    assert resp.status_code == 422


def test_a_link_switches_off_only_its_own_steps(client: TestClient) -> None:
    d = _domain(client)
    run = _type(client, d)
    semi, trail = _project(client, d), _project(client, d)
    foreign = client.post(f"/projects/{trail}/steps", json={"title": "X"}).json()[
        "steps"
    ][0]["id"]

    resp = client.put(
        f"/projects/{semi}/activity-types/{run['id']}",
        json={"planning": "daily", "off_step_ids": [foreign]},
    )
    assert resp.status_code == 422


def test_the_project_reads_its_links(client: TestClient) -> None:
    d = _domain(client)
    run = _type(client, d, emoji="🏃")
    obj = _project(client, d)
    step = client.post(f"/projects/{obj}/steps", json={"title": "Base"}).json()[
        "steps"
    ][0]["id"]

    body = client.put(
        f"/projects/{obj}/activity-types/{run['id']}",
        json={
            "planning": "weekly",
            "weekdays": [4, 0, 2],
            "slot_start": "07:00:00",
            "slot_minutes": 40,
            "preserve_after": True,
            "off_step_ids": [step],
        },
    ).json()

    (link,) = body["activity_types"]
    assert link["title"] == "Run"
    assert link["emoji"] == "🏃"
    assert link["weekdays"] == [0, 2, 4]
    assert link["slot_minutes"] == 40
    assert link["preserve_after"] is True
    assert link["off_step_ids"] == [step]


def test_deleting_a_type_keeps_its_occurrences(client: TestClient) -> None:
    """Toutes ses occurrences restent, sans type ; les Totaux qui ne comptaient
    qu'elle sont supprimés, les autres la perdent de leur « sur »."""
    d = _domain(client)
    run, lift = _type(client, d), _type(client, d, "Lift")
    obj = _project(client, d)
    client.post(
        f"/projects/{obj}/totals",
        json={"mode": "count", "target": 5, "activity_type_ids": [run["id"]]},
    )
    client.post(
        f"/projects/{obj}/totals",
        json={
            "mode": "count",
            "target": 9,
            "activity_type_ids": [run["id"], lift["id"]],
        },
    )
    done = client.post(
        "/activities",
        json={
            "domain_id": d,
            "activity_type_id": run["id"],
            "projects": [{"project_id": obj}],
            "title": "Run",
            "done": True,
        },
    ).json()

    assert client.delete(f"/activity-types/{run['id']}").status_code == 204

    kept = client.get(f"/activities/{done['id']}")
    assert kept.status_code == 200
    assert kept.json()["activity_type_id"] is None
    totals = client.get(f"/projects/{obj}").json()["totals"]
    assert [(t["target"], t["activity_type_ids"]) for t in totals] == [
        (9, [lift["id"]])
    ]
