"""Règles pures de la vérification (#173) : texte des notes, garde-fous,
lecture de la partie d'une vidéo. Plus la lecture de la source et l'adaptateur
Anthropic, avec des faux à la place du réseau et du client."""

from types import SimpleNamespace

import pytest

from sophia.application.companion import CompanionFailed, ReviewContext
from sophia.application.review import SourceMissing, SourceText
from sophia.domain.review import (
    Finding,
    PasteReason,
    ReviewAnchor,
    ReviewKind,
    keep_findings,
    notes_text,
)
from sophia.domain.source import (
    Caption,
    TimeRange,
    captions_text,
    time_range,
    youtube_video_id,
)
from sophia.infrastructure import sources
from sophia.infrastructure.llm.anthropic_companion import (
    AnthropicCompanion,
    _Finding,
    _Review,
)


def p(text: str) -> dict:
    return {"type": "paragraph", "content": [{"type": "text", "text": text}]}


def bullets(*items) -> dict:
    return {
        "type": "bulletList",
        "content": [
            {"type": "listItem", "content": list(i) if isinstance(i, tuple) else [i]}
            for i in items
        ],
    }


# --- Le texte des notes --------------------------------------------------------


def test_notes_text_one_line_per_block_with_its_form():
    doc = {
        "type": "doc",
        "content": [
            {
                "type": "heading",
                "attrs": {"level": 1},
                "content": [{"type": "text", "text": "Titre"}],
            },
            p("Un paragraphe "),
            p("   "),
            bullets(p("A"), (p("B"), bullets(p("B1")), p("B suite"))),
            {"type": "columns", "content": [{"type": "column", "content": [p("Col")]}]},
            {"type": "image", "attrs": {"src": "/media/x.png"}},
        ],
    }
    assert notes_text(doc) == "\n".join(
        ["# Titre", "Un paragraphe", "- A", "- B", "  - B1", "  B suite", "Col"]
    )


def test_notes_text_indents_the_children_of_a_paragraph():
    # Un paragraphe parent : son texte, puis ses enfants en retrait, sans puce
    # (un enfant qui a lui-même des enfants, un niveau de plus).
    def parent(*blocks) -> dict:
        return {
            "type": "textList",
            "content": [{"type": "textItem", "content": list(blocks)}],
        }

    doc = {
        "type": "doc",
        "content": [
            parent(
                p("P"), p("Enfant"), parent(p("Sous"), p("Petit")), bullets(p("Puce"))
            ),
            p("Après"),
        ],
    }
    assert notes_text(doc) == "\n".join(
        ["P", "  Enfant", "  Sous", "    Petit", "  - Puce", "Après"]
    )


def test_notes_text_of_nothing_is_empty():
    assert notes_text(None) == ""
    assert notes_text({"type": "doc"}) == ""


# --- Les garde-fous ------------------------------------------------------------

DOC = {"type": "doc", "content": [bullets(p("L’idée ici,  avec sa raison."))]}


def f(kind=ReviewKind.inexact, quote=None, after=None, message="M."):
    return Finding(kind, quote, after, message, None)


def test_a_quote_matches_despite_spaces_quotes_and_line_markers():
    kept = keep_findings([f(quote="- L'idée ici, avec sa raison.")], DOC)
    assert [(k.anchor, k.quote) for k in kept] == [
        (ReviewAnchor.passage, "L'idée ici, avec sa raison.")
    ]


def test_an_absent_quote_or_empty_message_is_dropped():
    assert keep_findings([f(quote="Inventé.")], DOC) == []
    assert keep_findings([f(quote=None)], DOC) == []
    assert keep_findings([f(quote="L’idée ici", message="  ")], DOC) == []


def test_an_omission_anchors_after_its_quote():
    kept = keep_findings([f(ReviewKind.omission, after="avec sa raison")], DOC)
    assert kept[0].anchor is ReviewAnchor.insertion
    assert kept[0].quote == "avec sa raison"
    assert keep_findings([f(ReviewKind.omission, after="ailleurs")], DOC) == []


def test_three_at_most():
    kept = keep_findings([f(quote="L’idée", message=str(i)) for i in range(5)], DOC)
    assert [k.message for k in kept] == ["0", "1", "2"]


# --- La partie d'une vidéo -----------------------------------------------------


@pytest.mark.parametrize(
    ("part", "expected"),
    [
        ("de 4:10 à 9:30", TimeRange(250, 570)),
        ("4:10-9:30", TimeRange(250, 570)),
        ("4:10 → 1:02:03", TimeRange(250, 3723)),
        ("à partir de 12:00", TimeRange(720, None)),
        ("jusqu'à 9:30", TimeRange(None, 570)),
        ("vers 9:30", None),
        ("chapitres 2 et 3", None),
        (None, None),
    ],
)
def test_time_range(part, expected):
    assert time_range(part) == expected


@pytest.mark.parametrize(
    ("ref", "expected"),
    [
        ("https://www.youtube.com/watch?v=abcdefghijk&t=3", "abcdefghijk"),
        ("https://youtu.be/abcdefghijk?si=x", "abcdefghijk"),
        ("https://youtube.com/shorts/abcdefghijk", "abcdefghijk"),
        ("https://m.youtube.com/embed/abcdefghijk", "abcdefghijk"),
        ("https://youtu.be/x", None),
        ("https://docs.python.org/3/tutorial/", None),
        ("Tennis MBA, épisode 12", None),
    ],
)
def test_youtube_video_id(ref, expected):
    assert youtube_video_id(ref) == expected


