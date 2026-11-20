"""Le compagnon sur l'abonnement Claude de l'utilisateur, par Claude Code.

Mêmes usages que l'adaptateur de l'API (`anthropic_companion.py`), avec les
**mêmes prompts** (`--system-prompt`), le **même contexte XML** (message de
l'utilisateur), le même modèle et le même effort par usage, la même sortie
structurée (le schéma du modèle Pydantic, `--json-schema`, puis validée ici)
et la même traduction en valeurs du port : les garde-fous de l'application
s'appliquent ensuite tels quels.

La recherche de ressources y passe aussi, avec les outils `WebSearch` et
`WebFetch` de Claude Code et un complément au prompt
(`prompts/subscription_resources.md` : les noms des outils, six recherches au
plus, la liste rendue en sortie structurée). Le garde-fou « liens tirés des
seuls résultats » tient : les URL viennent des résultats de `WebSearch` lus
dans les événements stream-json.

Chaque appel s'écrit au journal (`via: subscription`, non facturé, coût
estimé par Claude Code). Un échec — limite d'usage, délai, processus mort,
erreur, sortie illisible — s'y écrit avec son motif, puis lève
`CompanionFailed` : `FallbackCompanion` (`fallback.py`) passe alors la main
à l'API.
"""

import json
import time
from collections.abc import Callable
from dataclasses import asdict
from pathlib import Path
from typing import Any

import pydantic
from pydantic import BaseModel

from sophia.application.companion import (
    Availability,
    CentralIdea,
    CompanionFailed,
    DictationContext,
    IdeasContext,
    IntentionContext,
    ReplyContext,
    ResourcesContext,
    ResourceSearch,
    ReviewContext,
    ReviewFinding,
    ScopeContext,
)
from sophia.domain.framing import IntentionTurn, ScopeTag
from sophia.infrastructure.llm.anthropic_companion import (
    DICTATION_FAILED,
    IDEAS_FAILED,
    INTENTION_FAILED,
    REPLY_FAILED,
    RESOURCES_FAILED,
    REVIEW_FAILED,
    SCOPE_FAILED,
)
from sophia.infrastructure.llm.context import (
    dictation_message,
    ideas_xml,
    intention_xml,
    reply_xml,
    resources_xml,
    review_xml,
    scope_xml,
)
from sophia.infrastructure.llm.journal import log_call
from sophia.infrastructure.llm.outputs import (
    _Bullets,
    _Ideas,
    _IntentionTurn,
    _Reply,
    _Resources,
    _Review,
    _Scope,
    to_findings,
    to_ideas,
    to_intention_turn,
    to_resources,
    to_scope,
)
from sophia.infrastructure.llm.prompt import load_prompt
from sophia.infrastructure.llm.subscription.cli import (
    DEFAULT_WORKDIR,
    UNREADABLE,
    CliConfig,
    CliFailed,
    CliResult,
    ask,
    spawn,
)
from sophia.infrastructure.llm.subscription.pool import WarmPool

#: Les outils de la recherche de ressources.
SEARCH_TOOLS = ("WebSearch", "WebFetch")
#: La recherche cherche, lit, trie : elle a le triple du délai d'un appel.
SEARCH_TIMEOUT_FACTOR = 3


