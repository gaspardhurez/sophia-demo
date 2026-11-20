"""Vérification des notes d'une ressource et fils de réponses (#173).

Faux ports (compagnon, lecture de la source) par les dépendances : aucun appel
réseau, aucun appel à l'API.
"""

from dataclasses import dataclass, field

import pytest
from fastapi.testclient import TestClient

from sophia.api.deps import get_companion, get_source_reader
from sophia.application.companion import (
    Availability,
    CompanionFailed,
    ReplyContext,
    ReviewContext,
    ReviewFinding,
)
from sophia.application.review import SourceMissing, SourceText
from sophia.domain.review import MAX_SOURCE_CHARS, PasteReason
from sophia.infrastructure.unavailable import Unavailable
from sophia.main import app

NOTES = {
    "type": "doc",
    "content": [
        {
            "type": "heading",
            "attrs": {"level": 2},
            "content": [{"type": "text", "text": "Le geste"}],
        },
        {
            "type": "bulletList",
            "content": [
                {
                    "type": "listItem",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [
                                {
                                    "type": "text",
                                    "text": "La raquette reste devant le corps.",
                                }
                            ],
                        }
                    ],
                },
                {
                    "type": "listItem",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [
                                {
                                    "type": "text",
                                    "text": "On frappe à plat pour gagner du temps.",
                                }
                            ],
                        }
                    ],
                },
            ],
        },
    ],
}


def finding(kind="inexact", quote="La raquette reste devant le corps.", **kw):
    return ReviewFinding(
        kind=kind,
        quote=quote,
        after_quote=kw.get("after_quote"),
        message=kw.get("message", "Pas tout à fait : elle reste haute."),
        where_to_look=kw.get("where_to_look", "4:10"),
        prompt_version="review@test",
        model="claude-test",
    )


@dataclass
class FakeCompanion:
    findings: list[ReviewFinding] = field(default_factory=list)
    answer: str = "Tu as raison, tu peux le résoudre."
    fail: bool = False
    reviews: list[ReviewContext] = field(default_factory=list)
    replies: list[ReplyContext] = field(default_factory=list)

    def availability(self) -> Availability:
        return Availability(available=True)

    def review_notes(self, ctx: ReviewContext) -> list[ReviewFinding]:
        self.reviews.append(ctx)
        return list(self.findings)

    def reply_in_thread(self, ctx: ReplyContext) -> str:
        self.replies.append(ctx)
        if self.fail:
            raise CompanionFailed("Échec.")
        return self.answer


@dataclass
class FakeReader:
    result: SourceText | SourceMissing = field(
        default_factory=lambda: SourceText(kind="youtube", text="[0:00] La source.")
    )
    calls: list[tuple[str | None, str | None]] = field(default_factory=list)

    def read(self, reference, part):
        self.calls.append((reference, part))
        return self.result


@pytest.fixture
def companion() -> FakeCompanion:
    fake = FakeCompanion()
    app.dependency_overrides[get_companion] = lambda: fake
    return fake


@pytest.fixture
def reader() -> FakeReader:
    fake = FakeReader()
    app.dependency_overrides[get_source_reader] = lambda: fake
    return fake


def _resource(client: TestClient, notes=NOTES, **body) -> dict:
    d = client.post("/domains", json={"name": "Tennis"}).json()["id"]
    s = client.post(f"/domains/{d}/skills", json={"name": "Revers lifté"}).json()
    plan = client.post(f"/skills/{s['id']}/plans", json={}).json()
    client.patch(
        f"/plans/{plan['id']}",
        json={"target_level": "Un revers fiable", "scope": "Le geste, le placement"},
    )
    payload = {
        "title": "Vidéo du coach",
        "author": "The Tennis School",
        "reference": "https://youtu.be/abcdefghijk",
        "part": "de 4:10 à 9:30",
        "plan_id": plan["id"],
        **body,
    }
    r = client.post(f"/skills/{s['id']}/resources", json=payload).json()
    if notes is not None:
        client.put(f"/resources/{r['id']}/notes", json={"doc": notes})
    return r


def _review(client: TestClient, rid: str, **body):
    return client.post(f"/resources/{rid}/review", json=body)


# --- Vérifier ------------------------------------------------------------------


