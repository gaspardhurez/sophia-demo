"""Tests des notes d'un savoir (#79, #88, 03/10/2026) — un seul document,
enregistré d'un bloc ; des questions en table, que le document place."""

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient

from sophia.domain.notes import (
    AnswerForm,
    is_complete,
    question_places,
    with_question_nodes,
)
from sophia.infrastructure.models import AcquisitionPlan


def _skill(client: TestClient, name: str = "Chandelle") -> str:
    d = client.post("/domains", json={"name": "Tennis"}).json()["id"]
    resp = client.post(f"/domains/{d}/skills", json={"name": name})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _para(text: str) -> dict:
    return {"type": "paragraph", "content": [{"type": "text", "text": text}]}


def _h(level: int, text: str) -> dict:
    return {
        "type": "heading",
        "attrs": {"level": level},
        "content": [{"type": "text", "text": text}],
    }


def _node(question_id: str | uuid.UUID) -> dict:
    return {"type": "question", "attrs": {"id": str(question_id)}}


def _doc(*nodes: dict) -> dict:
    return {"type": "doc", "content": list(nodes)}


def _columns(*columns: list[dict]) -> dict:
    return {
        "type": "columns",
        "content": [{"type": "column", "content": c} for c in columns],
    }


def _save(client: TestClient, skill_id: str, doc: dict | None) -> dict:
    resp = client.put(f"/skills/{skill_id}/notes", json={"doc": doc})
    assert resp.status_code == 200, resp.text
    return resp.json()


def _question(client: TestClient, skill_id: str, prompt: str, **body) -> dict:
    payload = {"kind": "factual", "prompt": prompt, "answer": "Continentale.", **body}
    resp = client.post(f"/skills/{skill_id}/note-questions", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


# --- La règle pure : où le document pose ses questions -------------------------


def test_places_follow_the_document_with_the_path_of_headings() -> None:
    a, b, c, d = (uuid.uuid4() for _ in range(4))
    doc = _doc(
        _node(a),
        _h(1, "Le geste"),
        _h(2, "Préparation"),
        _node(b),
        _h(3, "Détail"),
        _node(c),
        _h(2, "Frappe"),  # remplace « Préparation » et « Détail »
        _node(d),
    )

    assert question_places(doc) == [
        (a, ()),
        (b, ("Le geste", "Préparation")),
        (c, ("Le geste", "Préparation", "Détail")),
        (d, ("Le geste", "Frappe")),
    ]


def test_a_heading_replaces_its_level_and_deeper() -> None:
    a, b = uuid.uuid4(), uuid.uuid4()
    doc = _doc(
        _h(2, "Sous"),
        _h(3, "Plus bas"),
        _h(1, "Haut"),  # efface aussi les niveaux 2 et 3
        _node(a),
        _h(3, "Saut de niveau"),
        _node(b),
    )

    assert question_places(doc) == [(a, ("Haut",)), (b, ("Haut", "Saut de niveau"))]


def _anchored(node: dict, *ids: uuid.UUID) -> dict:
    """Un bloc de texte qui pose des questions entières (#213)."""
    return {
        **node,
        "attrs": {**node.get("attrs", {}), "questions": [str(i) for i in ids]},
    }


def _marked(text: str, *ids: uuid.UUID) -> dict:
    """Un passage qui porte des questions (#213) : ses marques `questionRef`."""
    return {
        "type": "text",
        "text": text,
        "marks": [{"type": "questionRef", "attrs": {"id": str(i)}} for i in ids],
    }


def test_annotations_place_questions_where_they_are_anchored() -> None:
    # Une question de section (sur son titre) a ce titre au bout de son
    # chemin ; sur un bloc, ses questions entières passent avant celles de ses
    # passages ; l'ancien nœud se lit encore, à sa place.
    a, b, c, d, e = (uuid.uuid4() for _ in range(5))
    doc = _doc(
        _anchored(_h(1, "Le geste"), a),
        _anchored(
            {
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "Coude devant, "},
                    _marked("raquette basse", c, b),
                ],
            },
            d,
        ),
        _node(e),
    )

    assert question_places(doc) == [
        (a, ("Le geste",)),
        (d, ("Le geste",)),
        (c, ("Le geste",)),
        (b, ("Le geste",)),
        (e, ("Le geste",)),
    ]


def test_an_annotation_counts_once_even_when_its_passage_is_split() -> None:
    a = uuid.uuid4()
    doc = _doc(
        {"type": "paragraph", "content": [_marked("début", a)]},
        {"type": "paragraph", "content": [_marked("suite", a)]},
        _anchored(_para("plus loin"), a),
        {"type": "paragraph", "attrs": {"questions": ["pas un id"]}},
    )

    assert question_places(doc) == [(a, ())]


