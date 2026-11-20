"""Un relevé posé sur une séance pas encore faite est une **cible** : il ne
compte qu'une fois la séance faite (05/10/2026). Un relevé sans séance compte
toujours. La règle vaut pour tous les lecteurs."""

from fastapi.testclient import TestClient

from tests.helpers import project_payload


def _domain(client: TestClient) -> str:
    return client.post("/domains", json={"name": "Muscu"}).json()["id"]


def _metric(client: TestClient, domain_id: str, **body) -> dict:
    payload = {"name": "Squat 1RM", "direction": "up", **body}
    resp = client.post(f"/domains/{domain_id}/metrics", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _session(client: TestClient, domain_id: str, day: str, done: bool) -> dict:
    return client.post(
        "/activities",
        json={
            "domain_id": domain_id,
            "title": "Fullbody",
            "start_at": f"{day}T18:00:00",
            "end_at": f"{day}T19:00:00",
            "done": done,
        },
    ).json()


def _value(client: TestClient, metric_id: str, value: float, day: str, **body):
    resp = client.post(
        f"/metrics/{metric_id}/values",
        json={"value": value, "measured_at": day, **body},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _project(client: TestClient, domain_id: str, metric_id: str, target: float):
    obj = client.post(
        f"/domains/{domain_id}/projects",
        json=project_payload("Muscu 2026", start_at="2026-06-01", due_at="2027-06-01"),
    ).json()["id"]
    client.put(
        f"/projects/{obj}/metrics",
        json={"metric_id": metric_id, "target": target},
    )
    return obj


def test_a_measure_on_an_undone_session_is_a_target(client: TestClient) -> None:
    d = _domain(client)
    m = _metric(client, d)
    _value(client, m["id"], 100, "2026-07-01")
    seance = _session(client, d, "2026-07-10", done=False)
    target = _value(client, m["id"], 130, "2026-07-10", activity_id=seance["id"])

    assert target["counts"] is False
    read = client.get(f"/metrics/{m['id']}").json()
    assert read["latest"]["value"] == 100
    assert read["best"]["value"] == 100
    # La courbe ne lit que ce qui compte ; les cibles se demandent.
    assert [v["value"] for v in client.get(f"/metrics/{m['id']}/values").json()] == [
        100
    ]
    all_values = client.get(
        f"/metrics/{m['id']}/values", params={"include_targets": True}
    ).json()
    assert [(v["value"], v["counts"]) for v in all_values] == [
        (100, True),
        (130, False),
    ]
    # La séance montre sa cible.
    on_session = client.get(f"/activities/{seance['id']}/metric-values").json()
    assert [(v["value"], v["counts"]) for v in on_session] == [(130, False)]


def test_doing_the_session_makes_the_target_count(client: TestClient) -> None:
    d = _domain(client)
    m = _metric(client, d)
    seance = _session(client, d, "2026-07-10", done=False)
    _value(client, m["id"], 130, "2026-07-10", activity_id=seance["id"])

    client.patch(f"/activities/{seance['id']}", json={"done": True})
    assert client.get(f"/metrics/{m['id']}").json()["best"]["value"] == 130

    client.patch(f"/activities/{seance['id']}", json={"done": False})
    assert client.get(f"/metrics/{m['id']}").json()["best"] is None


def test_a_target_never_meets_a_result(client: TestClient) -> None:
    d = _domain(client)
    m = _metric(client, d)
    obj = _project(client, d, m["id"], 120)
    _value(client, m["id"], 90, "2026-05-01")  # avant la saison : la barre
    _value(client, m["id"], 100, "2026-07-01")
    seance = _session(client, d, "2026-07-10", done=False)
    _value(client, m["id"], 125, "2026-07-10", activity_id=seance["id"])

    (result,) = client.get(f"/projects/{obj}/metrics").json()
    assert result["best_in_period"]["value"] == 100
    assert result["baseline"]["value"] == 90
    assert result["start"]["value"] == 90
    assert result["is_met"] is False


def test_a_target_is_not_a_baseline_nor_a_start(client: TestClient) -> None:
    d = _domain(client)
    m = _metric(client, d)
    obj = _project(client, d, m["id"], 120)
    before = _session(client, d, "2026-05-01", done=False)
    planned = _value(client, m["id"], 110, "2026-05-01", activity_id=before["id"])
    _value(client, m["id"], 100, "2026-07-01")

    # Désigner une cible comme départ ne prend pas : la règle reprend la main.
    client.put(
        f"/projects/{obj}/metrics/{m['id']}/start",
        json={"value_id": planned["id"]},
    )
    (result,) = client.get(f"/projects/{obj}/metrics").json()
    assert result["baseline"] is None
    assert result["start"]["value"] == 100


def test_a_step_palier_is_not_crossed_by_a_target(client: TestClient) -> None:
    d = _domain(client)
    m = _metric(client, d)
    obj = _project(client, d, m["id"], 120)
    client.post(f"/projects/{obj}/steps", json={"title": "Automne"})
    step = client.get(f"/projects/{obj}").json()["steps"][0]
    resp = client.put(
        f"/steps/{step['id']}/metrics", json={"metric_id": m["id"], "target": 105}
    )
    assert resp.status_code == 200, resp.text
    seance = _session(client, d, "2026-07-10", done=False)
    _value(client, m["id"], 110, "2026-07-10", activity_id=seance["id"])

    read = client.get(f"/projects/{obj}").json()["steps"][0]
    assert read["metrics"][0]["is_met"] is False

    client.patch(f"/activities/{seance['id']}", json={"done": True})
    read = client.get(f"/projects/{obj}").json()["steps"][0]
    assert read["metrics"][0]["is_met"] is True
