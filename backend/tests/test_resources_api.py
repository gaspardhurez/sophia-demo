"""Tests des ressources d'un savoir (#81) — elles appartiennent au savoir ;
chaque cycle choisit celles qu'il étudie."""

import uuid

from fastapi.testclient import TestClient


def _skill(client: TestClient, name: str = "Chandelle") -> str:
    d = client.post("/domains", json={"name": "Tennis"}).json()["id"]
    return client.post(f"/domains/{d}/skills", json={"name": name}).json()["id"]


def _resource(client: TestClient, skill_id: str, **body) -> dict:
    payload = {"title": "Tennis MBA, épisode 12", **body}
    resp = client.post(f"/skills/{skill_id}/resources", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_a_resource_belongs_to_the_skill(client: TestClient) -> None:
    s = _skill(client)

    r = _resource(client, s, reference="https://youtu.be/x", part="4:10 → 9:30")

    assert client.get(f"/skills/{s}/resources").json() == [r]
    assert (r["reference"], r["part"]) == ("https://youtu.be/x", "4:10 → 9:30")


def test_the_author_is_apart_from_the_title(client: TestClient) -> None:
    s = _skill(client)

    r = _resource(client, s, title="Effective Python Environment")
    assert r["author"] is None

    edited = client.patch(f"/resources/{r['id']}", json={"author": "Martin Breuss"})
    assert edited.json()["author"] == "Martin Breuss"
    assert edited.json()["title"] == "Effective Python Environment"


def test_resources_of_an_unknown_skill_are_a_404(client: TestClient) -> None:
    assert client.get(f"/skills/{uuid.uuid4()}/resources").status_code == 404


def test_created_from_a_cycle_it_enters_the_cycle(client: TestClient) -> None:
    s = _skill(client)
    plan = client.post(f"/skills/{s}/plans", json={}).json()

    r = _resource(client, s, plan_id=plan["id"])

    assert client.get(f"/skills/{s}/plans").json()[0]["resource_ids"] == [r["id"]]


def test_a_cycle_of_another_skill_is_refused(client: TestClient) -> None:
    s, other = _skill(client), _skill(client, "Volée")
    plan = client.post(f"/skills/{other}/plans", json={}).json()

    resp = client.post(
        f"/skills/{s}/resources", json={"title": "Livre", "plan_id": plan["id"]}
    )

    assert resp.status_code == 422


def test_a_cycle_chooses_its_resources(client: TestClient) -> None:
    s = _skill(client)
    a, b = _resource(client, s, title="Livre"), _resource(client, s, title="Vidéo")
    plan = client.post(f"/skills/{s}/plans", json={}).json()

    read = client.patch(f"/plans/{plan['id']}", json={"resource_ids": [b["id"]]}).json()

    assert read["resource_ids"] == [b["id"]]
    assert a["id"] not in read["resource_ids"]


def test_a_cycle_chooses_only_resources_of_its_skill(client: TestClient) -> None:
    s, other = _skill(client), _skill(client, "Volée")
    foreign = _resource(client, other)
    plan = client.post(f"/skills/{s}/plans", json={}).json()

    resp = client.patch(f"/plans/{plan['id']}", json={"resource_ids": [foreign["id"]]})

    assert resp.status_code == 422


def test_editing_and_deleting_a_resource(client: TestClient) -> None:
    s = _skill(client)
    r = _resource(
        client, s, plan_id=client.post(f"/skills/{s}/plans", json={}).json()["id"]
    )

    edited = client.patch(f"/resources/{r['id']}", json={"part": "chapitre 2"})
    assert edited.json()["part"] == "chapitre 2"

    assert client.delete(f"/resources/{r['id']}").status_code == 204
    assert client.get(f"/skills/{s}/resources").json() == []
    assert client.get(f"/skills/{s}/plans").json()[0]["resource_ids"] == []


def test_deleting_a_resource_leaves_every_cycle_but_spares_the_others(
    client: TestClient,
) -> None:
    s = _skill(client)
    kept, gone = _resource(client, s, title="Livre"), _resource(client, s)
    first = client.post(f"/skills/{s}/plans", json={}).json()["id"]
    second = client.post(f"/skills/{s}/plans", json={}).json()["id"]
    for plan in (first, second):
        client.patch(f"/plans/{plan}", json={"resource_ids": [kept["id"], gone["id"]]})

    assert client.delete(f"/resources/{gone['id']}").status_code == 204

    assert client.get(f"/skills/{s}/resources").json() == [kept]
    plans = client.get(f"/skills/{s}/plans").json()
    assert [p["resource_ids"] for p in plans] == [[kept["id"]], [kept["id"]]]


def test_editing_a_resource_can_clear_its_link_and_part(client: TestClient) -> None:
    s = _skill(client)
    r = _resource(client, s, reference="https://youtu.be/x", part="4:10")

    edited = client.patch(
        f"/resources/{r['id']}",
        json={"title": "Tennis MBA", "reference": None, "part": None},
    ).json()

    assert (edited["title"], edited["reference"], edited["part"]) == (
        "Tennis MBA",
        None,
        None,
    )


def test_an_unknown_resource_is_a_404(client: TestClient) -> None:
    unknown = uuid.uuid4()
    assert client.patch(f"/resources/{unknown}", json={}).status_code == 404
    assert client.delete(f"/resources/{unknown}").status_code == 404


def test_a_resource_title_cannot_be_cleared(client: TestClient) -> None:
    resource = _resource(client, _skill(client), title="Vidéo")
    response = client.patch(f"/resources/{resource['id']}", json={"title": None})
    assert response.status_code == 422
