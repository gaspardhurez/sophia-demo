"""Dictée dans les notes (#173) : transcription locale en direct (WebSocket),
puis nettoyage par le LLM (POST).

Aucun appel réseau, aucun modèle Whisper chargé : les ports sont remplacés par
des faux via les dépendances, le client Anthropic par un faux client, et
`mlx_whisper` par un faux module.
"""

import json
import math
import sys
import types
import uuid
from array import array
from pathlib import Path
from types import SimpleNamespace

import anthropic
import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from starlette.websockets import WebSocketDisconnect

from sophia.api.deps import get_companion, get_transcriber
from sophia.application import dictation as dictation_use_cases
from sophia.application.companion import (
    Availability,
    CompanionFailed,
    CompanionUnavailable,
    DictationContext,
)
from sophia.application.dictation import LiveDictation
from sophia.domain.dictation import (
    BYTES_PER_SECOND,
    AudioTooLong,
    Window,
    agreed_prefix,
    frame_levels,
    has_speech,
    quietest_frame,
    settle,
    trailing_pause,
    words,
)
from sophia.domain.notes import heading_titles
from sophia.infrastructure.llm import NO_API_KEY
from sophia.infrastructure.llm.anthropic_companion import (
    DICTATION_FAILED,
    AnthropicCompanion,
    _Bullets,
    dictation_message,
)
from sophia.infrastructure.llm.prompt import load_prompt
from sophia.infrastructure.transcription import NOT_INSTALLED
from sophia.infrastructure.transcription.mlx import MlxTranscriber
from sophia.infrastructure.unavailable import Unavailable
from sophia.main import app

# --- De l'audio de synthèse ----------------------------------------------------


def voice(seconds: float) -> bytes:
    """Un son franc (sinus à 220 Hz, un tiers de la pleine échelle) : de la
    « voix » pour le niveau."""
    n = round(seconds * 16000)
    return array(
        "h", (round(10000 * math.sin(2 * math.pi * 220 * i / 16000)) for i in range(n))
    ).tobytes()


def silence(seconds: float) -> bytes:
    return b"\0\0" * round(seconds * 16000)


# --- Faux ports ----------------------------------------------------------------


class FakeTranscriber:
    """Rend, passe après passe, les textes donnés (le dernier se répète) ;
    garde la durée et l'amorce de chaque passe."""

    def __init__(self, *texts: str, error: Exception | None = None) -> None:
        self.texts = list(texts) or [""]
        self.error = error
        self.calls: list[tuple[float, str]] = []

    def availability(self) -> Availability:
        return Availability(available=True)

    def transcribe(self, pcm: bytes, hint: str) -> str:
        self.calls.append((len(pcm) / BYTES_PER_SECOND, hint))
        if self.error is not None:
            raise self.error
        return self.texts[min(len(self.calls), len(self.texts)) - 1]


class FakeCompanion:
    def __init__(
        self, bullets: list[str] | None = None, error: Exception | None = None
    ) -> None:
        self.bullets = bullets or []
        self.error = error
        self.contexts: list[DictationContext] = []

    def availability(self) -> Availability:
        return Availability(available=True)

    def clean_dictation(self, ctx: DictationContext) -> list[str]:
        self.contexts.append(ctx)
        if self.error is not None:
            raise self.error
        return self.bullets


def ports(companion, transcriber) -> None:
    app.dependency_overrides[get_companion] = lambda: companion
    app.dependency_overrides[get_transcriber] = lambda: transcriber


def heading(level: int, text: str) -> dict:
    return {
        "type": "heading",
        "attrs": {"level": level},
        "content": [{"type": "text", "text": text}],
    }


def paragraph(text: str) -> dict:
    return {"type": "paragraph", "content": [{"type": "text", "text": text}]}


