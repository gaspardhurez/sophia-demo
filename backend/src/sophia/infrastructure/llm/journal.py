"""Le journal des appels au LLM : une ligne JSON par appel, dans un fichier.

Pas de table : on le lit pour comprendre un résultat, suivre le coût et la
latence, et y puiser des cas d'éval. Chaque ligne porte ses jetons — l'entrée
hors cache, lue en cache, écrite en cache, la sortie — et son **coût** en
dollars (`domain/llm_cost.py`) ; `scripts/llm_costs.py` en fait le bilan. Il
porte le **contexte exact** envoyé — ce qui est parti, et rien d'autre — donc
des notes perso : le fichier est hors git (`SOPHIA_LLM_LOG_PATH`, défaut
`backend/llm_calls.jsonl`).

Chaque ligne dit **par où** l'appel est passé (`via`) : `api` (la clé,
facturé), ou `subscription` (Claude Code sur l'abonnement de l'utilisateur :
non facturé, `cost_usd` à 0, et `estimated_cost_usd` l'estimation de Claude
Code). Un appel par l'abonnement qui échoue s'y écrit aussi, avec son motif
(`failure`), avant l'appel de l'API qui prend le relais.
"""

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sophia.domain.llm_cost import call_cost


def log_call(
    path: Path,
    *,
    usage: str,
    prompt_version: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    latency_ms: int,
    context: Any,
    cache_read_tokens: int = 0,
    cache_write_tokens: int = 0,
    web_searches: int = 0,
    via: str = "api",
    estimated_cost_usd: float | None = None,
    failure: str | None = None,
    at: datetime | None = None,
) -> None:
    """Ajoute la ligne de l'appel en fin de fichier, créé au besoin.

    `usage` : `dictation`, `review`, `ideas`, `reply`, `intention`, `scope`
    ou `resources` ; `context` : ce qui a été envoyé, sérialisable en JSON
    (pour `resources`, avec le nombre de recherches et les URL trouvées).
    `input_tokens` : l'entrée hors cache ; la ligne garde aussi, sous
    `input_tokens`, le total des trois (ce qu'elle portait avant le 30/10).
    `via` : `api` ou `subscription` — par l'abonnement, `cost_usd` vaut 0 et
    `estimated_cost_usd` porte l'estimation de Claude Code. `failure` : le
    motif d'un appel qui n'a pas abouti.
    """
    cost = (
        call_cost(
            model,
            input_tokens=input_tokens,
            cache_read_tokens=cache_read_tokens,
            cache_write_tokens=cache_write_tokens,
            output_tokens=output_tokens,
            web_searches=web_searches,
        )
        if via == "api"
        else 0.0
    )
    entry = {
        "at": (at or datetime.now(UTC)).isoformat(),
        "usage": usage,
        "via": via,
        "prompt_version": prompt_version,
        "model": model,
        "input_tokens": input_tokens + cache_read_tokens + cache_write_tokens,
        "uncached_input_tokens": input_tokens,
        "cache_read_tokens": cache_read_tokens,
        "cache_write_tokens": cache_write_tokens,
        "output_tokens": output_tokens,
        "web_searches": web_searches,
        "cost_usd": cost,
        "latency_ms": latency_ms,
        "context": context,
    }
    if estimated_cost_usd is not None:
        entry["estimated_cost_usd"] = estimated_cost_usd
    if failure is not None:
        entry["failure"] = failure
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as out:
        out.write(json.dumps(entry, ensure_ascii=False) + "\n")
