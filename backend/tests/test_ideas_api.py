"""Idées centrales d'une section des notes (#173).

Faux port du compagnon par la dépendance : aucun appel réseau, aucun appel à
l'API.
"""

from dataclasses import dataclass, field

import pytest
from fastapi.testclient import TestClient

from sophia.api.deps import get_companion
from sophia.application.companion import (
    Availability,
    CentralIdea,
    CompanionFailed,
    ExistingQuestion,
    IdeasContext,
)
from sophia.domain.ideas import Idea, keep_ideas, section_title
from sophia.infrastructure.llm.context import ideas_xml
from sophia.infrastructure.unavailable import Unavailable
from sophia.main import app


def heading(text: str, level: int = 1) -> dict:
    return {
        "type": "heading",
        "attrs": {"level": level},
        "content": [{"type": "text", "text": text}],
    }


def bullets(*lines: str) -> dict:
    return {
        "type": "bulletList",
        "content": [
            {
                "type": "listItem",
                "content": [
                    {"type": "paragraph", "content": [{"type": "text", "text": t}]}
                ],
            }
            for t in lines
        ],
    }


def question(qid: str) -> dict:
    return {"type": "question", "attrs": {"id": qid}}


def section(*nodes: dict) -> dict:
    return {"type": "doc", "content": list(nodes)}


SECTION = section(
    heading("Le principe"),
    bullets(
        "L'idée est de rendre une balle lente et profonde.",
        "Elle rebondit bas après la vitre : l'adversaire défend de loin.",
    ),
    heading("Le point d'impact", 2),
    bullets("Devant soi, à hauteur de tête."),
)


def idea(
    text="Balle lente, rebond bas après la vitre",
    quote="L'idée est de rendre une balle lente",
    **kw,
) -> CentralIdea:
    return CentralIdea(
        idea=text,
        reason=kw.get("reason", "Idée centrale : le reste en découle"),
        angle=kw.get("angle", "Ce que le rebond bas retire à l'adversaire"),
        quote=quote,
        prompt_version="central_ideas@test",
        model="claude-test",
    )


@dataclass
class FakeCompanion:
    ideas: list[CentralIdea] = field(default_factory=list)
    fail: bool = False
    calls: list[IdeasContext] = field(default_factory=list)

    def availability(self) -> Availability:
        return Availability(available=True)

    def central_ideas(self, ctx: IdeasContext) -> list[CentralIdea]:
        self.calls.append(ctx)
        if self.fail:
            raise CompanionFailed("Échec.")
        return list(self.ideas)


@pytest.fixture
def companion() -> FakeCompanion:
    fake = FakeCompanion()
    app.dependency_overrides[get_companion] = lambda: fake
    return fake


def _skill(client: TestClient, plan: bool = True) -> str:
    d = client.post("/domains", json={"name": "Tennis"}).json()["id"]
    s = client.post(f"/domains/{d}/skills", json={"name": "La chandelle"}).json()["id"]
    if plan:
        p = client.post(f"/skills/{s}/plans", json={}).json()
        client.patch(
            f"/plans/{p['id']}",
            json={"target_level": "Tenir le filet", "scope": "Le geste, l'usage"},
        )
    return s


def _ideas(client: TestClient, skill_id: str, body=SECTION):
    return client.post(f"/skills/{skill_id}/central-ideas", json={"section": body})


# --- L'endpoint ------------------------------------------------------------------


def test_proposes_ideas_and_sends_the_section_context(
    client: TestClient, companion: FakeCompanion
):
    companion.ideas = [idea()]
    s = _skill(client)

    resp = _ideas(client, s)

    assert resp.status_code == 200, resp.text
    assert resp.json() == {
        "ideas": [
            {
                "idea": "Balle lente, rebond bas après la vitre",
                "reason": "Idée centrale : le reste en découle",
                "angle": "Ce que le rebond bas retire à l'adversaire",
                "quote": "L'idée est de rendre une balle lente",
            }
        ]
    }
    ctx = companion.calls[0]
    assert ctx.skill_title == "La chandelle"
    assert (ctx.intention, ctx.scope) == ("Tenir le filet", "Le geste, l'usage")
    assert ctx.section_title == "Le principe"
    assert ctx.section_text == (
        "# Le principe\n"
        "- L'idée est de rendre une balle lente et profonde.\n"
        "- Elle rebondit bas après la vitre : l'adversaire défend de loin.\n"
        "## Le point d'impact\n"
        "- Devant soi, à hauteur de tête."
    )
    assert ctx.questions == ()


def test_nothing_to_propose_is_an_empty_list(
    client: TestClient, companion: FakeCompanion
):
    resp = _ideas(client, _skill(client))
    assert resp.status_code == 200
    assert resp.json() == {"ideas": []}