def skill_and_resource(
    client: TestClient, *, part: str | None = None
) -> tuple[str, str]:
    """Le savoir « Le fonctionnement de Python », dont les notes portent deux
    titres, et une de ses ressources."""
    d = client.post("/domains", json={"name": "Dev"}).json()["id"]
    s = client.post(
        f"/domains/{d}/skills", json={"name": "Le fonctionnement de Python"}
    ).json()["id"]
    doc = {
        "type": "doc",
        "content": [
            heading(1, "L'interpréteur"),
            paragraph("Le corps des notes ne part pas au LLM."),
            heading(2, "Le REPL"),
        ],
    }
    assert client.put(f"/skills/{s}/notes", json={"doc": doc}).status_code == 200
    body = {"title": "Whetting Your Appetite", "part": part}
    r = client.post(f"/skills/{s}/resources", json=body).json()["id"]
    return s, r


# --- Le domaine : niveau, pauses ------------------------------------------------


def test_levels_tell_voice_from_silence():
    levels = frame_levels(voice(0.3) + silence(0.6))
    assert len(levels) == 30  # trames de 30 ms, complètes seulement
    assert has_speech(levels)
    assert not has_speech(frame_levels(silence(1)))
    # Une trame incomplète attend la suite.
    assert frame_levels(b"\0\0" * 100) == []


def test_a_pause_is_half_a_second_of_silence_after_voice():
    assert trailing_pause(frame_levels(voice(1) + silence(0.6)))
    assert not trailing_pause(frame_levels(voice(1) + silence(0.3)))
    assert not trailing_pause(frame_levels(silence(2)))  # rien n'a parlé


def test_a_long_window_is_cut_where_it_is_quietest():
    levels = frame_levels(voice(2) + silence(0.15) + voice(2))
    cut = quietest_frame(levels, 10, len(levels) - 10)
    assert 2 / 0.03 <= cut <= 2.15 / 0.03


# --- Le domaine : la validation des mots ----------------------------------------


def test_words_drop_lone_punctuation():
    assert words("  Python est … interprété. ...") == ("Python", "est", "interprété.")


def test_agreement_ignores_case_and_punctuation():
    a = words("Python est un langage")
    assert agreed_prefix(a, words("python est un, langage interprété")) == 4
    assert agreed_prefix(a, words("Python et un langage")) == 1
    assert agreed_prefix((), a) == 0


def test_two_passes_must_agree_before_a_word_is_validated():
    first = settle(Window(), words("Python est un inter"), close=False)
    assert first.validated == ()
    assert first.tentative == words("Python est un inter")

    second = settle(first.window, words("Python est un langage"), close=False)
    # Trois mots s'accordent, mais les deux derniers entendus restent
    # provisoires : la fin de la fenêtre a pu couper un mot.
    assert second.validated == words("Python est")
    assert second.tentative == words("un langage")
    assert second.window == Window(validated=2, previous=words("Python est un langage"))

    third = settle(
        second.window, words("Python est un langage interprété, on"), close=False
    )
    assert third.validated == words("un langage")
    assert third.tentative == words("interprété, on")


def test_a_validated_word_is_never_taken_back():
    window = Window(validated=3, previous=words("Python est un langage"))
    # La passe réécrit le début autrement : le validé tient, le reste suit.
    s = settle(window, words("Python et un langage interprété"), close=False)
    assert s.validated == ()
    assert s.tentative == ("langage", "interprété")
    assert s.window.validated == 3


def test_closing_validates_everything_and_opens_a_new_window():
    window = Window(validated=2, previous=words("Python est un"))
    s = settle(window, words("Python est un langage interprété."), close=True)
    assert s.validated == words("un langage interprété.")
    assert s.tentative == ()
    assert s.closed and s.window == Window()


# --- La session en direct --------------------------------------------------------


def test_live_session_validates_by_agreement_then_on_pause():
    t = FakeTranscriber(
        "Python est un inter",
        "Python est un langage",
        "Python est un langage interprété.",
        "On peut",
    )
    live = LiveDictation(t, "Python")

    live.feed(voice(0.5))
    assert live.due()
    live.step()
    assert (live.validated, live.tentative) == ("", "Python est un inter")

    live.feed(voice(0.5))
    live.step()
    assert (live.validated, live.tentative) == ("Python est", "un langage")

    # Une pause : tout ce que la passe entend est validé, la fenêtre se ferme.
    live.feed(silence(0.6))
    live.step()
    assert live.validated == "Python est un langage interprété."
    assert live.tentative == ""
    assert t.calls[2][0] == pytest.approx(1.6, abs=0.01)

    # La fenêtre suivante ne porte que l'audio d'après, et son amorce la fin
    # du texte validé ; pas avant (son audio portait encore ces mots).
    live.feed(voice(0.5))
    live.step()
    assert t.calls[3][0] == pytest.approx(0.5, abs=0.01)
    assert t.calls[1][1] == "Python"
    assert t.calls[3][1] == "Python. Python est un langage interprété."
    assert live.finish() == "Python est un langage interprété. On peut"
    assert live.tentative == ""


