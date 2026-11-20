"""Tests de la suppression d'une unité — annoncer, puis supprimer ou remplacer.

Décision du 24/09/2026 (design #27) : sans remplacement, Totaux et valeurs
déclarées partent avec l'unité, métriques et activités types sont déliées ; avec
remplacement, tout bascule vers l'autre unité. Rien ne se retrouve sans unité là
où elle est indispensable.
"""

from fastapi.testclient import TestClient

from tests.helpers import project_payload


def _setup(client: TestClient) -> dict:
    """Une unité « KM » employée partout : un Total, une valeur, une métrique,
    une activité type."""
    d = client.post("/domains", json={"name": "Course"}).json()["id"]
    km = client.post("/units", json={"name": "KM"}).json()["id"]
    obj = client.post(f"/domains/{d}/projects", json=project_payload("300 km")).json()[
        "id"
    ]
    client.post(
        f"/projects/{obj}/totals",
        json={"mode": "value", "unit_id": km, "target": 300},
    )
    activity = client.post(
        "/activities",
        json={
            "domain_id": d,
            "projects": [{"project_id": obj}],
            "title": "Sortie",
            "done": True,
            "values": [{"unit_id": km, "value": 12}],
        },
    ).json()["id"]
    metric = client.post(
        f"/domains/{d}/metrics", json={"name": "Plus longue sortie", "unit_id": km}
    ).json()["id"]
    habit = client.post(
        "/activity-types", json={"domain_id": d, "title": "Run", "unit_id": km}
    ).json()["id"]
    return {
        "domain": d,
        "km": km,
        "project": obj,
        "activity": activity,
        "metric": metric,
        "habit": habit,
    }


def test_usage_counts_the_four_uses(client: TestClient) -> None:
    s = _setup(client)

    usage = client.get(f"/units/{s['km']}/usage").json()

    assert usage == {"totals": 1, "values": 1, "metrics": 1, "activity_types": 1}


def test_deleting_removes_totals_and_values_unlinks_the_rest(
    client: TestClient,
) -> None:
    s = _setup(client)

    assert client.delete(f"/units/{s['km']}").status_code == 204

    assert client.get(f"/projects/{s['project']}").json()["totals"] == []
    assert client.get(f"/activities/{s['activity']}").json()["values"] == []
    assert client.get(f"/metrics/{s['metric']}").json()["unit_id"] is None
    assert client.get(f"/activity-types/{s['habit']}").json()["unit_id"] is None


def test_replacing_moves_everything_to_the_other_unit(client: TestClient) -> None:
    """Le geste du ménage : « KM » était un doublon de « km »."""
    s = _setup(client)
    km = client.post("/units", json={"name": "kilomètre"}).json()["id"]

    resp = client.delete(f"/units/{s['km']}", params={"replace_by": km})

    assert resp.status_code == 204
    (total,) = client.get(f"/projects/{s['project']}").json()["totals"]
    assert total["unit"]["id"] == km
    assert total["progress"] == 12  # la valeur a suivi, sans conversion
    (value,) = client.get(f"/activities/{s['activity']}").json()["values"]
    assert value["unit_id"] == km
    assert client.get(f"/metrics/{s['metric']}").json()["unit_id"] == km
    assert client.get(f"/activity-types/{s['habit']}").json()["unit_id"] == km


def test_a_unit_does_not_replace_itself(client: TestClient) -> None:
    s = _setup(client)

    resp = client.delete(f"/units/{s['km']}", params={"replace_by": s["km"]})

    assert resp.status_code == 422
    assert client.get(f"/units/{s['km']}/usage").json()["totals"] == 1


def test_a_unit_ending_in_s_x_z_keeps_its_plural(client: TestClient) -> None:
    """Règle unique du pluriel (#58) : « + s », sauf après s, x ou z."""
    read = client.post("/units", json={"name": "pas"}).json()
    assert read["effective_plural"] == "pas"
    read = client.post("/units", json={"name": "brasse"}).json()
    assert read["effective_plural"] == "brasses"
