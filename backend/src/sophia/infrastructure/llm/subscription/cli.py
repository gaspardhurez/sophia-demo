"""Un appel à Claude Code en mode headless (`claude -p`), sur l'abonnement.

Un processus = une conversation = **un appel** : on le lance avec ses
options (modèle, effort, prompt système, schéma de sortie, outils), on écrit
le message de l'utilisateur en une ligne stream-json sur son entrée, on la
ferme, puis on lit sa sortie stream-json jusqu'à l'événement `result`. Le
lancement se fait d'avance (`pool.py`) : la latence est alors celle du
modèle (~0,1 s de plus, mesuré le 30/10/2026).

Allégé : aucun outil hors ceux demandés, aucun MCP, aucun réglage lu, aucune
commande, aucune session gardée — ~650 jetons de contexte Claude Code au lieu
de ~25 600. Lancé dans un dossier **neutre** (pas le repo : Claude Code y
chargerait CLAUDE.md et la mémoire du projet), **sans** `ANTHROPIC_API_KEY`
dans son environnement (sinon il la prend et facture l'API). Jamais `--bare` :
il ignore l'authentification de l'abonnement.
"""

import json
import os
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

#: Le dossier de travail par défaut des processus : vide, hors du repo.
DEFAULT_WORKDIR = Path(tempfile.gettempdir()) / "sophia-claude"

# Les motifs d'échec, au journal et — sans API pour prendre le relais — à
# l'écran.
CLI_MISSING = "Claude Code (claude) introuvable."
TIMEOUT = "Claude Code n'a pas répondu à temps."
DIED = "Claude Code s'est arrêté sans rendre de résultat."
LIMIT_REACHED = "Limite d'usage de l'abonnement Claude atteinte."
UNREADABLE = "La sortie de Claude Code est illisible."
SEARCH_UNREADABLE = "Les résultats de recherche de Claude Code sont illisibles."
ERROR = "Claude Code a rendu une erreur"


class CliFailed(Exception):
    """L'appel n'a pas rendu de résultat exploitable ; `motif` en français."""

    def __init__(self, motif: str, *, limit: bool = False) -> None:
        super().__init__(motif)
        self.motif = motif
        # La limite d'usage de l'abonnement : un motif à montrer tel quel.
        self.limit = limit


@dataclass(frozen=True)
class CliConfig:
    """Ce qui fixe un processus : deux appels de même configuration peuvent
    prendre le même processus préchauffé."""

    model: str
    effort: str
    system_prompt: str
    # Le schéma JSON de la sortie structurée (`--json-schema`), sérialisé.
    json_schema: str
    # Les outils de Claude Code permis (ex. `WebSearch`) ; aucun par défaut.
    tools: tuple[str, ...] = ()


@dataclass
class CliResult:
    """Ce qu'un appel rend : la sortie structurée, ses jetons (tous modèles
    confondus — la recherche de Claude Code en appelle un second), le coût
    **estimé** par Claude Code (non facturé), et les URL des résultats de
    `WebSearch`."""

    structured: Any
    model: str
    input_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    output_tokens: int = 0
    web_searches: int = 0
    estimated_cost_usd: float | None = None
    search_urls: list[str] = field(default_factory=list)


def argv(binary: str, config: CliConfig) -> list[str]:
    tools = ",".join(config.tools)
    args = [
        binary,
        "-p",
        "--input-format",
        "stream-json",
        "--output-format",
        "stream-json",
        "--verbose",
        "--model",
        config.model,
        "--effort",
        config.effort,
        "--system-prompt",
        config.system_prompt,
        "--json-schema",
        config.json_schema,
        "--tools",
        tools,
        "--strict-mcp-config",
        "--setting-sources",
        "",
        "--disable-slash-commands",
        "--no-session-persistence",
        # Personne pour répondre à une demande de permission : refusée.
        "--permission-prompts",
        "none",
    ]
    if tools:
        args += ["--allowedTools", tools]
    return args


def subprocess_env() -> dict[str, str]:
    """L'environnement du processus : le nôtre, **sans la clé de l'API** —
    présente, Claude Code la prendrait et facturerait l'API."""
    return {k: v for k, v in os.environ.items() if k != "ANTHROPIC_API_KEY"}


def spawn(binary: str, config: CliConfig, workdir: Path) -> subprocess.Popen:
    """Lance le processus, prêt à recevoir son message. `stdin` toujours
    fourni (sans lui, `claude -p` attend 3 s), `stderr` à part."""
    workdir.mkdir(parents=True, exist_ok=True)
    try:
        return subprocess.Popen(
            argv(binary, config),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            cwd=workdir,
            env=subprocess_env(),
        )
    except OSError as exc:
        raise CliFailed(CLI_MISSING) from exc


