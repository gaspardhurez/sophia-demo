"""Les sorties structurées du compagnon, communes à ses deux adaptateurs.

Un modèle Pydantic par usage : l'API le reçoit en `output_format` (validé par
le SDK), Claude Code en `--json-schema` (son schéma JSON). Puis la même
traduction en valeurs du port (`application/companion.py`), **avant** les
garde-fous que l'application applique ensuite.
"""

import html
from typing import Literal

from pydantic import BaseModel

from sophia.application.companion import CentralIdea, ReviewFinding
from sophia.domain.framing import IntentionTurn, ResourceProposal, ScopeTag


class _Bullets(BaseModel):
    """La sortie du nettoyage de dictée."""

    bullets: list[str]


class _Finding(BaseModel):
    kind: Literal["inexact", "surface", "omission", "literal_translation"]
    quote: str | None
    after_quote: str | None
    message: str
    where_to_look: str | None


class _Review(BaseModel):
    """La sortie structurée de la vérification."""

    findings: list[_Finding]


class _Idea(BaseModel):
    idea: str
    reason: str
    angle: str
    quote: str | None


class _Ideas(BaseModel):
    """La sortie structurée des idées centrales d'une section."""

    ideas: list[_Idea]


class _IntentionTurn(BaseModel):
    """La sortie structurée d'un tour de l'intention."""

    intention: str | None
    question: str | None
    suggestions: list[str]
    done: bool


class _Tag(BaseModel):
    label: str
    in_cycle: bool


class _Scope(BaseModel):
    """La sortie structurée du périmètre proposé."""

    tags: list[_Tag]


class _Resource(BaseModel):
    title: str
    url: str
    author: str | None
    why_trust: str
    kind: Literal["video", "text"] | None
    duration: str | None
    date: str | None
    covers: str | None


class _Resources(BaseModel):
    """Les ressources proposées : l'entrée de l'outil `propose_resources`
    (API), la sortie structurée (Claude Code)."""

    resources: list[_Resource]


class _Reply(BaseModel):
    """La réponse dans un fil, pour Claude Code : un texte, mis en objet pour
    passer par la sortie structurée (l'API la rend en texte libre)."""

    reply: str


def _unescape(text: str | None) -> str | None:
    # Le contexte part échappé en XML : un extrait recopié peut l'être.
    return html.unescape(text) if text is not None else None


def to_findings(parsed: _Review, *, prompt_version: str, model: str):
    return [
        ReviewFinding(
            kind=f.kind,
            quote=_unescape(f.quote),
            after_quote=_unescape(f.after_quote),
            message=f.message,
            where_to_look=f.where_to_look,
            prompt_version=prompt_version,
            model=model,
        )
        for f in parsed.findings
    ]


def to_ideas(parsed: _Ideas, *, prompt_version: str, model: str) -> list[CentralIdea]:
    return [
        CentralIdea(
            idea=i.idea,
            reason=i.reason,
            angle=i.angle,
            quote=_unescape(i.quote),
            prompt_version=prompt_version,
            model=model,
        )
        for i in parsed.ideas
    ]


def to_intention_turn(parsed: _IntentionTurn) -> IntentionTurn:
    return IntentionTurn(
        question=parsed.question,
        suggestions=list(parsed.suggestions),
        intention=parsed.intention,
        done=parsed.done,
    )


def to_scope(parsed: _Scope) -> list[ScopeTag]:
    return [ScopeTag(t.label, t.in_cycle) for t in parsed.tags]


def to_resources(parsed: _Resources) -> list[ResourceProposal]:
    return [ResourceProposal(**r.model_dump()) for r in parsed.resources]
