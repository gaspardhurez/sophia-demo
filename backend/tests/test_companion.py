"""Compagnon : la disponibilité de ses ports, l'état de ses actions, son journal.

Aucun appel réseau : le client Anthropic n'est jamais créé ici.
"""

import json
import os
from collections.abc import Generator
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from sophia.api.deps import get_companion, get_transcriber
from sophia.application.companion import Availability, CompanionUnavailable
from sophia.domain.llm_cost import call_cost
from sophia.infrastructure import transcription
from sophia.infrastructure.config import Settings
from sophia.infrastructure.llm import NO_API_KEY, build_companion
from sophia.infrastructure.llm.anthropic_companion import AnthropicCompanion
from sophia.infrastructure.llm.journal import log_call
from sophia.infrastructure.transcription import (
    DISABLED,
    NOT_INSTALLED,
    build_transcriber,
)
from sophia.infrastructure.transcription.mlx import MlxTranscriber
from sophia.infrastructure.unavailable import Unavailable
from sophia.main import app, handle_companion_unavailable


def settings(**values) -> Settings:
    """Une config qui ne lit ni le `.env` ni la vraie clé de l'environnement."""
    return Settings(_env_file=None, **values)


@pytest.fixture(autouse=True)
def no_key_in_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)


# --- Config ------------------------------------------------------------------


def test_api_key_read_under_its_usual_name_from_env_file(tmp_path: Path):
    env = tmp_path / ".env"
    env.write_text("ANTHROPIC_API_KEY=sk-test\n", encoding="utf-8")
    loaded = Settings(_env_file=env)
    assert loaded.anthropic_api_key is not None
    assert loaded.anthropic_api_key.get_secret_value() == "sk-test"
    # Le `.env` n'est pas recopié dans l'environnement : d'où la clé passée
    # explicitement au client.
    assert "ANTHROPIC_API_KEY" not in os.environ