def test_an_empty_heading_clears_without_taking_a_place() -> None:
    a = uuid.uuid4()
    doc = _doc(
        _h(1, "Le geste"),
        _h(2, "Préparation"),
        {"type": "heading", "attrs": {"level": 2}},
        _node(a),
    )

    assert question_places(doc) == [(a, ("Le geste",))]


def test_places_are_read_at_any_depth() -> None:
    """Colonnes, listes : le document se lit en profondeur, dans l'ordre ; un
    titre dans une colonne compte pour la suite."""
    a, b, c = (uuid.uuid4() for _ in range(3))
    doc = _doc(
        _h(1, "Prise"),
        _columns(
            [_para("Texte"), _node(b)],
            [
                _h(2, "À droite"),
                {
                    "type": "bulletList",
                    "content": [{"type": "listItem", "content": [_node(c)]}],
                },
            ],
        ),
        _node(a),
    )

    assert question_places(doc) == [
        (b, ("Prise",)),
        (c, ("Prise", "À droite")),
        (a, ("Prise", "À droite")),
    ]


def test_only_the_first_occurrence_counts_and_unreadable_ids_are_ignored() -> None:
    a, b = uuid.uuid4(), uuid.uuid4()
    doc = _doc(
        _node(b),
        {"type": "question", "attrs": {"id": "pas-un-uuid"}},
        {"type": "question"},
        _h(1, "Plus loin"),
        _node(a),
        _node(b),
    )

    assert question_places(doc) == [(b, ()), (a, ("Plus loin",))]
    assert question_places(None) == []


def test_missing_nodes_are_added_at_the_end_on_a_copy() -> None:
    a, b = uuid.uuid4(), uuid.uuid4()
    doc = _doc(_para("Texte"))

    out = with_question_nodes(doc, [a, b])

    assert out == _doc(_para("Texte"), _node(a), _node(b))
    assert doc == _doc(_para("Texte"))
    assert with_question_nodes(None, [a]) == _doc(_node(a))
    assert with_question_nodes(None, []) is None
    assert with_question_nodes(doc, []) is doc


# --- Le document ------------------------------------------------------------


def test_a_skill_without_notes_has_an_empty_document(client: TestClient) -> None:
    """Pas de 404 sur des notes jamais écrites : le document est nul."""
    s = _skill(client)

    resp = client.get(f"/skills/{s}/notes")

    assert resp.status_code == 200
    assert resp.json() == {"doc": None, "questions": []}


def test_notes_of_an_unknown_skill_are_a_404(client: TestClient) -> None:
    missing = uuid.uuid4()
    assert client.get(f"/skills/{missing}/notes").status_code == 404
    assert client.put(f"/skills/{missing}/notes", json={"doc": None}).status_code == (
        404
    )
    assert (
        client.post(
            f"/skills/{missing}/note-questions", json={"kind": "factual"}
        ).status_code
        == 404
    )


def test_the_document_is_saved_whole_and_read_back(client: TestClient) -> None:
    s = _skill(client)
    doc = _doc(_para("Avant le premier titre"), _h(1, "Le geste"), _para("Armé."))

    saved = _save(client, s, doc)

    assert saved == {"doc": doc, "questions": []}
    assert client.get(f"/skills/{s}/notes").json() == saved
    assert _save(client, s, _doc(_para("Tout autre chose")))["doc"] == _doc(
        _para("Tout autre chose")
    )
    assert _save(client, s, None)["doc"] is None


def test_unknown_and_foreign_nodes_stay_as_they_are(client: TestClient) -> None:
    s, other = _skill(client), _skill(client, "Volée")
    q = _question(client, s, "Un ?")["id"]
    foreign = _question(client, other, "Ailleurs ?")["id"]
    doc = _doc(_node(uuid.uuid4()), _node(foreign), _node(q))

    saved = _save(client, s, doc)

    assert saved["doc"] == doc
    assert [x["id"] for x in saved["questions"]] == [q]


# --- La lecture pose toutes les questions -------------------------------------


def test_reading_adds_a_node_at_the_end_for_each_question_not_placed(
    client: TestClient, db
) -> None:
    """Sans rien écrire : le prochain enregistrement fixera ce que le front
    renvoie. Les nœuds manquants viennent dans l'ordre de création."""
    from sophia.infrastructure.models import SkillNotes

    s = _skill(client)
    q1, q2, q3 = (_question(client, s, p)["id"] for p in ("Un ?", "Deux ?", "Trois ?"))
    doc = _doc(_h(1, "Prise"), _node(q2), _para("Fin"))
    _save(client, s, doc)

    read = client.get(f"/skills/{s}/notes").json()

    assert read["doc"] == _doc(
        _h(1, "Prise"), _node(q2), _para("Fin"), _node(q1), _node(q3)
    )
    assert db.get(SkillNotes, uuid.UUID(s)).doc == doc


