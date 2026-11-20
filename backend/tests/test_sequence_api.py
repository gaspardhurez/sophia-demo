"""La séquence d'acquisition (design #27, décidée le 24/09/2026) : le rang vit
sur le lien projet ↔ savoir, nul = hors séquence ; l'étape est une coupe."""

from fastapi.testclient import TestClient

from tests.helpers import project_payload


def _domain(client: TestClient) -> str:
    return client.post("/domains", json={"name": "Dev"}).json()["id"]


def _skills(client: TestClient, d: str, *names: str) -> list[str]:
    return [
        client.post(f"/domains/{d}/skills", json={"name": n}).json()["id"]
        for n in names
    ]


def _project(client: TestClient, d: str, skill_ids: list[str]) -> str:
    resp = client.post(
        f"/domains/{d}/projects",
        json=project_payload("Apprendre Python", skill_ids=skill_ids),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _step(client: TestClient, obj: str, title: str) -> str:
    resp = client.post(f"/projects/{obj}/steps", json={"title": title})
    assert resp.status_code == 201, resp.text
    steps = client.get(f"/projects/{obj}").json()["steps"]
    return next(s["id"] for s in steps if s["title"] == title)


def _seq(client: TestClient, obj: str) -> dict[str, int | None]:
    learning = client.get(f"/projects/{obj}").json()["learning"]
    return {x["name"]: x["position"] for x in learning}


def _step_skills(client: TestClient, obj: str) -> dict[str, list[str]]:
    o = client.get(f"/projects/{obj}").json()
    return {s["title"]: s["skill_ids"] for s in o["steps"]}


def test_a_linked_skill_falls_out_of_sequence(client: TestClient) -> None:
    d = _domain(client)
    a, b = _skills(client, d, "Arrays", "Graphes")
    obj = _project(client, d, [a, b])
    assert _seq(client, obj) == {"Arrays": None, "Graphes": None}


def test_flat_sequence_is_written_in_one_go(client: TestClient) -> None:
    d = _domain(client)
    a, b, c = _skills(client, d, "Arrays", "Graphes", "Tries")
    obj = _project(client, d, [a, b, c])
    resp = client.put(
        f"/projects/{obj}/sequence", json={"segments": [{"skill_ids": [c, a]}]}
    )
    assert resp.status_code == 200, resp.text
    assert _seq(client, obj) == {"Tries": 1, "Arrays": 2, "Graphes": None}
    # La lecture suit la séquence, hors séquence en dernier.
    names = [x["name"] for x in resp.json()["learning"]]
    assert names == ["Tries", "Arrays", "Graphes"]


def test_ranks_run_through_the_steps(client: TestClient) -> None:
    d = _domain(client)
    a, b, c = _skills(client, d, "Arrays", "Graphes", "Tries")
    obj = _project(client, d, [a, b, c])
    s1 = _step(client, obj, "Fondamentaux")
    s2 = _step(client, obj, "System design")
    # Segments dans le désordre : c'est l'ordre des étapes qui fait le rang.
    resp = client.put(
        f"/projects/{obj}/sequence",
        json={
            "segments": [
                {"step_id": s2, "skill_ids": [b]},
                {"step_id": s1, "skill_ids": [c, a]},
            ]
        },
    )
    assert resp.status_code == 200, resp.text
    assert _seq(client, obj) == {"Tries": 1, "Arrays": 2, "Graphes": 3}
    split = _step_skills(client, obj)
    assert set(split["Fondamentaux"]) == {a, c}
    assert split["System design"] == [b]

    # Renvoyer au bac : ce que la séquence ne range plus sort de son étape.
    client.put(
        f"/projects/{obj}/sequence",
        json={"segments": [{"step_id": s1, "skill_ids": [a]}]},
    )
    assert _seq(client, obj) == {"Arrays": 1, "Graphes": None, "Tries": None}
    assert _step_skills(client, obj) == {"Fondamentaux": [a], "System design": []}


def test_the_sequence_refuses_what_does_not_fit(client: TestClient) -> None:
    d = _domain(client)
    a, b, autre = _skills(client, d, "Arrays", "Graphes", "Autre")
    obj = _project(client, d, [a, b])
    url = f"/projects/{obj}/sequence"
    # Un savoir que le projet ne vise pas, ou deux fois le même.
    assert (
        client.put(url, json={"segments": [{"skill_ids": [autre]}]}).status_code == 422
    )
    assert (
        client.put(url, json={"segments": [{"skill_ids": [a, a]}]}).status_code == 422
    )
    # Avec des étapes, pas de segment à plat.
    _step(client, obj, "Fondamentaux")
    assert client.put(url, json={"segments": [{"skill_ids": [a]}]}).status_code == 422


def test_the_first_step_takes_the_flat_sequence(client: TestClient) -> None:
    d = _domain(client)
    a, b, c = _skills(client, d, "Arrays", "Graphes", "Tries")
    obj = _project(client, d, [a, b, c])
    client.put(f"/projects/{obj}/sequence", json={"segments": [{"skill_ids": [b, a]}]})
    _step(client, obj, "Fondamentaux")
    assert _seq(client, obj) == {"Graphes": 1, "Arrays": 2, "Tries": None}
    assert set(_step_skills(client, obj)["Fondamentaux"]) == {a, b}
    # La deuxième naît vide.
    _step(client, obj, "System design")
    assert _step_skills(client, obj)["System design"] == []


def test_deleting_a_step_among_others_unplaces_its_skills(client: TestClient) -> None:
    d = _domain(client)
    a, b = _skills(client, d, "Arrays", "Graphes")
    obj = _project(client, d, [a, b])
    s1 = _step(client, obj, "Fondamentaux")
    s2 = _step(client, obj, "System design")
    client.put(
        f"/projects/{obj}/sequence",
        json={
            "segments": [
                {"step_id": s1, "skill_ids": [a]},
                {"step_id": s2, "skill_ids": [b]},
            ]
        },
    )
    assert client.delete(f"/steps/{s1}").status_code == 204
    assert _seq(client, obj) == {"Graphes": 1, "Arrays": None}
    # La dernière supprimée rend sa séquence à plat.
    assert client.delete(f"/steps/{s2}").status_code == 204
    assert _seq(client, obj) == {"Graphes": 1, "Arrays": None}


def test_reordering_steps_moves_the_ranks(client: TestClient) -> None:
    d = _domain(client)
    a, b = _skills(client, d, "Arrays", "Graphes")
    obj = _project(client, d, [a, b])
    s1 = _step(client, obj, "Fondamentaux")
    s2 = _step(client, obj, "System design")
    client.put(
        f"/projects/{obj}/sequence",
        json={
            "segments": [
                {"step_id": s1, "skill_ids": [a]},
                {"step_id": s2, "skill_ids": [b]},
            ]
        },
    )
    client.put(f"/projects/{obj}/steps/order", json={"step_ids": [s2, s1]})
    assert _seq(client, obj) == {"Graphes": 1, "Arrays": 2}


def test_unlinking_leaves_the_sequence_tight(client: TestClient) -> None:
    d = _domain(client)
    a, b, c = _skills(client, d, "Arrays", "Graphes", "Tries")
    obj = _project(client, d, [a, b, c])
    client.put(
        f"/projects/{obj}/sequence", json={"segments": [{"skill_ids": [a, b, c]}]}
    )
    client.put(f"/projects/{obj}/skills", json={"skill_ids": [a, c]})
    assert _seq(client, obj) == {"Arrays": 1, "Tries": 2}


def test_a_new_step_skill_takes_its_alphabetical_place(client: TestClient) -> None:
    """Sans rang connu, l'ordre neutre est alphabétique — accents compris :
    « Écrire » avec les E, pas après « Tracer »."""
    d = _domain(client)
    t, e, b = _skills(client, d, "Tracer", "Écrire", "Broder")
    obj = _project(client, d, [t, e, b])
    s1 = _step(client, obj, "Découpes")
    client.put(f"/steps/{s1}/skills", json={"skill_ids": [t, e, b]})
    assert _seq(client, obj) == {"Broder": 1, "Écrire": 2, "Tracer": 3}


def test_a_skill_cannot_sit_in_two_steps(client: TestClient) -> None:
    """Un savoir n'a qu'une place : la route des savoirs d'une étape refuse
    celui qu'une autre étape porte déjà, comme le fait déjà la séquence."""
    d = _domain(client)
    a, b = _skills(client, d, "Basse", "Groove")
    obj = _project(client, d, [a, b])
    s1 = _step(client, obj, "Morceau 1")
    s2 = _step(client, obj, "Morceau 2")
    client.put(f"/steps/{s1}/skills", json={"skill_ids": [a]})

    resp = client.put(f"/steps/{s2}/skills", json={"skill_ids": [a, b]})

    assert resp.status_code == 422
    assert _step_skills(client, obj) == {"Morceau 1": [a], "Morceau 2": []}
    # Reposer les savoirs d'une étape sur elle-même reste permis.
    assert client.put(f"/steps/{s1}/skills", json={"skill_ids": [a]}).is_success


# --- Le domaine se réorganise ; la séquence suit (design #27, prod/Savoirs) ---


def _tree(client: TestClient, d: str) -> dict[str, tuple[str | None, int]]:
    skills = client.get(f"/domains/{d}/skills").json()
    names = {s["id"]: s["name"] for s in skills}
    return {s["name"]: (names.get(s["parent_skill_id"]), s["order"]) for s in skills}


def test_reparenting_at_an_index_orders_the_siblings(client: TestClient) -> None:
    d = _domain(client)
    parent = client.post(f"/domains/{d}/skills", json={"name": "Graphes"}).json()["id"]
    kids = [
        client.post(
            f"/domains/{d}/skills", json={"name": n, "parent_skill_id": parent}
        ).json()["id"]
        for n in ("BFS", "DFS", "Dijkstra")
    ]
    # Dijkstra passe en tête de ses frères.
    resp = client.post(
        f"/skills/{kids[2]}/reparent", json={"new_parent_id": parent, "index": 0}
    )
    assert resp.status_code == 200, resp.text
    t = _tree(client, d)
    assert [n for n in ("Dijkstra", "BFS", "DFS") if t[n][1] >= 0] == [
        "Dijkstra",
        "BFS",
        "DFS",
    ]
    assert (t["Dijkstra"][1], t["BFS"][1], t["DFS"][1]) == (0, 1, 2)
    # Remonté à la racine : ses anciens frères se resserrent.
    client.post(f"/skills/{kids[0]}/reparent", json={"new_parent_id": None})
    t = _tree(client, d)
    assert t["BFS"][0] is None
    assert (t["Dijkstra"][1], t["DFS"][1]) == (0, 1)


def test_deleting_can_lift_the_children(client: TestClient) -> None:
    d = _domain(client)
    root = client.post(f"/domains/{d}/skills", json={"name": "CS"}).json()["id"]

    def add(name: str, parent: str, order: int) -> str:
        body = {"name": name, "parent_skill_id": parent, "order": order}
        return client.post(f"/domains/{d}/skills", json=body).json()["id"]

    add("Avant", root, 0)
    mid = add("Graphes", root, 1)
    add("BFS", mid, 0)
    add("DFS", mid, 1)
    add("Après", root, 2)

    assert client.delete(f"/skills/{mid}?children=lift").status_code == 204
    t = _tree(client, d)
    assert "Graphes" not in t
    # Les enfants prennent sa place, entre ses anciens voisins.
    order = sorted((n for n, (p, _) in t.items() if p == "CS"), key=lambda n: t[n][1])
    assert order == ["Avant", "BFS", "DFS", "Après"]


def test_deleting_a_skill_tightens_the_sequence(client: TestClient) -> None:
    d = _domain(client)
    a, b, c = _skills(client, d, "Arrays", "Graphes", "Tries")
    obj = _project(client, d, [a, b, c])
    client.put(
        f"/projects/{obj}/sequence", json={"segments": [{"skill_ids": [a, b, c]}]}
    )
    assert client.delete(f"/skills/{b}").status_code == 204
    assert _seq(client, obj) == {"Arrays": 1, "Tries": 2}