def test_api_key_read_from_environment(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-env")
    assert settings().anthropic_api_key.get_secret_value() == "sk-env"


def test_api_key_never_printed():
    loaded = settings(ANTHROPIC_API_KEY="sk-secret")
    assert "sk-secret" not in repr(loaded)
    assert "sk-secret" not in str(loaded.anthropic_api_key)


def test_companion_defaults():
    loaded = settings()
    assert loaded.anthropic_api_key is None
    assert loaded.llm_model_dictation == "claude-haiku-5-5"
    assert loaded.llm_model_review == "claude-opus-5-5"
    assert loaded.transcriber == "mlx"
    assert loaded.whisper_model == "mlx-community/whisper-large-v3-turbo"
    assert loaded.llm_log_path.name == "llm_calls.jsonl"
    # Par défaut, le compagnon passe par l'API, comme avant le 30/10.
    assert loaded.llm_backend == "api"
    assert loaded.claude_bin == "claude"


# --- Disponibilité des ports --------------------------------------------------


def test_llm_available_with_a_key_without_creating_the_client():
    companion = build_companion(settings(ANTHROPIC_API_KEY="sk-test"))
    assert isinstance(companion, AnthropicCompanion)
    assert companion.availability() == Availability(available=True)
    assert companion._client is None  # paresseux : rien n'est parti


@pytest.mark.parametrize("key", [None, "", "   "])
def test_llm_unavailable_without_a_key(key):
    values = {} if key is None else {"ANTHROPIC_API_KEY": key}
    companion = build_companion(settings(**values))
    assert companion.availability() == Availability(False, NO_API_KEY)


def test_transcriber_available_when_mlx_whisper_is_installed(monkeypatch):
    monkeypatch.setattr(transcription, "find_spec", lambda name: object())
    transcriber = build_transcriber(settings())
    assert isinstance(transcriber, MlxTranscriber)
    assert transcriber.model == "mlx-community/whisper-large-v3-turbo"
    assert transcriber.availability().available


def test_transcriber_unavailable_when_mlx_whisper_is_missing(monkeypatch):
    monkeypatch.setattr(transcription, "find_spec", lambda name: None)
    transcriber = build_transcriber(settings())
    assert transcriber.availability() == Availability(False, NOT_INSTALLED)


def test_transcriber_disabled_by_config(monkeypatch):
    monkeypatch.setattr(transcription, "find_spec", lambda name: object())
    transcriber = build_transcriber(settings(transcriber="none"))
    assert transcriber.availability() == Availability(False, DISABLED)


def test_unavailable_port_refuses_any_call_with_its_reason():
    port = Unavailable("Motif.")
    with pytest.raises(CompanionUnavailable) as raised:
        port.transcribe(b"", "")
    assert raised.value.reason == "Motif."
    for call in (
        port.review_notes,
        port.central_ideas,
        port.reply_in_thread,
        port.intention_turn,
        port.propose_scope,
        port.search_resources,
    ):
        with pytest.raises(CompanionUnavailable):
            call(None)
    # Les attributs spéciaux ne passent pas pour des appels au port.
    assert not hasattr(port, "__deepcopy__")


def test_unavailable_becomes_503_with_its_reason():
    response = handle_companion_unavailable(None, CompanionUnavailable("Motif."))
    assert response.status_code == 503
    assert json.loads(response.body) == {"detail": "Motif."}


# --- GET /companion -----------------------------------------------------------


class Available:
    def availability(self) -> Availability:
        return Availability(available=True)


@pytest.fixture
def companion_client() -> Generator[TestClient, None, None]:
    yield TestClient(app)
    app.dependency_overrides.pop(get_companion, None)
    app.dependency_overrides.pop(get_transcriber, None)


def ports(companion, transcriber) -> None:
    app.dependency_overrides[get_companion] = lambda: companion
    app.dependency_overrides[get_transcriber] = lambda: transcriber


OK = {"available": True, "reason": None}
LLM_ONLY = ("review", "ideas", "reply", "intention", "scope", "resources")


def test_everything_available(companion_client: TestClient):
    ports(Available(), Available())
    response = companion_client.get("/companion")
    assert response.status_code == 200
    assert response.json() == {"dictation": OK, **{a: OK for a in LLM_ONLY}}


def test_without_key_nothing_is_available(companion_client: TestClient):
    ports(Unavailable(NO_API_KEY), Available())
    off = {"available": False, "reason": NO_API_KEY}
    assert companion_client.get("/companion").json() == {
        "dictation": off,
        **{a: off for a in LLM_ONLY},
    }


def test_without_transcription_only_dictation_is_off(companion_client: TestClient):
    ports(Available(), Unavailable(NOT_INSTALLED))
    assert companion_client.get("/companion").json() == {
        "dictation": {"available": False, "reason": NOT_INSTALLED},
        **{a: OK for a in LLM_ONLY},
    }


def test_dictation_says_every_missing_port(companion_client: TestClient):
    ports(Unavailable(NO_API_KEY), Unavailable(NOT_INSTALLED))
    dictation = companion_client.get("/companion").json()["dictation"]
    assert dictation == {
        "available": False,
        "reason": f"{NOT_INSTALLED} {NO_API_KEY}",
    }


# --- Journal des appels -------------------------------------------------------


def test_log_call_appends_one_json_line_per_call(tmp_path: Path):
    path = tmp_path / "logs" / "llm_calls.jsonl"  # dossier créé au besoin
    at = datetime(2026, 10, 29, 9, 30, tzinfo=UTC)
    common = {
        "prompt_version": "v1",
        "model": "claude-haiku-5-5",
        "input_tokens": 120,
        "output_tokens": 45,
        "latency_ms": 830,
        "at": at,
    }
    log_call(path, usage="dictation", context={"notes": "Énoncé « brut »"}, **common)
    log_call(path, usage="review", context="deuxième", **common)

    lines = path.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 2
    first = json.loads(lines[0])
    assert first == {
        "at": "2026-10-29T09:30:00+00:00",
        "usage": "dictation",
        "via": "api",
        "prompt_version": "v1",
        "model": "claude-haiku-5-5",
        "input_tokens": 120,
        "uncached_input_tokens": 120,
        "cache_read_tokens": 0,
        "cache_write_tokens": 0,
        "output_tokens": 45,
        "web_searches": 0,
        "cost_usd": (120 * 0.10 + 45 * 0.50) / 1_000_000,
        "latency_ms": 830,
        "context": {"notes": "Énoncé « brut »"},
    }
    assert "Énoncé" in lines[0]  # lisible tel quel, pas échappé
    assert json.loads(lines[1])["usage"] == "review"


def test_the_cost_counts_cache_and_searches_apart():
    cost = call_cost(
        "claude-opus-5-5",
        input_tokens=1_000_000,
        cache_read_tokens=1_000_000,
        cache_write_tokens=1_000_000,
        output_tokens=1_000_000,
        web_searches=6,
    )
    assert cost == pytest.approx(4.00 + 0.20 + 5.00 + 20.00 + 0.06)
    assert (
        call_cost(
            "inconnu",
            input_tokens=1,
            cache_read_tokens=0,
            cache_write_tokens=0,
            output_tokens=1,
        )
        is None
    )