def test_review_keeps_the_comments_and_sends_the_context(
    client: TestClient, companion: FakeCompanion, reader: FakeReader
):
    companion.findings = [
        finding(),
        finding(
            "omission",
            quote=None,
            after_quote="On frappe à plat pour gagner du temps.",
            message="La source insiste sur le transfert du poids.",
        ),
    ]
    r = _resource(client)

    resp = _review(client, r["id"])

    assert resp.status_code == 200, resp.text
    run = resp.json()
    assert run["needs_paste"] is False and run["paste_reason"] is None
    passage, omission = run["comments"]
    assert passage["kind"] == "inexact" and passage["anchor"] == "passage"
    assert passage["quote"] == "La raquette reste devant le corps."
    assert passage["where_to_look"] == "4:10"
    assert passage["status"] == "open" and passage["replies"] == []
    assert omission["anchor"] == "insertion"
    assert omission["quote"] == "On frappe à plat pour gagner du temps."
    assert passage["run_id"] == omission["run_id"]
    # La source est lue d'après la référence et la partie.
    assert reader.calls == [("https://youtu.be/abcdefghijk", "de 4:10 à 9:30")]
    ctx = companion.reviews[0]
    assert ctx.skill_title == "Revers lifté"
    assert (ctx.intention, ctx.scope) == ("Un revers fiable", "Le geste, le placement")
    assert ctx.resource_part == "de 4:10 à 9:30"
    assert ctx.resource_author == "The Tennis School"
    assert ctx.notes_text == (
        "## Le geste\n"
        "- La raquette reste devant le corps.\n"
        "- On frappe à plat pour gagner du temps."
    )
    assert (ctx.source_kind, ctx.source_text) == ("youtube", "[0:00] La source.")
    assert ctx.existing_comments == ()


def test_nothing_to_say_is_an_empty_list(
    client: TestClient, companion: FakeCompanion, reader: FakeReader
):
    r = _resource(client)
    run = _review(client, r["id"]).json()
    assert run == {"needs_paste": False, "paste_reason": None, "comments": []}


def test_guards_cut_at_three_and_drop_an_absent_quote(
    client: TestClient, companion: FakeCompanion, reader: FakeReader
):
    companion.findings = [
        finding(quote="Une phrase qui n'est pas dans les notes."),
        finding("unknown_kind"),
        *(finding("surface", message=f"Point {i}.") for i in range(5)),
    ]
    r = _resource(client)

    comments = _review(client, r["id"]).json()["comments"]

    assert [c["message"] for c in comments] == ["Point 0.", "Point 1.", "Point 2."]


def test_review_again_adds_and_sends_existing_comments(
    client: TestClient, companion: FakeCompanion, reader: FakeReader
):
    companion.findings = [finding()]
    r = _resource(client)
    first = _review(client, r["id"]).json()["comments"][0]
    client.patch(f"/review-comments/{first['id']}", json={"status": "resolved"})

    companion.findings = [finding("surface", message="Autre chose.")]
    second = _review(client, r["id"]).json()["comments"]

    assert [c["message"] for c in second] == ["Autre chose."]
    existing = companion.reviews[1].existing_comments
    assert [(c.kind, c.status) for c in existing] == [("inexact", "resolved")]
    listed = client.get(f"/resources/{r['id']}/review-comments").json()
    assert [c["message"] for c in listed] == [first["message"], "Autre chose."]


@pytest.mark.parametrize(
    "missing",
    [
        PasteReason.no_link,
        PasteReason.unreachable,
        PasteReason.no_transcript,
    ],
)
def test_unreadable_source_asks_to_paste(
    client: TestClient,
    companion: FakeCompanion,
    reader: FakeReader,
    missing: PasteReason,
):
    reader.result = SourceMissing(missing)
    r = _resource(client)

    run = _review(client, r["id"]).json()

    assert run == {"needs_paste": True, "paste_reason": missing, "comments": []}
    assert companion.reviews == []


def test_too_long_source_asks_to_paste_never_truncates(
    client: TestClient, companion: FakeCompanion, reader: FakeReader
):
    reader.result = SourceText(kind="web", text="x" * (MAX_SOURCE_CHARS + 1))
    r = _resource(client)

    run = _review(client, r["id"]).json()

    assert (run["needs_paste"], run["paste_reason"]) == (True, "too_long")
    assert companion.reviews == []


def test_pasted_text_skips_the_reader(
    client: TestClient, companion: FakeCompanion, reader: FakeReader
):
    r = _resource(client)

    resp = _review(client, r["id"], pasted_text="  Le passage collé.  ")

    assert resp.status_code == 200
    assert reader.calls == []
    ctx = companion.reviews[0]
    assert (ctx.source_kind, ctx.source_text) == ("pasted", "Le passage collé.")


def test_pasted_text_too_long_is_refused(
    client: TestClient, companion: FakeCompanion, reader: FakeReader
):
    r = _resource(client)
    resp = _review(client, r["id"], pasted_text="x" * (MAX_SOURCE_CHARS + 1))
    assert resp.status_code == 422
    assert companion.reviews == []