def test_live_session_does_not_transcribe_silence():
    t = FakeTranscriber("Sous-titres réalisés par la communauté d'Amara.org")
    live = LiveDictation(t, "")
    live.feed(silence(2))
    assert live.due()
    live.step()
    assert t.calls == []
    assert not live.due()
    assert live.finish() == ""
    assert t.calls == []


def test_live_session_cuts_a_window_too_long_without_pause(monkeypatch):
    monkeypatch.setattr(dictation_use_cases, "MAX_WINDOW_SECONDS", 4)
    t = FakeTranscriber("Un deux trois", "quatre")
    live = LiveDictation(t, "")
    live.feed(voice(3) + silence(0.1) + voice(1.9))
    live.step()
    # Coupée au silence, entre sa moitié et sa dernière seconde : la tête
    # est validée, la queue reste.
    assert live.validated == "Un deux trois"
    assert 3 <= t.calls[0][0] <= 3.1
    assert live.finish() == "Un deux trois quatre"
    assert 1.9 <= t.calls[1][0] <= 2


def test_live_session_refuses_more_than_ten_minutes(monkeypatch):
    monkeypatch.setattr(dictation_use_cases, "MAX_AUDIO_SECONDS", 1)
    live = LiveDictation(FakeTranscriber(), "")
    live.feed(voice(1))
    with pytest.raises(AudioTooLong):
        live.feed(voice(0.1))


# --- WS /skills/{id}/dictation/live ---------------------------------------------


def live_url(skill_id: str, resource_id: str | None = None) -> str:
    url = f"/skills/{skill_id}/dictation/live"
    return f"{url}?resource_id={resource_id}" if resource_id else url


def test_websocket_streams_the_transcript_then_the_final_text(client: TestClient):
    s, r = skill_and_resource(client, part="Section 1")
    t = FakeTranscriber("Python est", "Python est interprété", "Python est interprété.")
    ports(FakeCompanion(), t)

    with client.websocket_connect(live_url(s, r)) as ws:
        assert ws.receive_json() == {"type": "ready"}
        ws.send_bytes(voice(0.5))
        assert ws.receive_json() == {
            "type": "transcript",
            "committed": "",
            "tentative": "Python est",
        }
        ws.send_bytes(voice(0.5))
        assert ws.receive_json() == {
            "type": "transcript",
            "committed": "Python",
            "tentative": "est interprété",
        }
        ws.send_json({"type": "stop"})
        assert ws.receive_json() == {"type": "final", "text": "Python est interprété."}
        with pytest.raises(WebSocketDisconnect):
            ws.receive_json()

    # L'amorce : le vocabulaire attendu (savoir, ressource, partie, titres).
    assert t.calls[0][1] == (
        "Le fonctionnement de Python. Whetting Your Appetite. Section 1. "
        "L'interpréteur. Le REPL"
    )


def test_websocket_waits_for_enough_audio_before_a_pass(client: TestClient):
    s, _ = skill_and_resource(client)
    t = FakeTranscriber("Python")
    ports(FakeCompanion(), t)

    with client.websocket_connect(live_url(s)) as ws:
        assert ws.receive_json() == {"type": "ready"}
        ws.send_bytes(voice(0.2))
        ws.send_json({"type": "stop"})
        assert ws.receive_json() == {"type": "final", "text": "Python"}
    assert len(t.calls) == 1  # la seule passe finale
    # Dans les notes du savoir : pas de ressource dans l'amorce.
    assert t.calls[0][1] == "Le fonctionnement de Python. L'interpréteur. Le REPL"


