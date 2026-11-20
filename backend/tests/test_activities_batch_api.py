"""Tests des gestes sur une sélection d'activités (calendrier, sélection
multiple) : déplacer du même décalage et supprimer, toutes ou aucune."""

import uuid

from fastapi.testclient import TestClient


def _domain(client: TestClient, name: str = "Sport") -> str:
    return client.post("/domains", json={"name": name}).json()["id"]


def _activity(client: TestClient, domain_id: str, **body) -> dict:
    payload = {"domain_id": domain_id, "title": "Sortie", **body}
    resp = client.post("/activities", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _timed(client: TestClient, d: str, start: str, end: str, **body) -> dict:
    return _activity(client, d, start_at=start, end_at=end, **body)


def _bounds(client: TestClient, activity_id: str) -> tuple[str, str | None]:
    a = client.get(f"/activities/{activity_id}").json()
    return a["start_at"], a["end_at"]


def test_a_selection_moves_by_the_same_shift(client: TestClient) -> None:
    """Toutes prennent le même décalage : leurs écarts sont gardés."""
    d = _domain(client)
    a = _timed(client, d, "2026-10-19T09:00:00", "2026-10-19T10:00:00")
    b = _timed(client, d, "2026-10-21T18:30:00", "2026-10-21T19:15:00")

    resp = client.post(
        "/activities/move",
        json={"ids": [a["id"], b["id"]], "days": 1, "minutes": 90},
    )

    assert resp.status_code == 200, resp.text
    assert len(resp.json()) == 2
    assert _bounds(client, a["id"]) == ("2026-10-20T10:30:00", "2026-10-20T11:30:00")
    assert _bounds(client, b["id"]) == ("2026-10-22T20:00:00", "2026-10-22T20:45:00")


def test_an_all_day_activity_moves_by_whole_days(client: TestClient) -> None:
    """Une journée entière n'a pas d'heure : les minutes ne la touchent pas."""
    d = _domain(client)
    day = _activity(
        client,
        d,
        all_day=True,
        start_at="2026-10-19T00:00:00",
        end_at="2026-10-19T00:00:00",
    )
    timed = _timed(client, d, "2026-10-19T09:00:00", "2026-10-19T10:00:00")

    client.post(
        "/activities/move",
        json={"ids": [day["id"], timed["id"]], "days": -2, "minutes": 30},
    )

    assert _bounds(client, day["id"]) == ("2026-10-17T00:00:00", "2026-10-17T00:00:00")
    assert _bounds(client, timed["id"]) == (
        "2026-10-17T09:30:00",
        "2026-10-17T10:30:00",
    )


def test_moving_a_selection_moves_its_measures(client: TestClient) -> None:
    """Comme pour une seule : changer de jour emporte les relevés ; changer
    seulement l'heure ne les touche pas."""
    d = _domain(client, "Musculation")
    seance = _timed(client, d, "2026-10-19T18:00:00", "2026-10-19T19:00:00", done=True)
    m = client.post(f"/domains/{d}/metrics", json={"name": "Squat 1RM"}).json()
    client.post(
        f"/metrics/{m['id']}/values",
        json={"value": 118, "measured_at": "2026-10-19", "activity_id": seance["id"]},
    )

    client.post("/activities/move", json={"ids": [seance["id"]], "minutes": 60})
    assert client.get(f"/metrics/{m['id']}").json()["latest"]["measured_at"] == (
        "2026-10-19"
    )

    client.post("/activities/move", json={"ids": [seance["id"]], "days": 3})
    assert client.get(f"/metrics/{m['id']}").json()["latest"]["measured_at"] == (
        "2026-10-22"
    )


def test_moving_back_restores_the_selection(client: TestClient) -> None:
    """Le décalage inverse est l'annulation (⌘Z au calendrier)."""
    d = _domain(client)
    a = _timed(client, d, "2026-10-19T09:00:00", "2026-10-19T10:00:00")
    ids = [a["id"]]

    client.post("/activities/move", json={"ids": ids, "days": 2, "minutes": -45})
    client.post("/activities/move", json={"ids": ids, "days": -2, "minutes": 45})

    assert _bounds(client, a["id"]) == ("2026-10-19T09:00:00", "2026-10-19T10:00:00")


def test_an_undated_activity_refuses_the_whole_move(client: TestClient) -> None:
    """Toutes ou aucune : une activité sans date fait refuser le geste, et
    les autres ne bougent pas."""
    d = _domain(client)
    a = _timed(client, d, "2026-10-19T09:00:00", "2026-10-19T10:00:00")
    undated = _activity(client, d)

    resp = client.post(
        "/activities/move", json={"ids": [a["id"], undated["id"]], "days": 1}
    )

    assert resp.status_code == 422
    assert _bounds(client, a["id"]) == ("2026-10-19T09:00:00", "2026-10-19T10:00:00")


def test_an_unknown_id_refuses_the_whole_move(client: TestClient) -> None:
    d = _domain(client)
    a = _timed(client, d, "2026-10-19T09:00:00", "2026-10-19T10:00:00")

    resp = client.post(
        "/activities/move", json={"ids": [a["id"], str(uuid.uuid4())], "days": 1}
    )

    assert resp.status_code == 404
    assert _bounds(client, a["id"]) == ("2026-10-19T09:00:00", "2026-10-19T10:00:00")


def test_an_empty_selection_is_refused(client: TestClient) -> None:
    assert client.post("/activities/move", json={"ids": []}).status_code == 422
    assert client.post("/activities/delete", json={"ids": []}).status_code == 422


def test_a_selection_is_deleted_at_once(client: TestClient) -> None:
    d = _domain(client)
    a = _timed(client, d, "2026-10-19T09:00:00", "2026-10-19T10:00:00")
    b = _activity(client, d)
    kept = _activity(client, d, title="Gardée")

    resp = client.post("/activities/delete", json={"ids": [a["id"], b["id"]]})

    assert resp.status_code == 204
    left = client.get("/activities", params={"domain_id": d}).json()
    assert [x["id"] for x in left] == [kept["id"]]


def test_an_unknown_id_deletes_nothing(client: TestClient) -> None:
    d = _domain(client)
    a = _activity(client, d)

    resp = client.post("/activities/delete", json={"ids": [a["id"], str(uuid.uuid4())]})

    assert resp.status_code == 404
    assert client.get(f"/activities/{a['id']}").status_code == 200