def test_empty_notes_are_refused(
    client: TestClient, companion: FakeCompanion, reader: FakeReader
):
    r = _resource(client, notes=None)
    assert _review(client, r["id"]).status_code == 422
    assert reader.calls == []


def test_unknown_resource_is_a_404(client: TestClient, companion, reader):
    assert _review(client, "00000000-0000-0000-0000-000000000000").status_code == 404


def test_unavailable_companion_is_a_503_before_reading_the_source(
    client: TestClient, reader: FakeReader
):
    app.dependency_overrides[get_companion] = lambda: Unavailable("Pas de clé.")
    r = _resource(client)

    resp = _review(client, r["id"])

    assert resp.status_code == 503
    assert resp.json() == {"detail": "Pas de clé."}
    assert reader.calls == []


# --- Résoudre, rouvrir, supprimer -----------------------------------------------


def _one_comment(client, companion) -> tuple[dict, dict]:
    companion.findings = [finding()]
    r = _resource(client)
    return r, _review(client, r["id"]).json()["comments"][0]


def test_resolve_then_reopen(client: TestClient, companion, reader):
    _, c = _one_comment(client, companion)

    resolved = client.patch(f"/review-comments/{c['id']}", json={"status": "resolved"})
    assert resolved.json()["status"] == "resolved"
    assert resolved.json()["resolved_at"] is not None

    reopened = client.patch(f"/review-comments/{c['id']}", json={"status": "open"})
    assert reopened.json()["status"] == "open"
    assert reopened.json()["resolved_at"] is None


def test_delete_a_comment(client: TestClient, companion, reader):
    r, c = _one_comment(client, companion)

    assert client.delete(f"/review-comments/{c['id']}").status_code == 204

    assert client.get(f"/resources/{r['id']}/review-comments").json() == []
    assert client.delete(f"/review-comments/{c['id']}").status_code == 404


def test_comments_leave_with_their_resource(client: TestClient, companion, reader):
    r, c = _one_comment(client, companion)
    client.post(f"/review-comments/{c['id']}/replies", json={"body": "Sûr ?"})

    client.delete(f"/resources/{r['id']}")

    assert (
        client.patch(f"/review-comments/{c['id']}", json={"status": "open"}).status_code
        == 404
    )


# --- Le fil ---------------------------------------------------------------------


def test_a_reply_gets_sophias_answer(
    client: TestClient, companion: FakeCompanion, reader: FakeReader
):
    _, c = _one_comment(client, companion)

    resp = client.post(
        f"/review-comments/{c['id']}/replies", json={"body": "  Tu es sûre ?  "}
    )

    assert resp.status_code == 201, resp.text
    thread = resp.json()["replies"]
    assert [(t["author"], t["body"]) for t in thread] == [
        ("user", "Tu es sûre ?"),
        ("sophia", "Tu as raison, tu peux le résoudre."),
    ]
    ctx = companion.replies[0]
    assert ctx.comment_quote == "La raquette reste devant le corps."
    assert [(t.author, t.body) for t in ctx.thread] == [("user", "Tu es sûre ?")]
    assert ctx.source_text == "[0:00] La source."


def test_a_reply_without_source_still_gets_an_answer(
    client: TestClient, companion: FakeCompanion, reader: FakeReader
):
    _, c = _one_comment(client, companion)
    reader.result = SourceMissing(PasteReason.unreachable)

    resp = client.post(f"/review-comments/{c['id']}/replies", json={"body": "Ah ?"})

    assert resp.status_code == 201
    assert companion.replies[0].source_text is None


def test_a_failed_answer_keeps_the_users_reply(
    client: TestClient, companion: FakeCompanion, reader: FakeReader
):
    r, c = _one_comment(client, companion)
    companion.fail = True

    resp = client.post(f"/review-comments/{c['id']}/replies", json={"body": "Ah ?"})

    assert resp.status_code == 502
    listed = client.get(f"/resources/{r['id']}/review-comments").json()
    assert [t["author"] for t in listed[0]["replies"]] == ["user"]


def test_an_unavailable_companion_writes_nothing(
    client: TestClient, companion: FakeCompanion, reader: FakeReader
):
    r, c = _one_comment(client, companion)
    app.dependency_overrides[get_companion] = lambda: Unavailable("Pas de clé.")

    resp = client.post(f"/review-comments/{c['id']}/replies", json={"body": "Ah ?"})

    assert resp.status_code == 503
    listed = client.get(f"/resources/{r['id']}/review-comments").json()
    assert listed[0]["replies"] == []


def test_a_blank_reply_is_refused(client: TestClient, companion, reader):
    _, c = _one_comment(client, companion)
    resp = client.post(f"/review-comments/{c['id']}/replies", json={"body": "   "})
    assert resp.status_code == 422
