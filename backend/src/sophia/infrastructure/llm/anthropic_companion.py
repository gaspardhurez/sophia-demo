"""Le compagnon sur l'API Claude.

Le client se crée **paresseusement**, au premier appel d'une méthode d'usage :
rien ne part sur le réseau au démarrage. La clé lui est passée explicitement —
pydantic-settings lit le `.env` sans le copier dans `os.environ`, où le SDK la
chercherait par défaut.

Chaque usage : un prompt système fixe (`prompts/`, mis en cache côté API), le
contexte variable balisé en XML dans le message utilisateur, une sortie
structurée validée par le SDK (`messages.parse` + modèle Pydantic), une ligne
au journal des appels. Jamais de `temperature` : les modèles actuels la
refusent, la profondeur se règle par l'effort.

La vérification, les idées centrales et la réponse dans un fil passent par
le repli côté serveur
(`fallbacks="default"`, API bêta) : si le modèle demandé décline, la requête
est rejouée sur un autre ; c'est le modèle qui a répondu qu'on note. Les
trois temps de « Cadrer l'étude » aussi ; la recherche de ressources, elle,
passe par les outils serveur de recherche web et rend ses propositions par
un outil strict (`propose_resources`) plutôt qu'en sortie structurée.
"""

import time
from dataclasses import asdict
from pathlib import Path

import anthropic
import pydantic
from pydantic import SecretStr

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
from sophia.domain.framing import IntentionTurn, ResourceProposal, ScopeTag
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
    _Finding,
    _Ideas,
    _IntentionTurn,
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

# Réexportés : les tests les prennent ici.
__all__ = ["_Bullets", "_Finding", "_Review", "dictation_message"]

DICTATION_FAILED = "Le nettoyage de la dictée n'a pas abouti."
REVIEW_FAILED = "La vérification n'a pas abouti : réessaie dans un instant."
REPLY_FAILED = "Sophia n'a pas pu répondre : réessaie dans un instant."
IDEAS_FAILED = "Sophia n'a pas pu proposer d'idées : réessaie dans un instant."
INTENTION_FAILED = "Sophia n'a pas pu répondre."
SCOPE_FAILED = "Sophia n'a pas pu proposer de périmètre."
RESOURCES_FAILED = "La recherche n'a pas abouti."
_FALLBACK_BETA = "server-side-fallback-2026-07-01"

#: La recherche de ressources : des requêtes ciblées, quelques pages lues pour
#: vérifier ce qu'elles couvrent. Plafonnés : chaque recherche se paie.
_WEB_TOOLS: list[dict] = [
    {"type": "web_search_20260209", "name": "web_search", "max_uses": 6},
    {
        "type": "web_fetch_20260209",
        "name": "web_fetch",
        "max_uses": 4,
        "max_content_tokens": 8000,
    },
]
_NULLABLE_STRING = {"type": ["string", "null"]}
#: L'outil par lequel le modèle rend ses propositions. Pas de sortie
#: structurée ici : elle est refusée avec les citations que la recherche web
#: pose sur le texte. Un outil strict garantit la forme de son entrée ; le
#: modèle l'appelle de lui-même (Opus 5.5 refuse un `tool_choice` forcé).
_PROPOSE_TOOL: dict = {
    "name": "propose_resources",
    "description": (
        "Rend les ressources proposées, dans l'ordre de consommation conseillé. "
        "À appeler une fois, à la fin de la recherche ; liste vide s'il n'y a "
        "rien de solide."
    ),
    "strict": True,
    "input_schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["resources"],
        "properties": {
            "resources": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": [
                        "title",
                        "url",
                        "author",
                        "why_trust",
                        "kind",
                        "duration",
                        "date",
                        "covers",
                    ],
                    "properties": {
                        "title": {"type": "string"},
                        "url": {"type": "string"},
                        "author": _NULLABLE_STRING,
                        "why_trust": {"type": "string"},
                        "kind": {
                            "anyOf": [
                                {"type": "string", "enum": ["video", "text"]},
                                {"type": "null"},
                            ]
                        },
                        "duration": _NULLABLE_STRING,
                        "date": _NULLABLE_STRING,
                        "covers": _NULLABLE_STRING,
                    },
                },
            }
        },
    },
}
#: Les reprises d'un tour mis en pause par la boucle de recherche du serveur.
_MAX_CONTINUATIONS = 3


