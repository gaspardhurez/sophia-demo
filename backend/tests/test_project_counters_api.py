"""Tests des **compteurs** d'un projet (#194, chantier « l'envie plutôt que
le rythme », point 5).

Les compteurs du projet sont ceux du domaine restreints à ses activités liées,
sans ceux qu'un de ses Totaux porte déjà.
"""

from datetime import date, datetime

from fastapi.testclient import TestClient

from tests.helpers import project_payload

J0 = date.today()


def _at(hour: int) -> str:
    return datetime.combine(J0, datetime.min.time()).replace(hour=hour).isoformat()


def _domain(client: TestClient) -> str:
    return client.post("/domains", json={"name": "Cuisine"}).json()["id"]


def _project(client: TestClient, domain_id: str, **body) -> dict:
    resp = client.post(
        f"/domains/{domain_id}/projects", json=project_payload("Saison", **body)
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _unit(client: TestClient, name: str) -> str:
    return client.post("/units", json={"name": name}).json()["id"]


def _activity(client: TestClient, domain_id: str, project_id: str, **body) -> None:
    payload = {
        "domain_id": domain_id,
        "title": "Séance",
        "done": True,
        "projects": [{"project_id": project_id}],
        **body,
    }
    resp = client.post("/activities", json=payload)
    assert resp.status_code == 201, resp.text


def _counters(client: TestClient, project_id: str) -> list[tuple[str | None, float]]:
    resp = client.get(f"/projects/{project_id}/counters")
    assert resp.status_code == 200, resp.text
    return [(c["unit"] and c["unit"]["name"], c["total"]) for c in resp.json()]


# --- Les compteurs du projet ---


def test_counters_read_the_linked_activities_only(client: TestClient) -> None:
    d = _domain(client)
    project = _project(client, d)["id"]
    recette = _unit(client, "recette")
    _activity(
        client,
        d,
        project,
        start_at=_at(9),
        end_at=_at(11),
        values=[{"unit_id": recette, "value": 3}],
    )
    # Hors projet : compte au domaine, pas au projet.
    resp = client.post(
        "/activities",
        json={
            "domain_id": d,
            "title": "Libre",
            "done": True,
            "values": [{"unit_id": recette, "value": 5}],
        },
    )
    assert resp.status_code == 201, resp.text

    assert _counters(client, project) == [(None, 2), ("recette", 3)]


def test_a_unit_a_total_carries_has_no_counter(client: TestClient) -> None:
    """Pas de chip de compteur pour ce qu'un Total compte déjà — heures
    comprises."""
    d = _domain(client)
    project = _project(client, d)["id"]
    recette, km = _unit(client, "recette"), _unit(client, "km")
    _activity(
        client,
        d,
        project,
        start_at=_at(9),
        end_at=_at(10),
        values=[{"unit_id": recette, "value": 2}, {"unit_id": km, "value": 4}],
    )
    for body in (
        {"mode": "value", "unit_id": recette, "target": 10},
        {"mode": "duration", "target": 5},
        {"mode": "count", "target": 3},
    ):
        resp = client.post(f"/projects/{project}/totals", json=body)
        assert resp.status_code == 201, resp.text

    assert _counters(client, project) == [("km", 4)]


def test_a_project_without_values_has_no_counter(client: TestClient) -> None:
    d = _domain(client)
    project = _project(client, d)["id"]
    _activity(client, d, project, done=False, start_at=_at(9), end_at=_at(10))

    assert _counters(client, project) == []