def user_line(message: str) -> str:
    return (
        json.dumps(
            {"type": "user", "message": {"role": "user", "content": message}},
            ensure_ascii=False,
        )
        + "\n"
    )


def ask(
    proc: subprocess.Popen, message: str, *, timeout: float, model: str = ""
) -> CliResult:
    """Envoie le message au processus, attend son résultat. Tout échec lève
    `CliFailed` ; le processus est tué s'il dépasse le délai."""
    try:
        out, _ = proc.communicate(user_line(message), timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        proc.kill()
        proc.communicate()
        raise CliFailed(TIMEOUT) from exc
    except (BrokenPipeError, ValueError) as exc:  # mort avant d'avoir lu
        raise CliFailed(DIED) from exc
    return read_events(out.splitlines(), model=model)


def _search_urls(event: dict, search_ids: set[str]) -> list[str] | None:
    """Les URL d'un résultat de `WebSearch` (`tool_use_result.results[]
    .content[].url`), ou `None` si l'événement n'en est pas un."""
    content = event.get("message", {}).get("content")
    if not isinstance(content, list):
        return None
    ids = {c.get("tool_use_id") for c in content if isinstance(c, dict)}
    if not ids & search_ids:
        return None
    result = event.get("tool_use_result")
    if not isinstance(result, dict) or not isinstance(result.get("results"), list):
        return []  # une recherche sans résultats lisibles
    urls = []
    for item in result["results"]:
        if isinstance(item, dict) and isinstance(item.get("content"), list):
            urls += [
                r["url"]
                for r in item["content"]
                if isinstance(r, dict) and isinstance(r.get("url"), str)
            ]
    return urls


def read_events(lines: list[str], *, model: str = "") -> CliResult:
    """Lit la sortie stream-json d'un appel : les recherches faites et leurs
    résultats, la limite d'usage, puis l'événement `result`."""
    search_ids: set[str] = set()
    urls: list[str] = []
    unreadable_searches = 0
    limited = False
    result: dict | None = None
    for line in lines:
        if not line.strip():
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue  # une ligne de diagnostic, pas un événement
        kind = event.get("type")
        if kind == "assistant":
            for block in event.get("message", {}).get("content") or []:
                if block.get("type") == "tool_use" and block.get("name") == "WebSearch":
                    search_ids.add(block.get("id"))
        elif kind == "user":
            found = _search_urls(event, search_ids)
            if found == []:
                unreadable_searches += 1
            urls += found or []
        elif kind == "rate_limit_event":
            status = (event.get("rate_limit_info") or {}).get("status")
            limited = limited or status == "rejected"
        elif kind == "result":
            result = event
    if result is None:
        raise CliFailed(LIMIT_REACHED if limited else DIED, limit=limited)
    if result.get("is_error") or result.get("subtype") != "success":
        text = str(result.get("result") or result.get("subtype") or "")
        if limited or result.get("api_error_status") == 429 or "limit" in text.lower():
            raise CliFailed(LIMIT_REACHED, limit=True)
        raise CliFailed(f"{ERROR} : {text[:200]}")
    if search_ids and not urls and unreadable_searches:
        raise CliFailed(SEARCH_UNREADABLE)
    structured = result.get("structured_output")
    if structured is None:
        raise CliFailed(UNREADABLE)
    out = _with_usage(CliResult(structured=structured, model=model), result, urls)
    # Une recherche que `modelUsage` ne compterait pas se compte à son appel.
    out.web_searches = out.web_searches or len(search_ids)
    return out


def _with_usage(out: CliResult, result: dict, urls: list[str]) -> CliResult:
    """Les jetons de tous les modèles appelés (`modelUsage` : la recherche
    de Claude Code en appelle un second, plus petit, qui lit les résultats).
    Le modèle noté est celui demandé ; absent de `modelUsage` (un alias),
    celui qui a le plus écrit."""
    per_model: dict = result.get("modelUsage") or {}
    for usage in per_model.values():
        out.input_tokens += usage.get("inputTokens", 0)
        out.cache_read_tokens += usage.get("cacheReadInputTokens", 0)
        out.cache_write_tokens += usage.get("cacheCreationInputTokens", 0)
        out.output_tokens += usage.get("outputTokens", 0)
        out.web_searches += usage.get("webSearchRequests", 0)
    if per_model:
        if out.model not in per_model:
            out.model = max(
                per_model, key=lambda m: per_model[m].get("outputTokens", 0)
            )
    else:
        usage = result.get("usage") or {}
        out.input_tokens = usage.get("input_tokens", 0)
        out.cache_read_tokens = usage.get("cache_read_input_tokens") or 0
        out.cache_write_tokens = usage.get("cache_creation_input_tokens") or 0
        out.output_tokens = usage.get("output_tokens", 0)
    out.estimated_cost_usd = result.get("total_cost_usd")
    out.search_urls = urls
    return out