def test_captions_grouped_timestamped_and_restricted():
    caps = [Caption(f"mot{i}", i * 10.0) for i in range(10)]
    assert captions_text(caps).splitlines() == [
        "[0:00] mot0 mot1 mot2 mot3",
        "[0:40] mot4 mot5 mot6 mot7",
        "[1:20] mot8 mot9",
    ]
    assert captions_text(caps, TimeRange(25, 55)) == "[0:30] mot3 mot4 mot5"


# --- La lecture de la source (sans réseau) -------------------------------------


def test_reader_without_link_asks_to_paste():
    reader = sources.WebSourceReader()
    assert reader.read("Livre, chapitre 2", None) == SourceMissing(PasteReason.no_link)
    assert reader.read(None, None) == SourceMissing(PasteReason.no_link)


def test_reader_extracts_the_main_text_of_a_page(monkeypatch):
    article = "<p>" + "Le texte principal de la page. " * 20 + "</p>"
    html = f"<html><body><nav>Menu</nav><article>{article}</article></body></html>"
    monkeypatch.setattr(sources, "fetch_page", lambda url: html)
    read = sources.WebSourceReader().read("https://exemple.fr/page", None)
    assert isinstance(read, SourceText) and read.kind == "web"
    assert "Le texte principal" in read.text


def test_reader_unreachable_or_thin_page(monkeypatch):
    monkeypatch.setattr(sources, "fetch_page", lambda url: None)
    assert sources.read_web("https://x.fr") == SourceMissing(PasteReason.unreachable)
    monkeypatch.setattr(
        sources,
        "fetch_page",
        lambda url: "<html><body><p>Abonnez-vous.</p></body></html>",
    )
    assert sources.read_web("https://x.fr") == SourceMissing(PasteReason.unreachable)


class FakeYouTube:
    def __init__(self, result):
        self.result = result

    def __call__(self, http_client=None):
        return self

    def fetch(self, video_id, languages):
        assert languages == ["fr", "en"]
        if isinstance(self.result, Exception):
            raise self.result
        return [SimpleNamespace(text=t, start=s) for t, s in self.result]


def test_reader_youtube_restricted_to_the_part(monkeypatch):
    monkeypatch.setattr(
        sources, "YouTubeTranscriptApi", FakeYouTube([("avant", 10), ("dedans", 300)])
    )
    read = sources.WebSourceReader().read(
        "https://youtu.be/abcdefghijk", "de 4:10 à 9:30"
    )
    assert read == SourceText(kind="youtube", text="[5:00] dedans")


def test_reader_youtube_without_captions(monkeypatch):
    error = sources.TranscriptsDisabled("abcdefghijk")
    monkeypatch.setattr(sources, "YouTubeTranscriptApi", FakeYouTube(error))
    assert sources.read_youtube("abcdefghijk", None) == SourceMissing(
        PasteReason.no_transcript
    )


# --- L'adaptateur Anthropic (client factice) -----------------------------------


class FakeMessages:
    def __init__(self, response):
        self.response = response
        self.calls: list[dict] = []

    def parse(self, **kwargs):
        self.calls.append(kwargs)
        return self.response

    create = parse


def fake_companion(tmp_path, response):
    from pydantic import SecretStr

    companion = AnthropicCompanion(
        api_key=SecretStr("sk-test"),
        model_dictation="d",
        model_review="claude-opus-5-5",
        log_path=tmp_path / "log.jsonl",
    )
    messages = FakeMessages(response)
    companion._client = SimpleNamespace(beta=SimpleNamespace(messages=messages))
    return companion, messages


CTX = ReviewContext(
    skill_title="S",
    intention=None,
    scope=None,
    resource_title="R",
    resource_author=None,
    resource_reference=None,
    resource_part=None,
    notes_text="Notes & co",
    source_kind="pasted",
    source_text="Source",
)


def response(parsed=None, stop="end_turn", content=()):
    return SimpleNamespace(
        parsed_output=parsed,
        stop_reason=stop,
        model="claude-opus-5-5",
        usage=SimpleNamespace(
            input_tokens=10,
            output_tokens=5,
            cache_read_input_tokens=0,
            cache_creation_input_tokens=None,
        ),
        content=list(content),
    )


def test_adapter_review_call_and_journal(tmp_path):
    parsed = _Review(
        findings=[
            _Finding(
                kind="inexact",
                quote="Notes &amp; co",
                after_quote=None,
                message="M.",
                where_to_look=None,
            )
        ]
    )
    companion, messages = fake_companion(tmp_path, response(parsed))

    [found] = companion.review_notes(CTX)

    call = messages.calls[0]
    assert call["model"] == "claude-opus-5-5"
    assert call["output_format"] is _Review
    assert call["fallbacks"] == "default"
    assert "temperature" not in call
    assert "<notes>Notes &amp; co</notes>" in call["messages"][0]["content"]
    assert found.quote == "Notes & co"
    assert found.prompt_version == "review-1"
    assert "review" in (tmp_path / "log.jsonl").read_text(encoding="utf-8")


def test_adapter_refusal_fails(tmp_path):
    companion, _ = fake_companion(tmp_path, response(stop="refusal"))
    with pytest.raises(CompanionFailed):
        companion.review_notes(CTX)
