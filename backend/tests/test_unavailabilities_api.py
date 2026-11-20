"""Tests des indisponibilités (#105) — une période, des créneaux bloqués dedans."""

from fastapi.testclient import TestClient

WEEKEND = {
    "title": "Chez les parents",
    "emoji": "🏡",
    "start_at": "2026-10-03T09:00:00",
    "end_at": "2026-10-04T20:00:00",
}
TRAIN = {
    "title": "Train",
    "emoji": "🚆",
    "start_at": "2026-10-03T09:00:00",
    "end_at": "2026-10-03T11:00:00",
}


def _create(client: TestClient, **over) -> dict:
    resp = client.post("/unavailabilities", json={**WEEKEND, **over})
    assert resp.status_code == 201, resp.text
    return resp.json()


def _window(client: TestClient, start: str, end: str) -> list[str]:
    resp = client.get("/unavailabilities", params={"start": start, "end": end})
    assert resp.status_code == 200
    return [u["title"] for u in resp.json()]


def test_an_unavailability_is_created_without_slots(client: TestClient) -> None:
    u = _create(client)

    assert u["title"] == "Chez les parents"
    assert u["all_day"] is False
    assert u["slots"] == []


def test_the_list_returns_what_touches_the_window(client: TestClient) -> None:
    _create(client)

    assert _window(client, "2026-09-28T00:00:00", "2026-10-05T00:00:00") == [
        "Chez les parents"
    ]
    # La semaine suivante commence après la fin : rien.
    assert _window(client, "2026-10-05T00:00:00", "2026-10-12T00:00:00") == []
    # Une fenêtre qui se termine pile au début ne la touche pas.
    assert _window(client, "2026-10-01T00:00:00", "2026-10-03T09:00:00") == []


def test_whole_days_run_until_the_next_midnight(client: TestClient) -> None:
    """En journées entières, `end_at` est le dernier jour à minuit : ce jour-là
    compte en entier."""
    _create(
        client,
        all_day=True,
        start_at="2026-10-03T00:00:00",
        end_at="2026-10-04T00:00:00",
    )

    assert _window(client, "2026-10-04T12:00:00", "2026-10-04T13:00:00") == [
        "Chez les parents"
    ]
    assert _window(client, "2026-10-05T00:00:00", "2026-10-06T00:00:00") == []


def test_a_single_whole_day_is_allowed(client: TestClient) -> None:
    _create(
        client,
        all_day=True,
        start_at="2026-10-03T00:00:00",
        end_at="2026-10-03T00:00:00",
    )


def test_the_end_must_come_after_the_start(client: TestClient) -> None:
    resp = client.post(
        "/unavailabilities",
        json={**WEEKEND, "end_at": "2026-10-03T08:00:00"},
    )

    assert resp.status_code == 422


def test_slots_live_inside_their_unavailability(client: TestClient) -> None:
    u = _create(client)

    resp = client.post(f"/unavailabilities/{u['id']}/slots", json=TRAIN)
    assert resp.status_code == 201
    assert [s["title"] for s in resp.json()["slots"]] == ["Train"]

    outside = client.post(
        f"/unavailabilities/{u['id']}/slots",
        json={**TRAIN, "start_at": "2026-10-03T07:00:00"},
    )
    assert outside.status_code == 422


def test_slots_come_back_in_time_order(client: TestClient) -> None:
    u = _create(client)
    client.post(
        f"/unavailabilities/{u['id']}/slots",
        json={
            **TRAIN,
            "title": "Retour",
            "start_at": "2026-10-04T18:00:00",
            "end_at": "2026-10-04T20:00:00",
        },
    )
    resp = client.post(f"/unavailabilities/{u['id']}/slots", json=TRAIN)

    assert [s["title"] for s in resp.json()["slots"]] == ["Train", "Retour"]


def test_moving_the_dates_cannot_leave_a_slot_outside(client: TestClient) -> None:
    """Rien ne se réajuste en silence : le changement est refusé, et
    l'indisponibilité reste telle quelle."""
    u = _create(client)
    client.post(f"/unavailabilities/{u['id']}/slots", json=TRAIN)

    resp = client.patch(
        f"/unavailabilities/{u['id']}", json={"start_at": "2026-10-03T12:00:00"}
    )

    assert resp.status_code == 422
    kept = client.get(
        "/unavailabilities",
        params={"start": "2026-10-01T00:00:00", "end": "2026-10-08T00:00:00"},
    ).json()[0]
    assert kept["start_at"] == "2026-10-03T09:00:00"


def test_a_slot_is_edited_and_removed(client: TestClient) -> None:
    u = _create(client)
    slot = client.post(f"/unavailabilities/{u['id']}/slots", json=TRAIN).json()[
        "slots"
    ][0]
    base = f"/unavailabilities/{u['id']}/slots/{slot['id']}"

    renamed = client.patch(base, json={"title": "TGV"})
    assert renamed.json()["slots"][0]["title"] == "TGV"

    too_long = client.patch(base, json={"end_at": "2026-10-05T11:00:00"})
    assert too_long.status_code == 422

    removed = client.delete(base)
    assert removed.json()["slots"] == []


def test_deleting_takes_the_slots_along(client: TestClient, db) -> None:
    from sophia.infrastructure.models import UnavailabilitySlot

    u = _create(client)
    client.post(f"/unavailabilities/{u['id']}/slots", json=TRAIN)

    assert client.delete(f"/unavailabilities/{u['id']}").status_code == 204
    assert db.query(UnavailabilitySlot).count() == 0
    assert (
        client.patch(f"/unavailabilities/{u['id']}", json={"title": "x"}).status_code
        == 404
    )
