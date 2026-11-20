"""Tests des envies et engagements (#215) — deux listes écrites d'un bloc."""

import uuid

from fastapi.testclient import TestClient


def _id() -> str:
    return str(uuid.uuid4())


def _put(client: TestClient, kind: str, items: list[dict]):
    return client.put(f"/wishes/{kind}", json={"items": items})


def test_nothing_written_yet(client: TestClient) -> None:
    assert client.get("/wishes").json() == []


def test_a_list_comes_back_in_its_order(client: TestClient) -> None:
    a, b = _id(), _id()
    resp = _put(
        client, "wish", [{"id": b, "text": "Lire"}, {"id": a, "text": "Courir"}]
    )

    assert resp.status_code == 200, resp.text
    listed = client.get("/wishes").json()
    assert [(w["id"], w["text"], w["position"]) for w in listed] == [
        (b, "Lire", 0),
        (a, "Courir", 1),
    ]


def test_writing_a_list_replaces_it(client: TestClient) -> None:
    """Ce qui n'y est plus disparaît ; une puce gardée garde son id."""
    a, b, c = _id(), _id(), _id()
    _put(client, "wish", [{"id": a, "text": "A"}, {"id": b, "text": "B"}])
    _put(client, "wish", [{"id": c, "text": "C"}, {"id": a, "text": "A bis"}])

    listed = client.get("/wishes").json()
    assert [(w["id"], w["text"]) for w in listed] == [(c, "C"), (a, "A bis")]


def test_the_two_lists_are_independent(client: TestClient) -> None:
    """Écrire les engagements ne touche pas aux envies ; les envies passent
    d'abord."""
    w, g = _id(), _id()
    _put(client, "commitment", [{"id": g, "text": "S'inscrire à un tournoi"}])
    _put(client, "wish", [{"id": w, "text": "Un match"}])
    _put(client, "commitment", [{"id": g, "text": "S'inscrire à un tournoi"}])

    listed = client.get("/wishes").json()
    assert [(x["kind"], x["id"]) for x in listed] == [
        ("wish", w),
        ("commitment", g),
    ]


def test_a_bullet_does_not_change_list(client: TestClient) -> None:
    w = _id()
    _put(client, "wish", [{"id": w, "text": "Un match"}])

    resp = _put(client, "commitment", [{"id": w, "text": "Un match"}])

    assert resp.status_code == 422
    assert client.get("/wishes").json()[0]["kind"] == "wish"


def test_a_bullet_appears_once(client: TestClient) -> None:
    w = _id()
    resp = _put(client, "wish", [{"id": w, "text": "a"}, {"id": w, "text": "b"}])

    assert resp.status_code == 422


def test_an_empty_bullet_is_refused(client: TestClient) -> None:
    assert _put(client, "wish", [{"id": _id(), "text": ""}]).status_code == 422


def test_a_bullet_takes_a_domain(client: TestClient) -> None:
    tennis = client.post("/domains", json={"name": "Tennis"}).json()["id"]
    w = _id()
    _put(client, "wish", [{"id": w, "text": "Un match", "domain_id": tennis}])

    assert client.get("/wishes").json()[0]["domain_id"] == tennis


def test_an_unknown_domain_is_refused(client: TestClient) -> None:
    resp = _put(client, "wish", [{"id": _id(), "text": "x", "domain_id": _id()}])

    assert resp.status_code == 422
    assert client.get("/wishes").json() == []


def test_deleting_the_domain_keeps_the_bullet(client: TestClient) -> None:
    tennis = client.post("/domains", json={"name": "Tennis"}).json()["id"]
    w = _id()
    _put(client, "wish", [{"id": w, "text": "Un match", "domain_id": tennis}])

    assert client.delete(f"/domains/{tennis}").status_code == 204

    listed = client.get("/wishes").json()
    assert [(x["id"], x["domain_id"]) for x in listed] == [(w, None)]
