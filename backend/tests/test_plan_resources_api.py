"""Tests de l'étude actionnable (#173) — l'ordre de consommation et la case
« consommée » des ressources d'un cycle, le périmètre du cycle, les notes
d'une ressource."""

import uuid

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from sophia.infrastructure.models import PlanResource, ResourceNotes


def _skill(client: TestClient, name: str = "Chandelle") -> str:
    d = client.post("/domains", json={"name": "Tennis"}).json()["id"]
    return client.post(f"/domains/{d}/skills", json={"name": name}).json()["id"]


def _resource(client: TestClient, skill_id: str, title: str, **body) -> str:
    resp = client.post(f"/skills/{skill_id}/resources", json={"title": title, **body})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _plan_with(client: TestClient, n: int) -> tuple[str, str, list[str]]:
    """Un savoir, un cycle et `n` ressources créées depuis ce cycle."""
    s = _skill(client)
    plan = client.post(f"/skills/{s}/plans", json={}).json()["id"]
    ids = [_resource(client, s, f"R{i}", plan_id=plan) for i in range(n)]
    return s, plan, ids


def _plan(client: TestClient, plan_id: str) -> dict:
    return client.patch(f"/plans/{plan_id}", json={}).json()


# --- L'ordre de consommation ------------------------------------------------


def test_resources_come_in_order_of_addition(client: TestClient) -> None:
    _, plan, ids = _plan_with(client, 3)

    read = _plan(client, plan)

    assert read["resource_ids"] == ids
    assert read["resources"] == [
        {"resource_id": rid, "position": i, "consumed_at": None, "scope_parts": []}
        for i, rid in enumerate(ids)
    ]


def test_a_chosen_resource_goes_last_and_the_others_keep_their_place(
    client: TestClient,
) -> None:
    s, plan, ids = _plan_with(client, 2)
    client.put(f"/plans/{plan}/resources/order", json={"resource_ids": ids[::-1]})
    late = _resource(client, s, "Tard")

    # La liste envoyée n'impose pas son ordre : elle ne fait qu'ajouter.
    read = client.patch(f"/plans/{plan}", json={"resource_ids": [late, *ids]}).json()

    assert read["resource_ids"] == [ids[1], ids[0], late]
    assert [r["position"] for r in read["resources"]] == [0, 1, 2]


def test_reordering_rewrites_the_whole_order(client: TestClient) -> None:
    _, plan, ids = _plan_with(client, 3)
    wanted = [ids[2], ids[0], ids[1]]

    resp = client.put(f"/plans/{plan}/resources/order", json={"resource_ids": wanted})

    assert resp.status_code == 200, resp.text
    assert resp.json()["resource_ids"] == wanted
    assert [r["position"] for r in resp.json()["resources"]] == [0, 1, 2]


def test_reordering_needs_the_exact_list(client: TestClient) -> None:
    _, plan, ids = _plan_with(client, 3)

    for wrong in (ids[:2], [*ids, ids[0]], [*ids[:2], str(uuid.uuid4())]):
        resp = client.put(
            f"/plans/{plan}/resources/order", json={"resource_ids": wrong}
        )
        assert resp.status_code == 422

    assert _plan(client, plan)["resource_ids"] == ids


def test_removing_a_resource_from_the_cycle_compacts_the_order(
    client: TestClient, db: Session
) -> None:
    _, plan, ids = _plan_with(client, 3)

    read = client.patch(f"/plans/{plan}", json={"resource_ids": [ids[0], ids[2]]})

    assert read.json()["resources"] == [
        {"resource_id": ids[0], "position": 0, "consumed_at": None, "scope_parts": []},
        {"resource_id": ids[2], "position": 1, "consumed_at": None, "scope_parts": []},
    ]
    assert len(db.scalars(select(PlanResource)).all()) == 2


