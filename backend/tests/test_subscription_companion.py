"""Le compagnon sur l'abonnement (Claude Code en mode headless), son pool de
processus préchauffés, son repli sur l'API, et le choix par le réglage.

Aucun appel réel : `claude` est un **faux binaire** (un script Python écrit
dans le dossier du test) qui lit sa ligne stream-json, note ce qu'il a reçu
et rend des événements stream-json selon le scénario de son environnement.
"""

import json
import os
import stat
import sys
from pathlib import Path

import pytest

from sophia.application.companion import (
    Availability,
    CompanionFailed,
    DictationContext,
    IdeasContext,
    ResourcesContext,
    ResourceSearch,
    SkillFrame,
)
from sophia.infrastructure import llm
from sophia.infrastructure.config import Settings
from sophia.infrastructure.llm import NO_API_KEY, NO_BACKEND, build_companion
from sophia.infrastructure.llm.anthropic_companion import (
    DICTATION_FAILED,
    IDEAS_FAILED,
    RESOURCES_FAILED,
    AnthropicCompanion,
)
from sophia.infrastructure.llm.fallback import FallbackCompanion
from sophia.infrastructure.llm.outputs import _Bullets
from sophia.infrastructure.llm.prompt import load_prompt
from sophia.infrastructure.llm.subscription import SubscriptionCompanion
from sophia.infrastructure.llm.subscription.cli import (
    CLI_MISSING,
    DIED,
    LIMIT_REACHED,
    SEARCH_UNREADABLE,
    TIMEOUT,
    UNREADABLE,
    CliFailed,
    read_events,
    subprocess_env,
)
from sophia.infrastructure.llm.subscription.pool import WarmPool
from sophia.infrastructure.unavailable import Unavailable

FAKE_CLAUDE = """\
import json, os, sys, time

scenario = os.environ.get("FAKE_CLAUDE_SCENARIO", "ok")
line = sys.stdin.readline()
with open(os.environ["FAKE_CLAUDE_RECORD"], "a", encoding="utf-8") as f:
    f.write(json.dumps({
        "argv": sys.argv[1:],
        "has_key": "ANTHROPIC_API_KEY" in os.environ,
        "cwd": os.getcwd(),
        "stdin": line,
    }) + "\\n")

def emit(event):
    print(json.dumps(event), flush=True)

emit({"type": "system", "subtype": "init", "apiKeySource": "none"})
if scenario == "die":
    sys.exit(1)
if scenario == "slow":
    time.sleep(30)
if scenario == "limit":
    emit({"type": "rate_limit_event", "rate_limit_info": {"status": "rejected"}})
    emit({"type": "result", "subtype": "success", "is_error": True,
          "result": "Claude AI usage limit reached"})
    sys.exit(1)
if scenario == "error":
    emit({"type": "result", "subtype": "error_during_execution",
          "is_error": True, "result": "boom"})
    sys.exit(1)
if scenario in ("search", "search-unreadable"):
    emit({"type": "assistant", "message": {"content": [
        {"type": "tool_use", "id": "t1", "name": "WebSearch",
         "input": {"query": "itertools"}}]}})
    result = (
        {"query": "itertools", "results": [
            {"tool_use_id": "s1", "content": [
                {"title": "Doc", "url": "https://docs.python.org/3/library/itertools.html"},
                {"title": "Real", "url": "https://realpython.com/python-itertools/"},
            ]},
            "Un résumé de la recherche.",
        ]}
        if scenario == "search" else "Erreur"
    )
    emit({"type": "user", "message": {"content": [
        {"type": "tool_result", "tool_use_id": "t1", "content": "..."}]},
        "tool_use_result": result})
output = json.loads(os.environ.get("FAKE_CLAUDE_OUTPUT", "{}"))
event = {"type": "result", "subtype": "success", "is_error": False,
         "result": json.dumps(output), "total_cost_usd": 0.0123,
         "usage": {"input_tokens": 2, "cache_read_input_tokens": 0,
                   "cache_creation_input_tokens": 0, "output_tokens": 5},
         "modelUsage": {
             "claude-haiku-5-5": {"inputTokens": 3, "outputTokens": 40,
                                  "cacheReadInputTokens": 100,
                                  "cacheCreationInputTokens": 7,
                                  "webSearchRequests": 0},
             "claude-opus-5-5": {"inputTokens": 1, "outputTokens": 10,
                                 "cacheReadInputTokens": 0,
                                 "cacheCreationInputTokens": 0,
                                 "webSearchRequests": 1 if scenario == "search" else 0},
         }}
if scenario != "garbage":
    event["structured_output"] = output
emit(event)
"""