def search_result_urls(content: list) -> list[str]:
    """Les URL des résultats de `web_search` dans une réponse — les seules
    qu'une ressource proposée peut porter. Un résultat en erreur (un objet,
    pas une liste) n'en donne aucune."""
    urls: list[str] = []
    for block in content:
        if getattr(block, "type", None) != "web_search_tool_result":
            continue
        results = getattr(block, "content", None)
        if isinstance(results, list):
            urls.extend(r.url for r in results if getattr(r, "url", None))
    return urls


def _tokens(usage) -> dict[str, int]:
    """Les jetons d'une réponse, pour le journal : l'entrée hors cache, lue
    et écrite en cache, la sortie (réflexion comprise)."""
    return {
        "input_tokens": usage.input_tokens,
        "cache_read_tokens": usage.cache_read_input_tokens or 0,
        "cache_write_tokens": usage.cache_creation_input_tokens or 0,
        "output_tokens": usage.output_tokens,
    }


def proposed_resources(content: list) -> list[ResourceProposal] | None:
    """Les ressources rendues par l'appel à `propose_resources`, nulles s'il
    n'a pas été appelé ; une entrée illisible lève `pydantic.ValidationError`."""
    for block in content:
        if (
            getattr(block, "type", None) == "tool_use"
            and block.name == "propose_resources"
        ):
            return to_resources(_Resources.model_validate(block.input))
    return None


