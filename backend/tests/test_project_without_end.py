"""Tests d'un projet **sans fin prévue** (#196, chantier « l'envie plutôt que
le rythme », point 3).

La fin prévue (`due_at`) est facultative. Sans elle, rien ne se déduit : le
projet n'est jamais Raté ni Réussi tout seul, objectifs remplis ou non ; il se
clôt à la main, et ce geste pose sa fin constatée (`ended_at`), effacée à la
reprise.
"""

from datetime import date, timedelta

from fastapi.testclient import TestClient

J0 = date.today()


def _day(offset: int) -> str:
    return (J0 + timedelta(days=offset)).isoformat()


def _domain(client: TestClient) -> str:
    return client.post("/domains", json={"name": "Cuisine"}).json()["id"]


def _project(client: TestClient, domain_id: str, **body) -> dict:
    payload = {"title": "Cuisine maison", "start_at": _day(-30), "due_at": None, **body}
    resp = client.post(f"/domains/{domain_id}/projects", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_a_project_can_start_without_an_end(client: TestClient) -> None:
    project = _project(client, _domain(client))

    assert (project["due_at"], project["ended_at"]) == (None, None)
    assert project["status"] == "in_progress"


def test_the_end_can_be_removed_then_set_again(client: TestClient) -> None:
    project = _project(client, _domain(client), due_at=_day(30))
    url = f"/projects/{project['id']}"

    removed = client.patch(url, json={"due_at": None})
    assert removed.status_code == 200, removed.text
    assert removed.json()["due_at"] is None

    back = client.patch(url, json={"due_at": _day(10)})
    assert back.json()["due_at"] == _day(10)


def test_an_end_before_the_start_is_still_refused(client: TestClient) -> None:
    project = _project(client, _domain(client))

    resp = client.patch(f"/projects/{project['id']}", json={"due_at": _day(-40)})

    assert resp.status_code == 422


def test_met_objectives_do_not_close_it(client: TestClient) -> None:
    """Objectifs remplis : constaté, pas clos — l'issue se règle à la main."""
    d = _domain(client)
    project = _project(client, d)["id"]
    client.post(f"/projects/{project}/totals", json={"mode": "count", "target": 1})
    resp = client.post(
        "/activities",
        json={
            "domain_id": d,
            "title": "Séance",
            "done": True,
            "projects": [{"project_id": project}],
        },
    )
    assert resp.status_code == 201, resp.text

    read = client.get(f"/projects/{project}").json()
    assert read["targets_met"] is True
    assert read["status"] == "in_progress"

    # « Valider » (#197) : la clôture à la main, qui pose la fin constatée.
    validated = client.patch(f"/projects/{project}", json={"status": "achieved"})
    assert (validated.json()["status"], validated.json()["ended_at"]) == (
        "achieved",
        _day(0),
    )


def test_it_is_never_failed_on_its_own(client: TestClient) -> None:
    d = _domain(client)
    project = _project(client, d, start_at=_day(-400))["id"]
    client.post(f"/projects/{project}/totals", json={"mode": "count", "target": 5})

    assert client.get(f"/projects/{project}").json()["status"] == "in_progress"


def test_closing_by_hand_records_the_end_and_resuming_clears_it(
    client: TestClient,
) -> None:
    project = _project(client, _domain(client))["id"]
    url = f"/projects/{project}"

    achieved = client.patch(url, json={"status": "achieved"}).json()
    assert (achieved["status"], achieved["ended_at"]) == ("achieved", _day(0))

    abandoned = client.patch(url, json={"status": "abandoned"}).json()
    assert (abandoned["status"], abandoned["ended_at"]) == ("abandoned", _day(0))

    resumed = client.patch(url, json={"status": "todo"}).json()
    assert (resumed["status"], resumed["ended_at"]) == ("in_progress", None)