@pytest.fixture
def fake_claude(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "bin" / "claude"
    path.parent.mkdir()
    path.write_text(f"#!{sys.executable}\n{FAKE_CLAUDE}", encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR)
    monkeypatch.setenv("FAKE_CLAUDE_RECORD", str(tmp_path / "record.jsonl"))
    return path


def scenario(monkeypatch: pytest.MonkeyPatch, name: str, output=None) -> None:
    monkeypatch.setenv("FAKE_CLAUDE_SCENARIO", name)
    monkeypatch.setenv("FAKE_CLAUDE_OUTPUT", json.dumps(output or {}))


def records(tmp_path: Path) -> list[dict]:
    path = tmp_path / "record.jsonl"
    return [json.loads(line) for line in path.read_text().splitlines()]


def journal(tmp_path: Path) -> list[dict]:
    path = tmp_path / "calls.jsonl"
    return [json.loads(line) for line in path.read_text().splitlines()]


@pytest.fixture
def companion(fake_claude: Path, tmp_path: Path):
    c = SubscriptionCompanion(
        claude_bin=str(fake_claude),
        model_dictation="claude-haiku-5-5",
        model_review="claude-opus-5-5",
        log_path=tmp_path / "calls.jsonl",
        timeout_s=10,
        workdir=tmp_path / "neutral",
    )
    yield c
    c.close()


DICTATION = DictationContext(
    skill="Python",
    resource=None,
    resource_part=None,
    note_titles=("Bytecode",),
    transcript="euh le bytecode",
)
IDEAS = IdeasContext(
    skill_title="Python",
    intention=None,
    scope=None,
    section_title=None,
    section_text="Le GIL.",
)
RESOURCES = ResourcesContext(
    frame=SkillFrame(skill_title="itertools", skill_description=None, domain="Py"),
    preferences=None,
)


def option(argv: list[str], name: str) -> str:
    return argv[argv.index(name) + 1]


# --- Un appel ----------------------------------------------------------------


def test_dictation_through_the_subscription(
    companion, tmp_path, monkeypatch: pytest.MonkeyPatch
):
    # La clé est dans l'environnement du serveur : pas dans celui du CLI.
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ne-doit-pas-passer")
    scenario(monkeypatch, "ok", {"bullets": ["Le bytecode."]})

    assert companion.clean_dictation(DICTATION) == ["Le bytecode."]

    (call,) = records(tmp_path)
    argv = call["argv"]
    assert call["has_key"] is False
    assert Path(call["cwd"]).resolve() == (tmp_path / "neutral").resolve()
    assert "-p" in argv and "--bare" not in argv
    assert option(argv, "--input-format") == "stream-json"
    assert option(argv, "--output-format") == "stream-json"
    assert option(argv, "--model") == "claude-haiku-5-5"
    assert option(argv, "--effort") == "low"
    assert option(argv, "--tools") == ""
    assert option(argv, "--setting-sources") == ""
    assert option(argv, "--system-prompt") == load_prompt("dictation").text
    assert json.loads(option(argv, "--json-schema")) == _Bullets.model_json_schema()
    assert {"--strict-mcp-config", "--no-session-persistence"} <= set(argv)
    message = json.loads(call["stdin"])
    assert message["type"] == "user"
    assert (
        "<transcription>\neuh le bytecode\n</transcription>"
        in (message["message"]["content"])
    )

    (line,) = journal(tmp_path)
    assert line["via"] == "subscription"
    assert line["usage"] == "dictation"
    assert line["prompt_version"] == load_prompt("dictation").version
    assert line["model"] == "claude-haiku-5-5"
    assert line["cost_usd"] == 0.0  # non facturé
    assert line["estimated_cost_usd"] == 0.0123
    # Tous les modèles appelés comptent.
    assert line["uncached_input_tokens"] == 4
    assert line["cache_read_tokens"] == 100
    assert line["output_tokens"] == 50
    assert line["context"]["transcript"] == "euh le bytecode"
    assert "failure" not in line


def test_the_judge_uses_its_model_effort_and_prompt(
    companion, tmp_path, monkeypatch: pytest.MonkeyPatch
):
    scenario(
        monkeypatch,
        "ok",
        {"ideas": [{"idea": "Le GIL", "reason": "r", "angle": "a", "quote": None}]},
    )
    (idea,) = companion.central_ideas(IDEAS)
    assert idea.idea == "Le GIL"
    assert idea.prompt_version == load_prompt("central_ideas").version
    assert idea.model == "claude-opus-5-5"
    argv = records(tmp_path)[0]["argv"]
    assert option(argv, "--model") == "claude-opus-5-5"
    assert option(argv, "--effort") == "medium"
    assert option(argv, "--system-prompt") == load_prompt("central_ideas").text
    assert journal(tmp_path)[0]["usage"] == "ideas"


@pytest.mark.parametrize(
    ("name", "output", "motif", "reason"),
    [
        ("error", None, None, DICTATION_FAILED),
        ("limit", None, LIMIT_REACHED, LIMIT_REACHED),
        ("die", None, DIED, DICTATION_FAILED),
        ("garbage", {"bullets": []}, UNREADABLE, DICTATION_FAILED),
        ("ok", {"autre": 1}, UNREADABLE, DICTATION_FAILED),  # hors schéma
    ],
)
def test_a_failed_call_is_logged_with_its_motif(
    companion, tmp_path, monkeypatch, name, output, motif, reason
):
    scenario(monkeypatch, name, output)
    with pytest.raises(CompanionFailed) as raised:
        companion.clean_dictation(DICTATION)
    # La limite d'usage se dit telle quelle ; le reste, comme par l'API.
    assert raised.value.reason == reason
    (line,) = journal(tmp_path)
    assert line["via"] == "subscription"
    assert line["failure"].startswith(motif or "Claude Code a rendu une erreur")


def test_a_call_past_its_deadline_is_killed(
    fake_claude, tmp_path, monkeypatch: pytest.MonkeyPatch
):
    scenario(monkeypatch, "slow")
    c = SubscriptionCompanion(
        claude_bin=str(fake_claude),
        model_dictation="claude-haiku-5-5",
        model_review="claude-opus-5-5",
        log_path=tmp_path / "calls.jsonl",
        timeout_s=1,
        workdir=tmp_path / "neutral",
    )
    with pytest.raises(CompanionFailed):
        c.clean_dictation(DICTATION)
    c.close()
    assert journal(tmp_path)[0]["failure"] == TIMEOUT


def test_a_missing_cli_fails_with_its_motif(tmp_path):
    c = SubscriptionCompanion(
        claude_bin=str(tmp_path / "absent"),
        model_dictation="m",
        model_review="m",
        log_path=tmp_path / "calls.jsonl",
        timeout_s=1,
        workdir=tmp_path / "neutral",
    )
    with pytest.raises(CompanionFailed):
        c.clean_dictation(DICTATION)
    assert journal(tmp_path)[0]["failure"] == CLI_MISSING


# --- La recherche de ressources -------------------------------------------------


RESOURCE = {
    "title": "itertools",
    "url": "https://docs.python.org/3/library/itertools.html",
    "author": None,
    "why_trust": "documentation officielle",
    "kind": "text",
    "duration": None,
    "date": None,
    "covers": None,
}


def test_resources_keep_the_urls_of_the_search_results(
    companion, tmp_path, monkeypatch: pytest.MonkeyPatch
):
    scenario(monkeypatch, "search", {"resources": [RESOURCE]})

    search = companion.search_resources(RESOURCES)

    assert isinstance(search, ResourceSearch)
    assert [p.url for p in search.proposals] == [RESOURCE["url"]]
    assert search.found_urls == (
        "https://docs.python.org/3/library/itertools.html",
        "https://realpython.com/python-itertools/",
    )
    argv = records(tmp_path)[0]["argv"]
    assert option(argv, "--tools") == "WebSearch,WebFetch"
    assert option(argv, "--allowedTools") == "WebSearch,WebFetch"
    assert option(argv, "--system-prompt").startswith(
        load_prompt("framing_resources").text
    )
    assert load_prompt("subscription_resources").text in option(argv, "--system-prompt")
    (line,) = journal(tmp_path)
    assert line["usage"] == "resources"
    assert line["prompt_version"] == "framing_resources-4+subscription_resources-1"
    # Le modèle demandé, pas celui qui a lu les résultats de la recherche.
    assert line["model"] == "claude-opus-5-5"
    assert line["web_searches"] == 1
    assert line["context"]["found"] == list(search.found_urls)
    assert line["context"]["proposed"][0]["url"] == RESOURCE["url"]


def test_unreadable_search_results_fail(
    companion, tmp_path, monkeypatch: pytest.MonkeyPatch
):
    scenario(monkeypatch, "search-unreadable", {"resources": [RESOURCE]})
    with pytest.raises(CompanionFailed) as raised:
        companion.search_resources(RESOURCES)
    assert raised.value.reason == RESOURCES_FAILED
    assert journal(tmp_path)[0]["failure"] == SEARCH_UNREADABLE


# --- Lecture des événements ------------------------------------------------------


def test_events_without_a_result_mean_a_dead_process():
    with pytest.raises(CliFailed) as raised:
        read_events(['{"type": "system"}', "pas du json", ""])
    assert raised.value.motif == DIED


def test_a_rejected_rate_limit_without_a_result_is_the_limit():
    event = {"type": "rate_limit_event", "rate_limit_info": {"status": "rejected"}}
    with pytest.raises(CliFailed) as raised:
        read_events([json.dumps(event)])
    assert raised.value.limit


def test_the_cli_environment_has_no_api_key(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    env = subprocess_env()
    assert "ANTHROPIC_API_KEY" not in env
    assert env["PATH"] == os.environ["PATH"]


# --- Le pool de processus préchauffés --------------------------------------------


class FakeProc:
    def __init__(self, n: int) -> None:
        self.n = n
        self.alive = True

    def poll(self):
        return None if self.alive else 1

    def kill(self) -> None:
        self.alive = False

    def communicate(self, timeout=None):
        return "", ""


def test_the_pool_prepares_the_next_process_during_a_call():
    spawned: list[FakeProc] = []

    def spawn(config):
        spawned.append(FakeProc(len(spawned)))
        return spawned[-1]

    pool = WarmPool(spawn)
    first = pool.take("a")
    assert first.n == 0 and pool.ready() == 1  # le suivant est déjà lancé
    second = pool.take("a")
    assert second.n == 1  # le préchauffé, pas un neuf
    assert pool.take("b").n == 3  # une autre configuration : le sien
    assert pool.ready() == 2

    spawned[2].alive = False  # le prêt de « a »… mort entre-temps
    third = pool.take("a")
    assert third.n == 5 and third.alive  # remplacé à froid
    pool.close()
    assert pool.ready() == 0
    assert not spawned[6].alive and not spawned[4].alive  # les prêts, tués
    assert third.alive  # celui d'un appel en cours, non


def test_a_prewarmed_process_serves_the_next_call(
    companion, tmp_path, monkeypatch: pytest.MonkeyPatch
):
    scenario(monkeypatch, "ok", {"bullets": ["a"]})
    companion.clean_dictation(DICTATION)
    assert companion.pool.ready() == 1
    companion.clean_dictation(DICTATION)
    assert len(records(tmp_path)) == 2  # un processus par appel
    companion.close()
    assert companion.pool.ready() == 0


# --- Le repli -------------------------------------------------------------------


class Stub:
    def __init__(self, result=None, *, fails: str | None = None) -> None:
        self.result = result
        self.fails = fails
        self.calls = 0

    def availability(self) -> Availability:
        return Availability(available=True)

    def central_ideas(self, ctx):
        self.calls += 1
        if self.fails:
            raise CompanionFailed(self.fails)
        return self.result


def test_the_api_takes_over_when_the_subscription_fails():
    primary, api = Stub(fails=LIMIT_REACHED), Stub(["par l'API"])
    assert FallbackCompanion(primary, api).central_ideas(IDEAS) == ["par l'API"]
    assert (primary.calls, api.calls) == (1, 1)


def test_the_api_is_not_called_when_the_subscription_answers():
    primary, api = Stub(["par l'abonnement"]), Stub(["par l'API"])
    assert FallbackCompanion(primary, api).central_ideas(IDEAS) == ["par l'abonnement"]
    assert api.calls == 0


def test_without_the_api_the_failure_keeps_its_motif():
    with pytest.raises(CompanionFailed) as raised:
        FallbackCompanion(Stub(fails=LIMIT_REACHED), None).central_ideas(IDEAS)
    assert raised.value.reason == LIMIT_REACHED


def test_a_failure_with_the_api_too_says_the_api_motif():
    fallback = FallbackCompanion(Stub(fails=LIMIT_REACHED), Stub(fails=IDEAS_FAILED))
    with pytest.raises(CompanionFailed) as raised:
        fallback.central_ideas(IDEAS)
    assert raised.value.reason == IDEAS_FAILED


# --- Le choix par le réglage -------------------------------------------------------


def settings(**values) -> Settings:
    return Settings(_env_file=None, **values)


@pytest.fixture
def cli_found(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(llm.shutil, "which", lambda name: f"/opt/{name}")


@pytest.fixture
def cli_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(llm.shutil, "which", lambda name: None)


@pytest.fixture(autouse=True)
def no_key_in_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)


def test_the_api_by_default(cli_found):
    assert isinstance(
        build_companion(settings(ANTHROPIC_API_KEY="sk-test")), AnthropicCompanion
    )
    assert build_companion(settings()).availability() == Availability(False, NO_API_KEY)


def test_the_subscription_with_the_api_behind(cli_found):
    companion = build_companion(
        settings(llm_backend="subscription", ANTHROPIC_API_KEY="sk-test")
    )
    assert isinstance(companion, FallbackCompanion)
    assert isinstance(companion.primary, SubscriptionCompanion)
    assert companion.primary.claude_bin == "/opt/claude"
    assert isinstance(companion.secondary, AnthropicCompanion)
    assert companion.availability().available
    assert companion.primary.pool.ready() == 0  # rien lancé d'avance


def test_the_subscription_alone_without_a_key(cli_found):
    companion = build_companion(settings(llm_backend="subscription"))
    assert isinstance(companion, FallbackCompanion)
    assert companion.secondary is None
    assert companion.availability().available


def test_without_the_cli_the_api_alone(cli_missing):
    companion = build_companion(
        settings(llm_backend="subscription", ANTHROPIC_API_KEY="sk-test")
    )
    assert isinstance(companion, AnthropicCompanion)


def test_without_the_cli_nor_a_key_nothing(cli_missing):
    companion = build_companion(settings(llm_backend="subscription"))
    assert isinstance(companion, Unavailable)
    assert companion.availability() == Availability(False, NO_BACKEND)


def test_the_backend_is_read_from_the_environment(
    cli_found, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setenv("SOPHIA_LLM_BACKEND", "subscription")
    monkeypatch.setenv("SOPHIA_CLAUDE_BIN", "/chemin/claude")
    loaded = settings()
    assert loaded.llm_backend == "subscription"
    assert loaded.claude_bin == "/chemin/claude"