def test_deleting_a_resource_compacts_the_order_of_its_cycles(
    client: TestClient,
) -> None:
    _, plan, ids = _plan_with(client, 3)

    client.delete(f"/resources/{ids[0]}")

    read = _plan(client, plan)
    assert read["resource_ids"] == ids[1:]
    assert [r["position"] for r in read["resources"]] == [0, 1]


# --- La case « consommée » --------------------------------------------------


def test_checking_consumed_dates_it_and_unchecking_clears_it(
    client: TestClient,
) -> None:
    _, plan, ids = _plan_with(client, 2)

    checked = client.patch(
        f"/plans/{plan}/resources/{ids[0]}", json={"consumed": True}
    ).json()

    first = checked["resources"][0]
    assert first["consumed_at"] is not None
    # Consommée, elle garde sa place : le bas de liste est un affichage.
    assert (first["resource_id"], first["position"]) == (ids[0], 0)
    assert checked["resources"][1]["consumed_at"] is None

    again = client.patch(
        f"/plans/{plan}/resources/{ids[0]}", json={"consumed": True}
    ).json()
    assert again["resources"][0]["consumed_at"] == first["consumed_at"]

    unchecked = client.patch(
        f"/plans/{plan}/resources/{ids[0]}", json={"consumed": False}
    ).json()
    assert unchecked["resources"][0]["consumed_at"] is None


def test_consumed_is_per_cycle(client: TestClient) -> None:
    s, plan, ids = _plan_with(client, 1)
    other = client.post(f"/skills/{s}/plans", json={}).json()["id"]
    client.patch(f"/plans/{other}", json={"resource_ids": ids})

    client.patch(f"/plans/{plan}/resources/{ids[0]}", json={"consumed": True})

    assert _plan(client, other)["resources"][0]["consumed_at"] is None


def test_a_kept_resource_keeps_its_check(client: TestClient) -> None:
    s, plan, ids = _plan_with(client, 2)
    client.patch(f"/plans/{plan}/resources/{ids[1]}", json={"consumed": True})
    extra = _resource(client, s, "Encore")

    read = client.patch(f"/plans/{plan}", json={"resource_ids": [ids[1], extra]}).json()

    assert read["resource_ids"] == [ids[1], extra]
    assert read["resources"][0]["consumed_at"] is not None


def test_checking_a_resource_outside_the_cycle_is_refused(client: TestClient) -> None:
    s, plan, _ = _plan_with(client, 1)
    outside = _resource(client, s, "Hors du cycle")

    resp = client.patch(f"/plans/{plan}/resources/{outside}", json={"consumed": True})

    assert resp.status_code == 422


def test_resource_routes_of_an_unknown_cycle_are_a_404(client: TestClient) -> None:
    unknown = uuid.uuid4()
    assert (
        client.put(
            f"/plans/{unknown}/resources/order",
            json={"resource_ids": [str(uuid.uuid4())]},
        ).status_code
        == 404
    )
    assert (
        client.patch(
            f"/plans/{unknown}/resources/{uuid.uuid4()}", json={"consumed": True}
        ).status_code
        == 404
    )


# --- Le périmètre -----------------------------------------------------------


def test_the_scope_is_free_text_and_optional(client: TestClient) -> None:
    s = _skill(client)
    plan = client.post(f"/skills/{s}/plans", json={}).json()
    assert plan["scope"] is None

    scope = "Le geste\nLa préparation\nLes erreurs fréquentes"
    written = client.patch(f"/plans/{plan['id']}", json={"scope": scope}).json()
    assert written["scope"] == scope
    # `target_level` (l'intention) reste à part.
    assert written["target_level"] is None

    blanked = client.patch(f"/plans/{plan['id']}", json={"scope": "  "}).json()
    assert blanked["scope"] is None


# --- Les liens d'une ressource au périmètre (30/10) ------------------------

_SCOPE = "Le geste\nLa préparation\nLes erreurs\nHors de ce cycle : Le smash ; La volée"