def test_sends_the_section_questions_with_their_answers(
    client: TestClient, companion: FakeCompanion
):
    s = _skill(client)
    other = _skill(client)
    free = client.post(
        f"/skills/{s}/note-questions",
        json={
            "kind": "elaborative",
            "prompt": "Pourquoi une balle lente ?",
            "answer": "Elle rebondit bas, l'adversaire défend.",
        },
    ).json()["id"]
    listed = client.post(
        f"/skills/{s}/note-questions",
        json={
            "kind": "factual",
            "form": "list",
            "prompt": "Où frapper ?",
            "points": [{"text": "Devant soi"}, {"text": "À hauteur de tête"}],
        },
    ).json()["id"]
    blank = client.post(f"/skills/{s}/note-questions", json={"kind": "factual"}).json()[
        "id"
    ]
    elsewhere = client.post(
        f"/skills/{other}/note-questions",
        json={"kind": "factual", "prompt": "D'un autre savoir"},
    ).json()["id"]
    body = section(
        *SECTION["content"],
        question(listed),
        question(free),
        question(blank),
        question(elsewhere),
    )

    assert _ideas(client, s, body).status_code == 200

    questions = companion.calls[0].questions
    # Dans l'ordre de la section ; ni la question vide, ni celle d'un autre savoir.
    assert [(q.prompt, q.answer) for q in questions] == [
        ("Où frapper ?", "Devant soi ; À hauteur de tête"),
        ("Pourquoi une balle lente ?", "Elle rebondit bas, l'adversaire défend."),
    ]


def test_without_plan_no_intention_nor_scope(
    client: TestClient, companion: FakeCompanion
):
    s = _skill(client, plan=False)
    assert _ideas(client, s).status_code == 200
    ctx = companion.calls[0]
    assert (ctx.intention, ctx.scope) == (None, None)


def test_section_without_title(client: TestClient, companion: FakeCompanion):
    s = _skill(client)
    resp = _ideas(client, s, section(bullets("Du texte d'avant tout titre.")))
    assert resp.status_code == 200
    assert companion.calls[0].section_title is None


def test_guards_cut_at_three_drop_questions_and_absent_quotes(
    client: TestClient, companion: FakeCompanion
):
    companion.ideas = [
        idea("Une question rédigée ?"),
        idea("L'impact devant soi", quote="Introuvable dans la section"),
        idea("Rebond bas", quote="- Elle rebondit bas après la vitre"),
        idea("", quote=None),
        idea("Troisième", quote=None),
        idea("Quatrième", quote=None),
    ]
    resp = _ideas(client, _skill(client))

    kept = resp.json()["ideas"]
    assert [(i["idea"], i["quote"]) for i in kept] == [
        ("L'impact devant soi", None),
        ("Rebond bas", "Elle rebondit bas après la vitre"),
        ("Troisième", None),
    ]


def test_empty_section_is_refused_before_the_companion(
    client: TestClient, companion: FakeCompanion
):
    s = _skill(client)
    resp = _ideas(client, s, section({"type": "paragraph"}))
    assert resp.status_code == 422
    assert companion.calls == []


def test_unknown_skill_is_a_404(client: TestClient, companion: FakeCompanion):
    resp = _ideas(client, "00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


def test_unavailable_companion_is_a_503(client: TestClient):
    app.dependency_overrides[get_companion] = lambda: Unavailable("Pas de clé.")
    resp = _ideas(client, _skill(client))
    assert resp.status_code == 503
    assert resp.json() == {"detail": "Pas de clé."}


def test_failed_companion_is_a_502(client: TestClient, companion: FakeCompanion):
    companion.fail = True
    resp = _ideas(client, _skill(client))
    assert resp.status_code == 502


# --- Le domaine et le contexte envoyé -------------------------------------------


def test_section_title_is_its_first_node_only():
    assert section_title(section(heading("Titre"), bullets("x"))) == "Titre"
    assert section_title(section(bullets("x"), heading("Plus loin"))) is None
    assert section_title(None) is None


def test_keep_ideas_strips_and_keeps_order():
    kept = keep_ideas([Idea("  Idée  ", " raison ", " angle ", "  ")], SECTION)
    assert [(k.idea, k.reason, k.angle, k.quote) for k in kept] == [
        ("Idée", "raison", "angle", None)
    ]


def test_ideas_xml_escapes_and_tags_everything():
    xml = ideas_xml(
        IdeasContext(
            skill_title="A & B",
            intention=None,
            scope="Le geste",
            section_title="Le <principe>",
            section_text="- Une ligne",
            questions=(ExistingQuestion("Pourquoi ?", None),),
        )
    )
    assert "<skill>A &amp; B</skill>" in xml
    assert "<intention></intention>" in xml
    assert '<section title="Le &lt;principe&gt;">- Une ligne</section>' in xml
    assert "<prompt>Pourquoi ?</prompt>\n<answer></answer>" in xml
