"""Ce qu'une séance porte pour le rituel de semaine (#92) : les réalisations
qu'elle prépare, son report d'une semaine ; et la date du verdict d'un objet
de pratique."""

import uuid

from fastapi.testclient import TestClient

from tests.helpers import project_payload


def _domain(client: TestClient, name: str = "Course") -> str:
    return client.post("/domains", json={"name": name}).json()["id"]


def _project(client: TestClient, domain_id: str, title: str = "Trail") -> str:
    resp = client.post(f"/domains/{domain_id}/projects", json=project_payload(title))
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _achievement(client: TestClient, project_id: str, title: str) -> dict:
    return client.post(
        f"/projects/{project_id}/achievements", json={"title": title}
    ).json()


def _activity(client: TestClient, domain_id: str, **body) -> dict:
    resp = client.post(
        "/activities",
        json={
            "domain_id": domain_id,
            "title": "Sortie longue",
            "start_at": "2026-10-11T07:00:00",
            "end_at": "2026-10-11T09:00:00",
            **body,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


# --- Réalisations ↔ séances ---------------------------------------------------


def test_a_session_prepares_an_achievement_of_its_project(
    client: TestClient,
) -> None:
    d = _domain(client)
    obj = _project(client, d)
    a = _achievement(client, obj, "Reconnaître le parcours")
    s1 = _activity(client, d, projects=[{"project_id": obj}])
    s2 = _activity(
        client,
        d,
        projects=[{"project_id": obj}],
        start_at="2026-10-04T07:00:00",
        end_at="2026-10-04T08:00:00",
    )

    read = client.post(
        f"/activities/{s1['id']}/achievements", json={"achievement_id": a["id"]}
    )
    assert read.status_code == 200, read.text
    assert read.json()["achievements"] == [
        {
            "id": a["id"],
            "project_id": obj,
            "title": "Reconnaître le parcours",
            "emoji": None,
            "done": False,
        }
    ]
    # Plusieurs séances par réalisation ; lier deux fois ne change rien.
    client.post(
        f"/activities/{s2['id']}/achievements", json={"achievement_id": a["id"]}
    )
    client.post(
        f"/activities/{s2['id']}/achievements", json={"achievement_id": a["id"]}
    )

    (achievement,) = client.get(f"/projects/{obj}").json()["achievements"]
    assert [x["id"] for x in achievement["activities"]] == [s2["id"], s1["id"]]
    # Lier ne coche rien.
    assert achievement["done"] is False


def test_a_session_only_prepares_achievements_of_its_projects(
    client: TestClient,
) -> None:
    d = _domain(client)
    obj = _project(client, d)
    other = _project(client, d, "Marathon")
    a = _achievement(client, other, "Dossard retiré")
    s = _activity(client, d, projects=[{"project_id": obj}])

    resp = client.post(
        f"/activities/{s['id']}/achievements", json={"achievement_id": a["id"]}
    )
    assert resp.status_code == 422
    resp = client.post(
        f"/activities/{s['id']}/achievements",
        json={"achievement_id": str(uuid.uuid4())},
    )
    assert resp.status_code == 422


def test_unlinking_keeps_the_achievement(client: TestClient) -> None:
    d = _domain(client)
    obj = _project(client, d)
    a = _achievement(client, obj, "Reconnaître le parcours")
    s = _activity(client, d, projects=[{"project_id": obj}])
    client.post(f"/activities/{s['id']}/achievements", json={"achievement_id": a["id"]})

    read = client.delete(f"/activities/{s['id']}/achievements/{a['id']}")
    assert read.status_code == 200
    assert read.json()["achievements"] == []
    assert (
        client.delete(f"/activities/{s['id']}/achievements/{a['id']}").status_code
        == 404
    )
    assert len(client.get(f"/projects/{obj}").json()["achievements"]) == 1


def test_removing_the_project_unlinks_its_achievements(client: TestClient) -> None:
    d = _domain(client)
    trail = _project(client, d)
    route = _project(client, d, "Route")
    a = _achievement(client, trail, "Reconnaître le parcours")
    b = _achievement(client, route, "Semi sous 1h45")
    s = _activity(client, d, projects=[{"project_id": trail}, {"project_id": route}])
    for x in (a, b):
        client.post(
            f"/activities/{s['id']}/achievements", json={"achievement_id": x["id"]}
        )

    read = client.patch(
        f"/activities/{s['id']}", json={"projects": [{"project_id": route}]}
    ).json()
    assert [x["id"] for x in read["achievements"]] == [b["id"]]


def test_deleting_either_side_drops_the_link(client: TestClient) -> None:
    d = _domain(client)
    obj = _project(client, d)
    a = _achievement(client, obj, "A")
    b = _achievement(client, obj, "B")
    s = _activity(client, d, projects=[{"project_id": obj}])
    other = _activity(client, d, projects=[{"project_id": obj}])
    for x in (a, b):
        client.post(
            f"/activities/{s['id']}/achievements", json={"achievement_id": x["id"]}
        )
    client.post(
        f"/activities/{other['id']}/achievements", json={"achievement_id": a["id"]}
    )

    client.delete(f"/achievements/{b['id']}")
    assert [
        x["id"] for x in client.get(f"/activities/{s['id']}").json()["achievements"]
    ] == [a["id"]]

    client.delete(f"/activities/{s['id']}")
    (left,) = client.get(f"/projects/{obj}").json()["achievements"]
    assert [x["id"] for x in left["activities"]] == [other["id"]]


# --- Reporter -------------------------------------------------------------------


def test_postponing_moves_a_week_later_and_keeps_everything(
    client: TestClient,
) -> None:
    d = _domain(client)
    obj = _project(client, d)
    a = _achievement(client, obj, "Reconnaître le parcours")
    s = _activity(client, d, projects=[{"project_id": obj}])
    client.post(f"/activities/{s['id']}/achievements", json={"achievement_id": a["id"]})
    metric = client.post(
        f"/domains/{d}/metrics", json={"name": "10 km", "direction": "down"}
    ).json()
    target = client.post(
        f"/metrics/{metric['id']}/values",
        json={"value": 2900, "measured_at": "2026-10-11", "activity_id": s["id"]},
    ).json()

    read = client.post(f"/activities/{s['id']}/postpone")
    assert read.status_code == 200, read.text
    moved = read.json()
    assert moved["start_at"] == "2026-10-18T07:00:00"
    assert moved["end_at"] == "2026-10-18T09:00:00"
    assert moved["postponed_from"] == "2026-10-11"
    assert [x["project_id"] for x in moved["projects"]] == [obj]
    assert [x["id"] for x in moved["achievements"]] == [a["id"]]
    (value,) = client.get(f"/activities/{s['id']}/metric-values").json()
    assert value["id"] == target["id"]
    assert value["measured_at"] == "2026-10-18"

    # Reportée deux fois, elle garde son jour d'origine.
    again = client.post(f"/activities/{s['id']}/postpone").json()
    assert again["start_at"] == "2026-10-25T07:00:00"
    assert again["postponed_from"] == "2026-10-11"


def test_postponing_an_all_day_activity_keeps_it_all_day(client: TestClient) -> None:
    d = _domain(client)
    s = _activity(
        client,
        d,
        all_day=True,
        start_at="2026-10-11T00:00:00",
        end_at="2026-10-11T00:00:00",
    )
    moved = client.post(f"/activities/{s['id']}/postpone").json()
    assert moved["all_day"] is True
    assert moved["start_at"] == "2026-10-18T00:00:00"


def test_a_done_or_undated_activity_does_not_postpone(client: TestClient) -> None:
    d = _domain(client)
    done = _activity(client, d, done=True)
    undated = _activity(client, d, start_at=None, end_at=None)

    assert client.post(f"/activities/{done['id']}/postpone").status_code == 422
    assert client.post(f"/activities/{undated['id']}/postpone").status_code == 422


# --- Le verdict d'un objet de pratique se date ------------------------------


def test_a_practice_verdict_is_dated(client: TestClient) -> None:
    d = _domain(client, "Tennis")
    s = client.post(f"/domains/{d}/skills", json={"name": "Chandelle"}).json()["id"]
    plan = client.post(f"/skills/{s}/plans", json={"state": "active"}).json()
    item = client.post(
        f"/skills/{s}/practice", json={"title": "Panier", "plan_id": plan["id"]}
    ).json()

    read = client.patch(
        f"/plans/{plan['id']}/items/{item['id']}", json={"done": True}
    ).json()
    assert read["items"][0]["done_at"] is not None

    read = client.patch(
        f"/plans/{plan['id']}/items/{item['id']}", json={"done": False}
    ).json()
    assert read["items"][0]["done_at"] is None


def test_a_practice_act_reads_its_item(client: TestClient) -> None:
    d = _domain(client, "Tennis")
    s = client.post(f"/domains/{d}/skills", json={"name": "Chandelle"}).json()["id"]
    item = client.post(
        f"/skills/{s}/practice", json={"title": "Panier", "emoji": "🧺"}
    ).json()
    activity = _activity(
        client,
        d,
        acts=[
            {"skill_id": s, "kind": "practice", "practice_item_id": item["id"]},
            {"skill_id": s, "kind": "study"},
        ],
    )
    practice, study = activity["acts"]
    assert (practice["item_title"], practice["item_emoji"]) == ("Panier", "🧺")
    assert (study["item_title"], study["item_emoji"]) == (None, None)


def test_unpostponing_brings_it_back_with_its_targets(client: TestClient) -> None:
    d = _domain(client)
    s = _activity(client, d)
    metric = client.post(f"/domains/{d}/metrics", json={"name": "10 km"}).json()
    client.post(
        f"/metrics/{metric['id']}/values",
        json={"value": 2900, "measured_at": "2026-10-11", "activity_id": s["id"]},
    )
    client.post(f"/activities/{s['id']}/postpone")
    client.post(f"/activities/{s['id']}/postpone")

    once = client.post(f"/activities/{s['id']}/unpostpone").json()
    assert once["start_at"] == "2026-10-18T07:00:00"
    assert once["postponed_from"] == "2026-10-11"

    back = client.post(f"/activities/{s['id']}/unpostpone").json()
    assert back["start_at"] == "2026-10-11T07:00:00"
    assert back["postponed_from"] is None
    (value,) = client.get(f"/activities/{s['id']}/metric-values").json()
    assert value["measured_at"] == "2026-10-11"

    # Plus rien à annuler.
    assert client.post(f"/activities/{s['id']}/unpostpone").status_code == 422