def test_websocket_on_an_unknown_target_says_not_found(client: TestClient):
    s, r = skill_and_resource(client)
    _, other = skill_and_resource(client)
    ports(FakeCompanion(), FakeTranscriber())
    for url in (live_url(str(uuid.uuid4())), live_url(s, other)):
        with client.websocket_connect(url) as ws:
            assert ws.receive_json()["code"] == "not_found"


def test_websocket_without_a_port_says_every_reason_before_transcribing(
    client: TestClient,
):
    s, _ = skill_and_resource(client)
    ports(Unavailable(NO_API_KEY), Unavailable(NOT_INSTALLED))
    with client.websocket_connect(live_url(s)) as ws:
        assert ws.receive_json() == {
            "type": "error",
            "code": "unavailable",
            "detail": f"{NOT_INSTALLED} {NO_API_KEY}",
        }


def test_websocket_refuses_more_than_ten_minutes(client: TestClient, monkeypatch):
    monkeypatch.setattr(dictation_use_cases, "MAX_AUDIO_SECONDS", 1)
    s, _ = skill_and_resource(client)
    ports(FakeCompanion(), FakeTranscriber("Python"))
    with client.websocket_connect(live_url(s)) as ws:
        assert ws.receive_json() == {"type": "ready"}
        ws.send_bytes(voice(0.5))
        assert ws.receive_json()["type"] == "transcript"
        ws.send_bytes(voice(0.6))
        message = ws.receive_json()
        assert (message["type"], message["code"]) == ("error", "too_long")


def test_websocket_refuses_an_unexpected_message(client: TestClient):
    s, _ = skill_and_resource(client)
    ports(FakeCompanion(), FakeTranscriber())
    with client.websocket_connect(live_url(s)) as ws:
        assert ws.receive_json() == {"type": "ready"}
        ws.send_text("bonjour")
        assert ws.receive_json()["code"] == "bad_message"


# --- POST /skills/{id}/dictation -------------------------------------------------


def test_cleaning_returns_the_bullets_with_the_resource_context(client: TestClient):
    s, r = skill_and_resource(client, part="Section 1")
    companion = FakeCompanion(["Python est interprété.", "  ", "On teste au REPL."])
    ports(companion, FakeTranscriber())

    response = client.post(
        f"/skills/{s}/dictation",
        json={"transcript": " euh Python c'est interprété ", "resource_id": r},
    )

    assert response.status_code == 200, response.text
    # Les puces vides ne repartent pas vers l'écran.
    assert response.json() == {
        "bullets": ["Python est interprété.", "On teste au REPL."]
    }
    assert companion.contexts == [
        DictationContext(
            skill="Le fonctionnement de Python",
            resource="Whetting Your Appetite",
            resource_part="Section 1",
            note_titles=("L'interpréteur", "Le REPL"),
            transcript="euh Python c'est interprété",
        )
    ]


def test_cleaning_in_the_skill_notes_has_no_resource(client: TestClient):
    s, _ = skill_and_resource(client)
    companion = FakeCompanion(["Python est interprété."])
    ports(companion, FakeTranscriber())

    response = client.post(f"/skills/{s}/dictation", json={"transcript": "Python"})

    assert response.status_code == 200
    ctx = companion.contexts[0]
    assert (ctx.resource, ctx.resource_part) == (None, None)


def test_nothing_heard_is_no_bullet_without_calling_the_llm(client: TestClient):
    s, _ = skill_and_resource(client)
    companion = FakeCompanion(["jamais rendu"])
    ports(companion, FakeTranscriber())

    response = client.post(f"/skills/{s}/dictation", json={"transcript": "   "})

    assert response.json() == {"bullets": []}
    assert companion.contexts == []


def test_cleaning_on_an_unknown_target_is_a_404(client: TestClient):
    s, _ = skill_and_resource(client)
    _, other = skill_and_resource(client)
    ports(FakeCompanion(), FakeTranscriber())
    unknown = client.post(f"/skills/{uuid.uuid4()}/dictation", json={"transcript": "a"})
    foreign = client.post(
        f"/skills/{s}/dictation", json={"transcript": "a", "resource_id": other}
    )
    assert (unknown.status_code, foreign.status_code) == (404, 404)


