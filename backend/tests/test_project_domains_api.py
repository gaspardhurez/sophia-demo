"""Un projet dans plusieurs domaines (#203) : le premier est le principal,
les suivants sont secondaires ; ce qui vient d'un domaine qui le quitte se
délie."""

import uuid

from fastapi.testclient import TestClient

from tests.helpers import project_ids, project_payload


def _domain(client: TestClient, name: str) -> str:
    return client.post("/domains", json={"name": name}).json()["id"]


def _skill(client: TestClient, domain_id: str, name: str) -> str:
    return client.post(f"/domains/{domain_id}/skills", json={"name": name}).json()["id"]


def _project(client: TestClient, principal: str, *secondary: str, **body) -> dict:
    payload = project_payload(
        "Hygiène de vie", secondary_domain_ids=list(secondary), **body
    )
    resp = client.post(f"/domains/{principal}/projects", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _set_domains(client: TestClient, project_id: str, *domain_ids: str):
    return client.put(
        f"/projects/{project_id}/domains", json={"domain_ids": list(domain_ids)}
    )


def _tied(client: TestClient) -> dict:
    """Un projet Bien-être + Cuisine qui vise un savoir, planifie une activité
    type, vise un Résultat et compte une activité de Cuisine."""
    bien, cuisine = _domain(client, "Bien-être"), _domain(client, "Cuisine")
    sommeil = _skill(client, bien, "Sommeil")
    batch = _skill(client, cuisine, "Batch cooking")
    project = _project(client, bien, cuisine, skill_ids=[sommeil, batch])
    courses = client.post(
        "/activity-types", json={"domain_id": cuisine, "title": "Courses"}
    ).json()["id"]
    resp = client.put(
        f"/projects/{project['id']}/activity-types/{courses}",
        json={"planning": "manual"},
    )
    assert resp.status_code == 200, resp.text
    metric = client.post(f"/domains/{cuisine}/metrics", json={"name": "Repas"}).json()
    resp = client.put(
        f"/projects/{project['id']}/metrics",
        json={"metric_id": metric["id"], "target": 5},
    )
    assert resp.status_code == 200, resp.text
    activity = client.post(
        "/activities",
        json={
            "domain_id": cuisine,
            "title": "Marché",
            "projects": [{"project_id": project["id"]}],
        },
    )
    assert activity.status_code == 201, activity.text
    return {
        "bien": bien,
        "cuisine": cuisine,
        "sommeil": sommeil,
        "batch": batch,
        "project": project["id"],
        "courses": courses,
        "metric": metric["id"],
        "activity": activity.json()["id"],
    }


# --- Créer, lister ----------------------------------------------------------


def test_a_project_has_its_domains_in_order(client: TestClient) -> None:
    bien, cuisine = _domain(client, "Bien-être"), _domain(client, "Cuisine")

    project = _project(client, bien, cuisine)

    assert project["domain_ids"] == [bien, cuisine]


def test_a_project_is_listed_in_each_of_its_domains(client: TestClient) -> None:
    bien, cuisine, dev = (_domain(client, n) for n in ("Bien-être", "Cuisine", "Dev"))
    project = _project(client, bien, cuisine)

    def listed(domain_id: str) -> list[str]:
        return [p["id"] for p in client.get(f"/domains/{domain_id}/projects").json()]

    assert listed(bien) == [project["id"]]
    assert listed(cuisine) == [project["id"]]
    assert listed(dev) == []


def test_skills_come_from_any_of_its_domains(client: TestClient) -> None:
    bien, cuisine, dev = (_domain(client, n) for n in ("Bien-être", "Cuisine", "Dev"))
    batch = _skill(client, cuisine, "Batch cooking")
    python = _skill(client, dev, "Python")

    project = _project(client, bien, cuisine, skill_ids=[batch])
    assert project["skill_ids"] == [batch]

    resp = client.put(f"/projects/{project['id']}/skills", json={"skill_ids": [python]})
    assert resp.status_code == 422


def test_an_activity_of_a_secondary_domain_counts_for_it(client: TestClient) -> None:
    s = _tied(client)

    activity = client.get(f"/activities/{s['activity']}").json()

    assert project_ids(activity) == [s["project"]]


def test_domains_are_validated(client: TestClient) -> None:
    bien = _domain(client, "Bien-être")
    project = _project(client, bien)

    assert _set_domains(client, project["id"]).status_code == 422
    assert _set_domains(client, project["id"], bien, bien).status_code == 422
    unknown = str(uuid.uuid4())
    assert _set_domains(client, project["id"], bien, unknown).status_code == 422
    resp = client.post(
        f"/domains/{bien}/projects",
        json=project_payload("X", secondary_domain_ids=[bien]),
    )
    assert resp.status_code == 422


# --- Réordonner, retirer ----------------------------------------------------


def test_reordering_changes_the_principal_and_loses_nothing(
    client: TestClient,
) -> None:
    s = _tied(client)

    resp = _set_domains(client, s["project"], s["cuisine"], s["bien"])

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["domain_ids"] == [s["cuisine"], s["bien"]]
    assert set(body["skill_ids"]) == {s["sommeil"], s["batch"]}
    assert [t["activity_type_id"] for t in body["activity_types"]] == [s["courses"]]


def test_ties_list_what_a_leaving_domain_unlinks(client: TestClient) -> None:
    s = _tied(client)

    ties = client.get(f"/projects/{s['project']}/domains/{s['cuisine']}/ties").json()

    assert ties == {
        "skills": [{"id": s["batch"], "title": "Batch cooking"}],
        "activity_types": [{"id": s["courses"], "title": "Courses"}],
        "results": [{"id": s["metric"], "title": "Repas"}],
        "activities": 1,
    }


def test_removing_a_domain_unlinks_what_came_from_it(client: TestClient) -> None:
    s = _tied(client)

    resp = _set_domains(client, s["project"], s["bien"])

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["domain_ids"] == [s["bien"]]
    assert body["skill_ids"] == [s["sommeil"]]
    assert body["activity_types"] == []
    assert client.get(f"/projects/{s['project']}/metrics").json() == []
    assert project_ids(client.get(f"/activities/{s['activity']}").json()) == []
    # Les objets restent au domaine : seul le lien au projet part.
    assert client.get(f"/activity-types/{s['courses']}").status_code == 200
    assert [m["id"] for m in client.get(f"/domains/{s['cuisine']}/metrics").json()] == [
        s["metric"]
    ]


def test_removing_the_principal_makes_the_next_one_principal(
    client: TestClient,
) -> None:
    s = _tied(client)

    body = _set_domains(client, s["project"], s["cuisine"]).json()

    assert body["domain_ids"] == [s["cuisine"]]
    assert body["skill_ids"] == [s["batch"]]


# --- Supprimer un domaine ---------------------------------------------------


def test_usage_lists_the_projects_a_deletion_unlinks(client: TestClient) -> None:
    s = _tied(client)

    usage = client.get(f"/domains/{s['cuisine']}/usage").json()

    assert usage["projects"] == 0
    assert usage["unlinked"] == [
        {
            "id": s["project"],
            "title": "Hygiène de vie",
            "remaining_domain_ids": [s["bien"]],
            "loses": {
                "skills": [{"id": s["batch"], "title": "Batch cooking"}],
                "activity_types": [{"id": s["courses"], "title": "Courses"}],
                "results": [{"id": s["metric"], "title": "Repas"}],
                "activities": 1,
            },
        }
    ]
    principal = client.get(f"/domains/{s['bien']}/usage").json()
    assert principal["projects"] == 1
    assert principal["unlinked"] == []


def test_deleting_a_secondary_domain_unlinks_the_project(client: TestClient) -> None:
    s = _tied(client)

    assert client.delete(f"/domains/{s['cuisine']}").status_code == 204

    project = client.get(f"/projects/{s['project']}")
    assert project.status_code == 200
    body = project.json()
    assert body["domain_ids"] == [s["bien"]]
    assert body["skill_ids"] == [s["sommeil"]]
    assert body["activity_types"] == []


def test_deleting_the_principal_domain_deletes_the_project(
    client: TestClient,
) -> None:
    s = _tied(client)

    assert client.delete(f"/domains/{s['bien']}").status_code == 204

    assert client.get(f"/projects/{s['project']}").status_code == 404
    # Ce qui appartient à l'autre domaine reste.
    assert client.get(f"/activity-types/{s['courses']}").status_code == 200
    assert client.get(f"/activities/{s['activity']}").status_code == 200