def test_a_null_document_with_questions_reads_as_their_nodes(
    client: TestClient,
) -> None:
    s = _skill(client)
    q1, q2 = (_question(client, s, p)["id"] for p in ("Un ?", "Deux ?"))

    read = client.get(f"/skills/{s}/notes").json()

    assert read["doc"] == _doc(_node(q1), _node(q2))
    assert sorted(x["id"] for x in read["questions"]) == sorted([q1, q2])


def test_a_question_placed_deep_is_not_doubled(client: TestClient) -> None:
    s = _skill(client)
    q = _question(client, s, "Un ?")["id"]
    doc = _doc(_columns([_para("Texte")], [_node(q)]))

    assert _save(client, s, doc)["doc"] == doc


# --- Enregistrer ne supprime jamais une question ------------------------------


def test_saving_the_document_never_deletes_a_question(client: TestClient, db) -> None:
    """Un nœud effacé, un document vidé : la question reste (seul `DELETE` la
    supprime) et la lecture la repose en fin."""
    from sophia.infrastructure.models import NoteQuestion

    s = _skill(client)
    q1, q2 = (_question(client, s, p)["id"] for p in ("Un ?", "Deux ?"))
    _save(client, s, _doc(_node(q1), _node(q2)))

    emptied = _save(client, s, _doc(_para("Plus de nœud")))
    nulled = _save(client, s, None)

    assert db.query(NoteQuestion).count() == 2
    assert emptied["doc"] == _doc(_para("Plus de nœud"), _node(q1), _node(q2))
    assert nulled["doc"] == _doc(_node(q1), _node(q2))
    assert len(nulled["questions"]) == 2


# --- Les questions -------------------------------------------------------------


@pytest.mark.parametrize(
    ("form", "prompt", "answer", "points", "expected"),
    [
        (AnswerForm.free, "Quelle prise ?", "Continentale", [], True),
        (AnswerForm.free, "Quelle prise ?", "  ", ["un point"], False),
        (AnswerForm.free, "  ", "Continentale", [], False),
        (AnswerForm.list, "Pourquoi ?", None, ["", "le filet"], True),
        (AnswerForm.list, "Pourquoi ?", "Continentale", [" "], False),
        (AnswerForm.list, "", None, ["le filet"], False),
    ],
)
def test_a_question_is_complete_when_posed_with_its_expected_answer(
    form, prompt, answer, points, expected
) -> None:
    """La forme de la réponse décide, pas la nature."""
    assert is_complete(form, prompt, answer, points) is expected


def test_a_question_belongs_to_its_skill(client: TestClient) -> None:
    s = _skill(client)

    q = _question(
        client,
        s,
        "Pourquoi reculer en pas chassés ?",
        kind="elaborative",
        form="list",
        answer=None,
        points=[
            {"text": "on garde l'épaule vers le filet"},
            {"text": "on garde la direction"},
        ],
    )

    assert set(q) == {"id", "kind", "form", "prompt", "answer", "points", "complete"}
    assert (q["kind"], q["form"]) == ("elaborative", "list")
    assert [p["text"] for p in q["points"]] == [
        "on garde l'épaule vers le filet",
        "on garde la direction",
    ]
    assert all(uuid.UUID(p["id"]) for p in q["points"])
    assert q["complete"] is True
    [read] = client.get(f"/skills/{s}/notes").json()["questions"]
    assert read == q


def test_a_question_can_be_born_empty(client: TestClient) -> None:
    """Elle se crée en place, vide, et s'écrit au fil de la saisie (#88)."""
    s = _skill(client)

    empty = client.post(f"/skills/{s}/note-questions", json={"kind": "factual"})
    no_point = client.post(
        f"/skills/{s}/note-questions",
        json={
            "kind": "elaborative",
            "form": "list",
            "prompt": "Pourquoi ?",
            "points": [{"text": ""}],
        },
    )

    assert empty.status_code == 201
    assert empty.json()["form"] == "free"  # par défaut
    assert (empty.json()["prompt"], empty.json()["complete"]) == ("", False)
    assert no_point.status_code == 201
    assert no_point.json()["complete"] is False

    filled = client.patch(
        f"/note-questions/{empty.json()['id']}",
        json={"prompt": "Quelle prise ?", "answer": "Continentale"},
    )
    assert filled.json()["complete"] is True


