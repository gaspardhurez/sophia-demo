"""Tests des **compteurs** d'un domaine (chantier « l'envie plutôt que le
rythme », point 5).

Un compteur est une trace de ce qui a été fait, sans attendu : un par unité
déclarée par les activités du domaine, plus les heures lues au calendrier. Il
apparaît seul dès la première valeur et cumule depuis toujours ; le total de
l'année l'accompagne. Mêmes règles de comptage qu'un Total : seules les
activités faites comptent.
"""

from datetime import date, datetime, timedelta

from fastapi.testclient import TestClient

from tests.helpers import project_payload

J0 = date.today()


def _at(day: date, hour: int) -> str:
    return datetime.combine(day, datetime.min.time()).replace(hour=hour).isoformat()


def _domain(client: TestClient, name: str = "Cuisine") -> str:
    return client.post("/domains", json={"name": name}).json()["id"]


def _unit(client: TestClient, name: str, **body) -> str:
    return client.post("/units", json={"name": name, **body}).json()["id"]


def _activity(client: TestClient, domain_id: str, **body) -> dict:
    payload = {"domain_id": domain_id, "title": "Séance", "done": True, **body}
    resp = client.post("/activities", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _counters(client: TestClient, domain_id: str) -> list[dict]:
    resp = client.get(f"/domains/{domain_id}/counters")
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_a_domain_without_values_has_no_counter(client: TestClient) -> None:
    d = _domain(client)
    _activity(client, d, all_day=True, start_at=_at(J0, 0), end_at=_at(J0, 0))

    assert _counters(client, d) == []


def test_hours_come_first_then_each_declared_unit(client: TestClient) -> None:
    d = _domain(client)
    recette = _unit(client, "recette", emoji="🍳")
    pain = _unit(client, "pain")
    _activity(
        client,
        d,
        start_at=_at(J0, 18),
        end_at=_at(J0, 20),
        values=[{"unit_id": recette, "value": 2}, {"unit_id": pain, "value": 1}],
    )
    _activity(client, d, values=[{"unit_id": recette, "value": 1}])

    counters = _counters(client, d)

    assert [(c["unit"] and c["unit"]["name"], c["total"]) for c in counters] == [
        (None, 2),
        ("pain", 1),
        ("recette", 3),
    ]
    assert counters[2]["unit"]["emoji"] == "🍳"


def test_only_done_activities_count(client: TestClient) -> None:
    d = _domain(client)
    km = _unit(client, "km")
    _activity(client, d, values=[{"unit_id": km, "value": 10}])
    tomorrow = J0 + timedelta(days=1)
    _activity(
        client,
        d,
        done=False,
        start_at=_at(tomorrow, 9),
        end_at=_at(tomorrow, 11),
        values=[{"unit_id": km, "value": 20}],
    )

    assert [
        (c["unit"] and c["unit"]["name"], c["total"]) for c in _counters(client, d)
    ] == [("km", 10)]


def test_a_counter_runs_with_or_without_a_project(client: TestClient) -> None:
    """Le compteur appartient au domaine : il ne dépend d'aucun projet."""
    d = _domain(client)
    km = _unit(client, "km")
    project = client.post(
        f"/domains/{d}/projects", json=project_payload("Saison")
    ).json()["id"]
    _activity(
        client,
        d,
        projects=[{"project_id": project}],
        values=[{"unit_id": km, "value": 5}],
    )
    _activity(client, d, values=[{"unit_id": km, "value": 7}])

    (counter,) = _counters(client, d)
    assert counter["total"] == 12


def test_since_forever_with_the_year_apart(client: TestClient) -> None:
    d = _domain(client)
    last_year = date(J0.year - 1, 3, 4)
    _activity(client, d, start_at=_at(last_year, 9), end_at=_at(last_year, 12))
    _activity(client, d, start_at=_at(J0, 9), end_at=_at(J0, 10))

    (hours,) = _counters(client, d)

    assert hours["unit"] is None
    assert (hours["total"], hours["year_total"]) == (4, 1)
    assert hours["since"] == last_year.isoformat()


def test_counters_stay_within_their_domain(client: TestClient) -> None:
    cuisine, sport = _domain(client), _domain(client, "Sport")
    _activity(client, sport, start_at=_at(J0, 9), end_at=_at(J0, 10))

    assert _counters(client, cuisine) == []


def test_unknown_domain_returns_404(client: TestClient) -> None:
    resp = client.get("/domains/00000000-0000-0000-0000-000000000000/counters")

    assert resp.status_code == 404