def _scoped(client: TestClient, n: int = 2) -> tuple[str, list[str]]:
    """Un cycle au périmètre `_SCOPE` et `n` ressources dans son étude."""
    _, plan, ids = _plan_with(client, n)
    client.patch(f"/plans/{plan}", json={"scope": _SCOPE})
    return plan, ids


def _link(client: TestClient, plan: str, rid: str, parts: list[str]):
    return client.patch(f"/plans/{plan}/resources/{rid}", json={"scope_parts": parts})


def _parts(client: TestClient, plan: str) -> list[list[str]]:
    return [r["scope_parts"] for r in _plan(client, plan)["resources"]]


def test_a_resource_links_to_retained_parts_in_scope_order(
    client: TestClient,
) -> None:
    plan, ids = _scoped(client)

    resp = _link(client, plan, ids[0], ["Les erreurs", "Le geste", "Le geste"])

    assert resp.status_code == 200, resp.text
    assert resp.json()["resources"][0]["scope_parts"] == ["Le geste", "Les erreurs"]
    # Le lien est au cycle et à la ressource : l'autre n'en a pas.
    assert resp.json()["resources"][1]["scope_parts"] == []
    # La case « consommée » n'a pas bougé.
    assert resp.json()["resources"][0]["consumed_at"] is None

    unlinked = _link(client, plan, ids[0], [])
    assert unlinked.json()["resources"][0]["scope_parts"] == []


def test_linking_and_consuming_are_independent(client: TestClient) -> None:
    plan, ids = _scoped(client, 1)
    _link(client, plan, ids[0], ["Le geste"])

    read = client.patch(
        f"/plans/{plan}/resources/{ids[0]}", json={"consumed": True}
    ).json()

    assert read["resources"][0]["scope_parts"] == ["Le geste"]
    assert read["resources"][0]["consumed_at"] is not None


def test_linking_to_an_edge_or_an_unknown_part_is_refused(client: TestClient) -> None:
    plan, ids = _scoped(client, 1)
    _link(client, plan, ids[0], ["Le geste"])

    for wrong in (["Le smash"], ["Inconnue"], ["Le geste", "le geste "]):
        assert _link(client, plan, ids[0], wrong).status_code == 422

    assert _parts(client, plan) == [["Le geste"]]


def test_linking_without_scope_or_outside_the_cycle_is_refused(
    client: TestClient,
) -> None:
    s, plan, ids = _plan_with(client, 1)
    assert _link(client, plan, ids[0], ["Le geste"]).status_code == 422

    client.patch(f"/plans/{plan}", json={"scope": _SCOPE})
    outside = _resource(client, s, "Hors du cycle")
    assert _link(client, plan, outside, ["Le geste"]).status_code == 422


def test_renaming_a_part_carries_its_links(client: TestClient) -> None:
    plan, ids = _scoped(client)
    _link(client, plan, ids[0], ["Le geste", "Les erreurs"])
    _link(client, plan, ids[1], ["La préparation"])
    renamed = _SCOPE.replace("Le geste", "Le geste complet")

    resp = client.patch(
        f"/plans/{plan}",
        json={
            "scope": renamed,
            "scope_renames": [{"from": "Le geste", "to": "Le geste complet"}],
        },
    )

    assert resp.status_code == 200, resp.text
    assert _parts(client, plan) == [
        ["Le geste complet", "Les erreurs"],
        ["La préparation"],
    ]


def test_a_part_that_leaves_the_scope_loses_its_links(client: TestClient) -> None:
    plan, ids = _scoped(client)
    _link(client, plan, ids[0], ["Le geste", "Les erreurs"])
    _link(client, plan, ids[1], ["La préparation"])

    # « Les erreurs » supprimée, « La préparation » passée hors du cycle —
    # sans renommage : la modale « Cadrer l'étude » écrit ainsi.
    client.patch(
        f"/plans/{plan}",
        json={"scope": "Le geste\nHors de ce cycle : La préparation ; Le smash"},
    )
    assert _parts(client, plan) == [["Le geste"], []]

    # Un renommage non déclaré défait le lien.
    client.patch(f"/plans/{plan}", json={"scope": "Le geste précis"})
    assert _parts(client, plan) == [[], []]