def test_cleaning_without_the_llm_is_a_503(client: TestClient):
    s, _ = skill_and_resource(client)
    ports(Unavailable(NO_API_KEY), FakeTranscriber())
    response = client.post(f"/skills/{s}/dictation", json={"transcript": "a"})
    assert response.status_code == 503
    assert response.json() == {"detail": NO_API_KEY}


def test_a_failed_cleaning_is_a_502(client: TestClient):
    s, _ = skill_and_resource(client)
    ports(FakeCompanion(error=CompanionFailed("Raté.")), FakeTranscriber())
    response = client.post(f"/skills/{s}/dictation", json={"transcript": "a"})
    assert response.status_code == 502
    assert response.json() == {"detail": "Raté."}


def test_a_too_long_transcript_is_a_422(client: TestClient):
    s, _ = skill_and_resource(client)
    ports(FakeCompanion(), FakeTranscriber())
    body = {"transcript": "a" * 20_001}
    assert client.post(f"/skills/{s}/dictation", json=body).status_code == 422


def test_unavailable_port_refuses_dictation_methods():
    port = Unavailable("Motif.")
    with pytest.raises(CompanionUnavailable):
        port.transcribe(b"", "")
    with pytest.raises(CompanionUnavailable):
        port.clean_dictation(DictationContext("s", None, None, (), "transcription"))


# --- Les titres des notes -------------------------------------------------------


def test_heading_titles_in_order_without_blanks_or_duplicates():
    doc = {
        "type": "doc",
        "content": [
            heading(1, "A"),
            {"type": "columns", "content": [heading(2, "B"), heading(3, " ")]},
            heading(1, "A"),
            paragraph("pas un titre"),
        ],
    }
    assert heading_titles(doc) == ["A", "B"]
    assert heading_titles(None) == []


# --- L'adaptateur Anthropic, sur un faux client ---------------------------------


CTX = DictationContext(
    skill="Le fonctionnement de Python",
    resource="Whetting Your Appetite",
    resource_part=None,
    note_titles=("L'interpréteur",),
    transcript="euh Python c'est interprété",
)


class FakeMessages:
    def __init__(self, response=None, error: Exception | None = None) -> None:
        self.response = response
        self.error = error
        self.kwargs: dict = {}

    def parse(self, **kwargs):
        self.kwargs = kwargs
        if self.error is not None:
            raise self.error
        return self.response


def fake_response(bullets: list[str] | None, stop_reason: str = "end_turn"):
    return SimpleNamespace(
        stop_reason=stop_reason,
        parsed_output=None if bullets is None else _Bullets(bullets=bullets),
        usage=SimpleNamespace(
            input_tokens=40,
            output_tokens=12,
            cache_read_input_tokens=600,
            cache_creation_input_tokens=None,
        ),
    )


def companion_with(messages: FakeMessages, log_path: Path) -> AnthropicCompanion:
    companion = AnthropicCompanion(
        api_key=SecretStr("sk-test"),
        model_dictation="claude-haiku-5-5",
        model_review="claude-opus-5-5",
        log_path=log_path,
    )
    companion._client = SimpleNamespace(messages=messages)  # aucun réseau
    return companion


def test_prompt_is_versioned():
    prompt = load_prompt("dictation")
    assert prompt.version == "dictation-2"
    assert prompt.text.startswith("Tu nettoies")
    assert "version:" not in prompt.text


def test_dictation_message_tags_the_context():
    message = dictation_message(
        DictationContext("Savoir", "Ressource", "Partie", ("T1", "T2"), "brut")
    )
    assert message == (
        "<savoir>\nSavoir\n</savoir>\n\n"
        "<ressource>\nRessource\n</ressource>\n\n"
        "<partie>\nPartie\n</partie>\n\n"
        "<titres_des_notes>\n- T1\n- T2\n</titres_des_notes>\n\n"
        "<transcription>\nbrut\n</transcription>"
    )
    # Sans ressource, partie ni titres (les notes du savoir), pas de balise.
    bare = dictation_message(DictationContext("S", None, None, (), "brut"))
    assert bare == "<savoir>\nS\n</savoir>\n\n<transcription>\nbrut\n</transcription>"


