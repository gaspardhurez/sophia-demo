"""Tests de la bibliothèque d'un savoir (V4) — un objet unique qui déclare sa
nature, et que des activités rejouent. La rampe et les verdicts sont ceux d'un
cycle (`test_plans_api.py`)."""

import uuid

from fastapi.testclient import TestClient


def _domain(client: TestClient, name: str = "Tennis") -> str:
    return client.post("/domains", json={"name": name}).json()["id"]


def _skill(client: TestClient, domain_id: str, name: str, **body) -> str:
    resp = client.post(f"/domains/{domain_id}/skills", json={"name": name, **body})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _item(client: TestClient, skill_id: str, **body) -> dict:
    payload = {"title": "Chandelle au panier", **body}
    resp = client.post(f"/skills/{skill_id}/practice", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_a_practice_item_declares_its_nature(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d, "Chandelle")

    drill = _item(client, s)
    match = _item(client, s, title="Match du samedi", nature="situation")

    assert drill["nature"] == "isolated"  # défaut
    assert match["nature"] == "situation"
    assert match["skill_id"] == s


def test_both_natures_live_in_one_catalogue(client: TestClient) -> None:
    """Deux natures depuis le 15/09/2026 : la contextualisée est devenue un rang."""
    d = _domain(client)
    s = _skill(client, d, "Chandelle")
    _item(client, s, title="Panier", nature="isolated")
    _item(client, s, title="Lecture de balle", nature="isolated")
    _item(client, s, title="Match", nature="situation")

    catalogue = client.get(f"/skills/{s}/practice").json()

    assert [i["nature"] for i in catalogue] == ["isolated", "isolated", "situation"]


def test_practice_on_a_parent(client: TestClient) -> None:
    """Un parent est un savoir : il a sa propre pratique."""
    d = _domain(client)
    parent = _skill(client, d, "Coups de fond")
    _skill(client, d, "Revers", parent_skill_id=parent)

    resp = client.post(f"/skills/{parent}/practice", json={"title": "Drill"})

    assert resp.status_code == 201, resp.text


def _passe(item: dict) -> dict:
    """Un acte d'exercice sur cet objet."""
    return {
        "skill_id": item["skill_id"],
        "kind": "practice",
        "practice_item_id": item["id"],
    }


def test_sessions_count_only_what_was_done(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d, "Chandelle")
    item = _item(client, s)
    body = {"domain_id": d, "title": "Passe", "acts": [_passe(item)]}
    client.post("/activities", json={**body, "done": True})
    client.post("/activities", json={**body, "done": True})
    client.post("/activities", json={**body, "done": False})

    read = client.get(f"/skills/{s}/practice").json()[0]

    # Trois passes planifiées, deux faites. Le verdict, lui, est celui d'un
    # cycle : la bibliothèque n'en porte pas.
    assert read["sessions"] == 2
    assert "done" not in read


def test_activity_rejects_an_unknown_practice_item(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d, "Chandelle")

    resp = client.post(
        "/activities",
        json={
            "domain_id": d,
            "title": "Séance",
            "acts": [_passe({"skill_id": s, "id": str(uuid.uuid4())})],
        },
    )

    assert resp.status_code == 422


def test_deleting_an_item_keeps_the_sessions(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d, "Chandelle")
    item = _item(client, s)
    a = client.post(
        "/activities",
        json={"domain_id": d, "title": "Séance", "acts": [_passe(item)]},
    ).json()

    assert client.delete(f"/practice/{item['id']}").status_code == 204

    read = client.get(f"/activities/{a['id']}").json()
    assert read["acts"] == []  # l'acte part avec l'objet
    assert read["title"] == "Séance"  # la séance a eu lieu


def test_deleting_the_skill_takes_its_catalogue(client: TestClient) -> None:
    """Un objet de pratique n'a aucun sens sans son savoir."""
    d = _domain(client)
    s = _skill(client, d, "Chandelle")
    _item(client, s)

    assert client.delete(f"/skills/{s}").status_code == 204
    assert client.get(f"/skills/{s}/practice").json() == []


def test_an_item_declares_how_it_is_executed(client: TestClient) -> None:
    """`nature` dit quelle sous-phase il sert, `kind` dit où il s'exécute.

    Les deux sont orthogonaux : un exercice de discrimination peut être manuel
    comme intégré.
    """
    d = _domain(client)
    s = _skill(client, d, "Chandelle")

    item = client.post(
        f"/skills/{s}/practice",
        json={
            "title": "Sortir la chandelle quand l'adversaire monte au filet",
            "nature": "isolated",
            "kind": "integrated",
            "emoji": "🎾",
            "eval_mode": "sophia",
            "statement_source": "generated",
            "solution_source": "uploaded",
        },
    ).json()

    assert item["nature"] == "isolated"
    assert item["kind"] == "integrated"
    assert item["eval_mode"] == "sophia"
    assert item["statement_source"] == "generated"
    assert item["solution_source"] == "uploaded"


def test_an_item_defaults_to_manual_and_self_evaluated(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d, "Chandelle")

    item = client.post(f"/skills/{s}/practice", json={"title": "Panier"}).json()

    assert item["kind"] == "manual"
    assert item["eval_mode"] == "self"


def test_a_passe_takes_a_level_and_a_note(client: TestClient) -> None:
    # #139 : le retour d'une passe — un niveau de 1 à 5 et une note, sur l'acte.
    d = _domain(client)
    s = _skill(client, d, "Chandelle")
    item = _item(client, s)
    a = client.post(
        "/activities",
        json={"domain_id": d, "title": "Passe", "done": True, "acts": [_passe(item)]},
    ).json()
    act = a["acts"][0]
    assert (act["level"], act["feedback"]) == (None, None)
    url = f"/activities/{a['id']}/acts/{act['id']}/feedback"

    resp = client.put(url, json={"level": 3, "feedback": "  Sort une fois sur trois "})
    assert resp.status_code == 200, resp.text
    read = resp.json()["acts"][0]
    assert (read["level"], read["feedback"]) == (3, "Sort une fois sur trois")
    # Rien d'autre ne bouge : ni la coche, ni la note de l'activité.
    assert resp.json()["done"] is True
    assert resp.json()["notes"] is None

    # Le niveau est facultatif : une note seule se garde.
    note = client.put(url, json={"level": None, "feedback": " x "}).json()["acts"][0]
    assert (note["level"], note["feedback"]) == (None, "x")

    # Les deux vides effacent le retour.
    cleared = client.put(url, json={"level": None, "feedback": " "}).json()["acts"][0]
    assert (cleared["level"], cleared["feedback"]) == (None, None)


def test_a_level_stays_between_one_and_five(client: TestClient) -> None:
    d = _domain(client)
    item = _item(client, _skill(client, d, "Chandelle"))
    a = client.post(
        "/activities", json={"domain_id": d, "title": "P", "acts": [_passe(item)]}
    ).json()
    url = f"/activities/{a['id']}/acts/{a['acts'][0]['id']}/feedback"

    assert client.put(url, json={"level": 0}).status_code == 422
    assert client.put(url, json={"level": 6}).status_code == 422
    assert client.put(url, json={"level": 5}).status_code == 200


def test_study_and_recall_take_no_feedback(client: TestClient) -> None:
    d = _domain(client)
    s = _skill(client, d, "Chandelle")
    a = client.post(
        "/activities",
        json={"domain_id": d, "title": "É", "acts": [{"skill_id": s, "kind": "study"}]},
    ).json()

    url = f"/activities/{a['id']}/acts/{a['acts'][0]['id']}/feedback"
    assert client.put(url, json={"level": 4}).status_code == 422
    missing = f"/activities/{a['id']}/acts/{uuid.uuid4()}/feedback"
    assert client.put(missing, json={"level": 4}).status_code == 404