def test_an_emptied_scope_drops_every_link(client: TestClient) -> None:
    plan, ids = _scoped(client, 1)
    _link(client, plan, ids[0], ["Le geste"])

    client.patch(f"/plans/{plan}", json={"scope": None})

    assert _parts(client, plan) == [[]]


def test_a_patch_without_scope_keeps_the_links(client: TestClient) -> None:
    plan, ids = _scoped(client, 1)
    _link(client, plan, ids[0], ["Le geste"])

    client.patch(f"/plans/{plan}", json={"target_level": "Placer la chandelle"})

    assert _parts(client, plan) == [["Le geste"]]


def test_renames_come_with_the_scope(client: TestClient) -> None:
    plan, _ = _scoped(client, 1)

    resp = client.patch(
        f"/plans/{plan}",
        json={"scope_renames": [{"from": "Le geste", "to": "Le geste complet"}]},
    )

    assert resp.status_code == 422


def test_links_are_per_cycle(client: TestClient) -> None:
    s, plan, ids = _plan_with(client, 1)
    other = client.post(f"/skills/{s}/plans", json={}).json()["id"]
    for p in (plan, other):
        client.patch(f"/plans/{p}", json={"scope": _SCOPE, "resource_ids": ids})

    _link(client, plan, ids[0], ["Le geste"])

    assert _parts(client, plan) == [["Le geste"]]
    assert _parts(client, other) == [[]]


# --- Les notes d'une ressource ----------------------------------------------

_DOC = {
    "type": "doc",
    "content": [
        {
            "type": "bulletList",
            "content": [
                {
                    "type": "listItem",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [{"type": "text", "text": "Contre-pied"}],
                        }
                    ],
                }
            ],
        }
    ],
}


def test_resource_notes_are_empty_until_written(client: TestClient) -> None:
    _, _, ids = _plan_with(client, 1)

    assert client.get(f"/resources/{ids[0]}/notes").json() == {"doc": None}


def test_resource_notes_are_saved_whole(client: TestClient) -> None:
    _, _, ids = _plan_with(client, 2)

    saved = client.put(f"/resources/{ids[0]}/notes", json={"doc": _DOC})
    assert saved.status_code == 200, saved.text
    assert saved.json() == {"doc": _DOC}
    assert client.get(f"/resources/{ids[0]}/notes").json() == {"doc": _DOC}

    replaced = {"type": "doc", "content": [{"type": "paragraph"}]}
    client.put(f"/resources/{ids[0]}/notes", json={"doc": replaced})
    assert client.get(f"/resources/{ids[0]}/notes").json() == {"doc": replaced}
    # Une ressource a ses propres notes.
    assert client.get(f"/resources/{ids[1]}/notes").json() == {"doc": None}


def test_resource_notes_leave_with_the_resource(
    client: TestClient, db: Session
) -> None:
    _, _, ids = _plan_with(client, 1)
    client.put(f"/resources/{ids[0]}/notes", json={"doc": _DOC})

    assert client.delete(f"/resources/{ids[0]}").status_code == 204

    assert db.scalars(select(ResourceNotes)).all() == []
    assert client.get(f"/resources/{ids[0]}/notes").status_code == 404


def test_notes_of_an_unknown_resource_are_a_404(client: TestClient) -> None:
    unknown = uuid.uuid4()
    assert client.get(f"/resources/{unknown}/notes").status_code == 404
    assert (
        client.put(f"/resources/{unknown}/notes", json={"doc": _DOC}).status_code == 404
    )