def test_clean_dictation_calls_the_api_and_logs_the_call(tmp_path: Path):
    messages = FakeMessages(fake_response(["Python est interprété."]))
    log = tmp_path / "llm_calls.jsonl"

    bullets = companion_with(messages, log).clean_dictation(CTX)

    assert bullets == ["Python est interprété."]
    sent = messages.kwargs
    assert sent["model"] == "claude-haiku-5-5"
    assert sent["output_format"] is _Bullets
    assert "temperature" not in sent
    # Le prompt système est fixe et mis en cache ; le contexte part en message.
    assert sent["system"][0]["text"] == load_prompt("dictation").text
    assert sent["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert sent["messages"] == [{"role": "user", "content": dictation_message(CTX)}]

    entry = json.loads(log.read_text(encoding="utf-8"))
    assert entry["usage"] == "dictation"
    assert entry["prompt_version"] == "dictation-2"
    assert entry["model"] == "claude-haiku-5-5"
    assert (entry["input_tokens"], entry["output_tokens"]) == (640, 12)
    assert (entry["uncached_input_tokens"], entry["cache_read_tokens"]) == (40, 600)
    assert entry["cost_usd"] == pytest.approx(
        (40 * 0.10 + 600 * 0.01 + 12 * 0.50) / 1e6
    )
    assert entry["context"]["transcript"] == "euh Python c'est interprété"


@pytest.mark.parametrize(
    "response",
    [fake_response(None, stop_reason="refusal"), fake_response(["a"], "max_tokens")],
)
def test_a_refused_or_truncated_answer_fails(tmp_path: Path, response):
    companion = companion_with(FakeMessages(response), tmp_path / "log.jsonl")
    with pytest.raises(CompanionFailed) as raised:
        companion.clean_dictation(CTX)
    assert raised.value.reason == DICTATION_FAILED


def test_an_api_error_fails_without_logging(tmp_path: Path):
    error = anthropic.APIConnectionError(
        request=httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    )
    log = tmp_path / "log.jsonl"
    with pytest.raises(CompanionFailed):
        companion_with(FakeMessages(error=error), log).clean_dictation(CTX)
    assert not log.exists()


# --- L'adaptateur mlx-whisper, sur un faux module --------------------------------


@pytest.fixture
def fake_mlx(monkeypatch: pytest.MonkeyPatch):
    """Un faux `mlx_whisper` : rien n'est chargé ni téléchargé."""
    state = SimpleNamespace(calls=[])

    def transcribe(audio, **kwargs):
        state.calls.append((audio, kwargs))
        return {"text": "  Python est interprété. ", "segments": []}

    module = types.ModuleType("mlx_whisper")
    module.transcribe = transcribe
    monkeypatch.setitem(sys.modules, "mlx_whisper", module)
    return state


def test_mlx_transcribes_pcm_in_french_with_the_hint(fake_mlx):
    # La conversion du PCM passe par numpy, qui vient avec l'extra
    # `transcription` (mlx-whisper, Apple Silicon) : sans lui, rien à tester.
    pytest.importorskip("numpy")
    pytest.importorskip("mlx")
    transcriber = MlxTranscriber(model="mlx-community/whisper-large-v3-turbo")
    pcm = array("h", [0, 16384, -32768]).tobytes()

    text = transcriber.transcribe(pcm, "Python")

    assert text == "Python est interprété."
    audio, kwargs = fake_mlx.calls[0]
    # Le PCM passe en flottants de -1 à 1, sans fichier ni ffmpeg.
    assert audio.dtype.name == "float32"
    assert audio.tolist() == [0.0, 0.5, -1.0]
    assert kwargs == {
        "path_or_hf_repo": "mlx-community/whisper-large-v3-turbo",
        "language": "fr",
        "initial_prompt": "Python",
        "temperature": 0.0,
        "condition_on_previous_text": False,
        # Un plafond de jetons à la mesure de l'audio (3 échantillons : 24).
        "sample_len": 24,
        "without_timestamps": True,
    }


def test_mlx_nothing_to_transcribe(fake_mlx):
    assert MlxTranscriber(model="m").transcribe(b"", "") == ""
    assert fake_mlx.calls == []