class SubscriptionCompanion:
    def __init__(
        self,
        *,
        claude_bin: str,
        model_dictation: str,
        model_review: str,
        log_path: Path,
        timeout_s: float,
        workdir: Path = DEFAULT_WORKDIR,
    ) -> None:
        self.claude_bin = claude_bin
        self.model_dictation = model_dictation
        self.model_review = model_review
        self.log_path = log_path
        self.timeout_s = timeout_s
        self.pool = WarmPool(lambda config: spawn(claude_bin, config, workdir))

    def availability(self) -> Availability:
        return Availability(available=True)

    def close(self) -> None:
        self.pool.close()

    def _call(
        self,
        *,
        usage: str,
        prompt_names: tuple[str, ...],
        failed: str,
        model: str,
        effort: str,
        output: type[BaseModel],
        message: str,
        logged: Any,
        tools: tuple[str, ...] = (),
        timeout_factor: int = 1,
        enrich: Callable[[Any, CliResult], dict] | None = None,
    ) -> tuple[Any, str, CliResult]:
        """Un appel : la sortie validée, la version du prompt, le résultat
        du CLI. Une ligne au journal, échec compris (avec son motif) ; un
        échec lève `CompanionFailed` — avec le motif de la limite d'usage,
        sinon le message de l'usage. `enrich` : ce qu'un appel réussi ajoute
        au contexte journalisé (un dict)."""
        prompts = [load_prompt(name) for name in prompt_names]
        version = "+".join(p.version for p in prompts)
        config = CliConfig(
            model=model,
            effort=effort,
            system_prompt="\n\n".join(p.text for p in prompts),
            json_schema=json.dumps(output.model_json_schema(), ensure_ascii=False),
            tools=tools,
        )
        started = time.monotonic()
        result: CliResult | None = None
        try:
            proc = self.pool.take(config)
            result = ask(
                proc, message, timeout=self.timeout_s * timeout_factor, model=model
            )
            try:
                parsed = output.model_validate(result.structured)
            except pydantic.ValidationError as exc:
                raise CliFailed(UNREADABLE) from exc
        except CliFailed as exc:
            self._log(usage, version, model, started, logged, result, failure=exc.motif)
            raise CompanionFailed(exc.motif if exc.limit else failed) from exc
        if enrich is not None:
            logged = {**logged, **enrich(parsed, result)}
        self._log(usage, version, model, started, logged, result)
        return parsed, version, result

    def _log(
        self,
        usage: str,
        version: str,
        model: str,
        started: float,
        logged: Any,
        result: CliResult | None,
        *,
        failure: str | None = None,
    ) -> None:
        r = result or CliResult(structured=None, model=model)
        log_call(
            self.log_path,
            usage=usage,
            via="subscription",
            prompt_version=version,
            model=r.model or model,
            input_tokens=r.input_tokens,
            cache_read_tokens=r.cache_read_tokens,
            cache_write_tokens=r.cache_write_tokens,
            output_tokens=r.output_tokens,
            web_searches=r.web_searches,
            estimated_cost_usd=r.estimated_cost_usd,
            latency_ms=round((time.monotonic() - started) * 1000),
            context=logged,
            failure=failure,
        )

    def clean_dictation(self, ctx: DictationContext) -> list[str]:
        parsed, _, _ = self._call(
            usage="dictation",
            prompt_names=("dictation",),
            failed=DICTATION_FAILED,
            model=self.model_dictation,
            effort="low",
            output=_Bullets,
            message=dictation_message(ctx),
            logged=asdict(ctx),
        )
        return parsed.bullets

    def _judge(self, *, prompt: str, context: str, **kw) -> tuple[Any, str, str]:
        """Un appel du modèle de jugement : la sortie, la version, le modèle
        qui a répondu."""
        parsed, version, result = self._call(
            prompt_names=(prompt,),
            model=self.model_review,
            message=context,
            logged=context,
            **kw,
        )
        return parsed, version, result.model or self.model_review

    def review_notes(self, ctx: ReviewContext) -> list[ReviewFinding]:
        parsed, version, model = self._judge(
            usage="review",
            prompt="review",
            failed=REVIEW_FAILED,
            context=review_xml(ctx),
            effort="high",
            output=_Review,
        )
        return to_findings(parsed, prompt_version=version, model=model)

    def central_ideas(self, ctx: IdeasContext) -> list[CentralIdea]:
        parsed, version, model = self._judge(
            usage="ideas",
            prompt="central_ideas",
            failed=IDEAS_FAILED,
            context=ideas_xml(ctx),
            effort="medium",
            output=_Ideas,
        )
        return to_ideas(parsed, prompt_version=version, model=model)

    def reply_in_thread(self, ctx: ReplyContext) -> str:
        parsed, _, _ = self._judge(
            usage="reply",
            prompt="reply",
            failed=REPLY_FAILED,
            context=reply_xml(ctx),
            effort="medium",
            output=_Reply,
        )
        text = parsed.reply.strip()
        if not text:
            raise CompanionFailed(REPLY_FAILED)
        return text

    def intention_turn(self, ctx: IntentionContext) -> IntentionTurn:
        parsed, _, _ = self._judge(
            usage="intention",
            prompt="framing_intention",
            failed=INTENTION_FAILED,
            context=intention_xml(ctx),
            effort="low",
            output=_IntentionTurn,
        )
        return to_intention_turn(parsed)

    def propose_scope(self, ctx: ScopeContext) -> list[ScopeTag]:
        parsed, _, _ = self._judge(
            usage="scope",
            prompt="framing_scope",
            failed=SCOPE_FAILED,
            context=scope_xml(ctx),
            effort="medium",
            output=_Scope,
        )
        return to_scope(parsed)

    def search_resources(self, ctx: ResourcesContext) -> ResourceSearch:
        context = resources_xml(ctx)
        parsed, _, result = self._call(
            usage="resources",
            prompt_names=("framing_resources", "subscription_resources"),
            failed=RESOURCES_FAILED,
            model=self.model_review,
            effort="medium",
            output=_Resources,
            message=context,
            logged={"message": context},
            tools=SEARCH_TOOLS,
            timeout_factor=SEARCH_TIMEOUT_FACTOR,
            # Comme l'API : les recherches, les liens trouvés une fois chacun,
            # les propositions telles que rendues, avant le garde-fou.
            enrich=lambda parsed, result: {
                "web_searches": result.web_searches,
                "found": list(dict.fromkeys(result.search_urls)),
                "proposed": [
                    {
                        "title": r.title,
                        "url": r.url,
                        "author": r.author,
                        "why_trust": r.why_trust,
                    }
                    for r in parsed.resources
                ],
            },
        )
        return ResourceSearch(
            proposals=to_resources(parsed), found_urls=tuple(result.search_urls)
        )