class AnthropicCompanion:
    def __init__(
        self,
        *,
        api_key: SecretStr,
        model_dictation: str,
        model_review: str,
        log_path: Path,
    ) -> None:
        self._api_key = api_key
        # Le nettoyage de dictée veut de la vitesse ; la vérification, du jugement.
        self.model_dictation = model_dictation
        self.model_review = model_review
        self.log_path = log_path
        self._client: anthropic.Anthropic | None = None

    def availability(self) -> Availability:
        return Availability(available=True)

    @property
    def client(self) -> anthropic.Anthropic:
        if self._client is None:
            self._client = anthropic.Anthropic(api_key=self._api_key.get_secret_value())
        return self._client

    def clean_dictation(self, ctx: DictationContext) -> list[str]:
        prompt = load_prompt("dictation")
        started = time.monotonic()
        try:
            response = self.client.messages.parse(
                model=self.model_dictation,
                # Large : la réflexion du modèle compte dans ce plafond, et dix
                # minutes de dictée font quelques milliers de jetons de puces.
                max_tokens=16000,
                system=[
                    {
                        "type": "text",
                        "text": prompt.text,
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
                messages=[{"role": "user", "content": dictation_message(ctx)}],
                output_format=_Bullets,
                # Une tâche de mise au propre : peu de réflexion, de la vitesse.
                output_config={"effort": "low"},
            )
        except (anthropic.APIError, pydantic.ValidationError, ValueError) as exc:
            raise CompanionFailed(DICTATION_FAILED) from exc
        latency_ms = round((time.monotonic() - started) * 1000)

        usage = response.usage
        log_call(
            self.log_path,
            usage="dictation",
            prompt_version=prompt.version,
            model=self.model_dictation,
            **_tokens(usage),
            latency_ms=latency_ms,
            context=asdict(ctx),
        )
        # Refus du modèle ou sortie tronquée : pas de puces lisibles.
        parsed = response.parsed_output
        if response.stop_reason != "end_turn" or parsed is None:
            raise CompanionFailed(DICTATION_FAILED)
        return parsed.bullets

    def _judge(
        self,
        *,
        usage: str,
        failed: str,
        context: str,
        effort: str,
        prompt_name: str | None = None,
        **kw,
    ):
        """Un appel du modèle de jugement (vérification, idées centrales,
        réponse dans un fil) : système fixe en cache, contexte en message,
        repli côté serveur ; une ligne au journal. `prompt_name` : le fichier
        du prompt quand il ne porte pas le nom de l'usage. Toute panne devient
        `CompanionFailed(failed)`."""
        prompt = load_prompt(prompt_name or usage)
        started = time.monotonic()
        try:
            send = (
                self.client.beta.messages.parse
                if "output_format" in kw
                else self.client.beta.messages.create
            )
            response = send(
                model=self.model_review,
                max_tokens=16000,
                system=[
                    {
                        "type": "text",
                        "text": prompt.text,
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
                messages=[{"role": "user", "content": context}],
                output_config={"effort": effort},
                betas=[_FALLBACK_BETA],
                fallbacks="default",
                **kw,
            )
        except (anthropic.APIError, pydantic.ValidationError, ValueError) as exc:
            raise CompanionFailed(failed) from exc
        latency_ms = round((time.monotonic() - started) * 1000)

        tokens = response.usage
        log_call(
            self.log_path,
            usage=usage,
            prompt_version=prompt.version,
            model=response.model,
            **_tokens(tokens),
            latency_ms=latency_ms,
            context=context,
        )
        # Refus du modèle (même après repli) ou sortie tronquée.
        if response.stop_reason != "end_turn":
            raise CompanionFailed(failed)
        return prompt, response

    def review_notes(self, ctx: ReviewContext) -> list[ReviewFinding]:
        prompt, response = self._judge(
            usage="review",
            failed=REVIEW_FAILED,
            context=review_xml(ctx),
            # Du jugement : relire, comparer, ne garder que l'important.
            effort="high",
            output_format=_Review,
        )
        parsed: _Review | None = response.parsed_output
        if parsed is None:
            raise CompanionFailed(REVIEW_FAILED)

        return to_findings(parsed, prompt_version=prompt.version, model=response.model)

    def central_ideas(self, ctx: IdeasContext) -> list[CentralIdea]:
        prompt, response = self._judge(
            usage="ideas",
            prompt_name="central_ideas",
            failed=IDEAS_FAILED,
            context=ideas_xml(ctx),
            # Du jugement sur une section courte : trier, écarter ce que les
            # questions couvrent ; appelé section par section, il doit rester vif.
            effort="medium",
            output_format=_Ideas,
        )
        parsed: _Ideas | None = response.parsed_output
        if parsed is None:
            raise CompanionFailed(IDEAS_FAILED)
        return to_ideas(parsed, prompt_version=prompt.version, model=response.model)

    def reply_in_thread(self, ctx: ReplyContext) -> str:
        _, response = self._judge(
            usage="reply",
            failed=REPLY_FAILED,
            context=reply_xml(ctx),
            effort="medium",
        )
        text = "".join(b.text for b in response.content if b.type == "text").strip()
        if not text:
            raise CompanionFailed(REPLY_FAILED)
        return text

    # --- Cadrer l'étude (#175) ---------------------------------------------------

    def intention_turn(self, ctx: IntentionContext) -> IntentionTurn:
        _, response = self._judge(
            usage="intention",
            prompt_name="framing_intention",
            failed=INTENTION_FAILED,
            context=intention_xml(ctx),
            # Un chat : il doit répondre vite ; reformuler et relancer demande
            # peu de réflexion.
            effort="low",
            output_format=_IntentionTurn,
        )
        parsed: _IntentionTurn | None = response.parsed_output
        if parsed is None:
            raise CompanionFailed(INTENTION_FAILED)
        return to_intention_turn(parsed)

    def propose_scope(self, ctx: ScopeContext) -> list[ScopeTag]:
        _, response = self._judge(
            usage="scope",
            prompt_name="framing_scope",
            failed=SCOPE_FAILED,
            context=scope_xml(ctx),
            # Du jugement sur les bords : ce qui revient à un autre savoir.
            effort="medium",
            output_format=_Scope,
        )
        parsed: _Scope | None = response.parsed_output
        if parsed is None:
            raise CompanionFailed(SCOPE_FAILED)
        return to_scope(parsed)

    def search_resources(self, ctx: ResourcesContext) -> ResourceSearch:
        """Une recherche web côté serveur (`web_search`, `web_fetch`), puis
        l'appel à `propose_resources`. Un tour mis en pause par la boucle du
        serveur (`pause_turn`) est repris tel quel, `_MAX_CONTINUATIONS` fois
        au plus. Une ligne au journal pour toute la recherche, avec les URL
        trouvées."""
        prompt = load_prompt("framing_resources")
        context = resources_xml(ctx)
        user = {"role": "user", "content": context}
        assistant: list = []
        found: list[str] = []
        input_tokens = output_tokens = searches = 0
        cache_read = cache_write = 0
        started = time.monotonic()
        response = None
        try:
            for _ in range(_MAX_CONTINUATIONS + 1):
                messages = [user]
                if assistant:
                    # Le tour en pause, renvoyé tel quel : le serveur reprend.
                    messages.append({"role": "assistant", "content": list(assistant)})
                response = self.client.beta.messages.create(
                    model=self.model_review,
                    max_tokens=16000,
                    system=[
                        {
                            "type": "text",
                            "text": prompt.text,
                            "cache_control": {"type": "ephemeral"},
                        }
                    ],
                    messages=messages,
                    tools=[*_WEB_TOOLS, _PROPOSE_TOOL],
                    # Chercher, trier, vérifier : du jugement, pas un marathon.
                    output_config={"effort": "medium"},
                    betas=[_FALLBACK_BETA],
                    fallbacks="default",
                )
                usage = response.usage
                input_tokens += usage.input_tokens
                cache_read += usage.cache_read_input_tokens or 0
                cache_write += usage.cache_creation_input_tokens or 0
                output_tokens += usage.output_tokens
                server = getattr(usage, "server_tool_use", None)
                searches += getattr(server, "web_search_requests", 0) or 0
                found.extend(search_result_urls(response.content))
                assistant.extend(response.content)
                if response.stop_reason != "pause_turn":
                    break
        except (anthropic.APIError, ValueError) as exc:
            raise CompanionFailed(RESOURCES_FAILED) from exc
        latency_ms = round((time.monotonic() - started) * 1000)

        try:
            proposals = proposed_resources(response.content)
        except pydantic.ValidationError:
            proposals = None
        # Les liens trouvés une fois chacun (une reprise après pause relit
        # les résultats des tours d'avant) ; les propositions telles que le
        # modèle les a rendues, avant le garde-fou — pour juger la recherche.
        log_call(
            self.log_path,
            usage="resources",
            prompt_version=prompt.version,
            model=response.model,
            input_tokens=input_tokens,
            cache_read_tokens=cache_read,
            cache_write_tokens=cache_write,
            output_tokens=output_tokens,
            web_searches=searches,
            latency_ms=latency_ms,
            context={
                "message": context,
                "web_searches": searches,
                "found": list(dict.fromkeys(found)),
                "proposed": [
                    {
                        "title": p.title,
                        "url": p.url,
                        "author": p.author,
                        "why_trust": p.why_trust,
                    }
                    for p in proposals or []
                ],
            },
        )
        # Refus, troncature, pause sans fin, ou fin sans propositions
        # (lisibles).
        if response.stop_reason not in ("tool_use", "end_turn") or proposals is None:
            raise CompanionFailed(RESOURCES_FAILED)
        return ResourceSearch(proposals=proposals, found_urls=tuple(found))