def test_changing_the_form_keeps_what_was_written(client: TestClient) -> None:
    """Changer de forme s'enregistre même sans réponse de la nouvelle forme
    (la question devient incomplète) ; la réponse de l'autre forme reste."""
    s = _skill(client)
    q = _question(client, s, "Quelle prise ?")

    switched = client.patch(f"/note-questions/{q['id']}", json={"form": "list"})
    pointed = client.patch(
        f"/note-questions/{q['id']}",
        json={
            "points": [{"text": "continentale"}, {"text": "comme la volée"}],
            "prompt": None,
        },
    )

    assert switched.status_code == 200
    assert switched.json()["complete"] is False
    assert pointed.json()["complete"] is True
    assert pointed.json()["prompt"] == "Quelle prise ?"  # `null` ne change rien
    assert pointed.json()["kind"] == "factual"  # la nature n'a pas bougé
    # La réponse libre reste : revenir à « Réponse » ne la perd pas.
    assert pointed.json()["answer"] == "Continentale."


def test_an_element_keeps_its_id_when_reworded(client: TestClient) -> None:
    s = _skill(client)
    q = _question(client, s, "Quel corps ?", form="list", points=[{"text": "Flechi"}])
    [point] = q["points"]

    reworded = client.patch(
        f"/note-questions/{q['id']}",
        json={"points": [{"id": point["id"], "text": "Fléchi"}, {"text": "Bas"}]},
    ).json()

    assert reworded["points"][0] == {"id": point["id"], "text": "Fléchi"}
    assert reworded["points"][1]["id"] != point["id"]


def test_deleting_a_question_leaves_its_node_without_effect(
    client: TestClient,
) -> None:
    s = _skill(client)
    q1, q2 = (_question(client, s, p)["id"] for p in ("Un ?", "Deux ?"))
    doc = _doc(_node(q1), _node(q2))
    _save(client, s, doc)

    assert client.delete(f"/note-questions/{q1}").status_code == 204
    assert client.delete(f"/note-questions/{q1}").status_code == 404

    read = client.get(f"/skills/{s}/notes").json()
    assert [x["id"] for x in read["questions"]] == [q2]
    assert read["doc"] == doc  # le nœud orphelin reste, sans effet


def test_notes_go_with_their_skill(client: TestClient, db) -> None:
    from sophia.infrastructure.models import NoteQuestion, SkillNotes

    s = _skill(client)
    q = _question(client, s, "Quelle prise ?")["id"]
    _save(client, s, _doc(_node(q)))

    assert client.delete(f"/skills/{s}").status_code == 204

    assert db.query(SkillNotes).count() == 0
    assert db.query(NoteQuestion).count() == 0


# --- Ce qui compte : les questions complètes du savoir ------------------------


def test_incomplete_questions_neither_count_nor_enter_the_recall(
    client: TestClient, db
) -> None:
    s = _skill(client)
    _question(client, s, "Quelle prise ?")
    client.post(f"/skills/{s}/note-questions", json={"kind": "factual"})
    client.post(
        f"/skills/{s}/note-questions",
        json={"kind": "elaborative", "form": "list", "prompt": "Pourquoi ?"},
    )
    plan = client.post(f"/skills/{s}/plans", json={"state": "active"}).json()

    assert plan["question_count"] == 1
    client.post(f"/plans/{plan['id']}/recall/launch", json={})
    # Le jour dû (#138 : plus de passation en avance).
    db.get(AcquisitionPlan, uuid.UUID(plan["id"])).recall_next_due_at = date.today()
    db.commit()
    session = client.post(f"/plans/{plan['id']}/recall").json()
    assert session["total"] == 1
    assert [x["prompt"] for x in session["answers"]] == ["Quelle prise ?"]


def test_only_incomplete_questions_start_no_recall(client: TestClient) -> None:
    s = _skill(client)
    client.post(f"/skills/{s}/note-questions", json={"kind": "factual"})
    plan = client.post(f"/skills/{s}/plans", json={"state": "active"}).json()

    launched = client.post(f"/plans/{plan['id']}/recall/launch", json={})
    assert launched.status_code == 422

    validated = client.post(f"/plans/{plan['id']}/study/validate").json()
    assert validated["question_count"] == 0
    assert validated["recall_next_due_at"] is None
    assert validated["study_mastered"] is True


def test_question_count_counts_every_complete_question_of_the_skill(
    client: TestClient,
) -> None:
    """Placées ou non dans le document, sous un titre ou non : toutes les
    questions complètes du savoir comptent, et seulement elles."""
    s, other = _skill(client), _skill(client, "Volée")
    q1 = _question(client, s, "Un ?")["id"]
    _question(client, s, "Deux ?")
    _question(client, other, "Ailleurs ?")
    _save(client, s, _doc(_h(1, "Prise"), _node(q1)))

    plan = client.post(f"/skills/{s}/plans", json={}).json()

    assert plan["question_count"] == 2
