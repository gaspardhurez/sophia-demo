"""Schémas des idées centrales d'une section des notes (#173)."""

from typing import Any

from pydantic import BaseModel, ConfigDict


class CentralIdeasRequest(BaseModel):
    """La section dont on veut les idées centrales, en fragment de document
    TipTap `{"type": "doc", "content": [...]}` : ses nœuds de premier rang
    tels que l'écran les découpe (`question-sections.ts`), **son titre
    compris** (premier nœud ; absent pour le texte d'avant tout titre), ses
    sous-titres et ses nœuds `question` (dont le serveur lit le texte en
    base)."""

    section: dict[str, Any]


class CentralIdeaRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    #: Ce qu'il faut savoir sans les notes, énoncé court (pas une question).
    idea: str
    #: Pourquoi elle compte, en quelques mots (« le reste en découle »).
    reason: str
    #: Par où l'interroger — une direction, jamais la question rédigée.
    angle: str
    #: L'extrait de la section où l'idée se lit, tel qu'il figure dans un seul
    #: bloc (pour surligner le passage et poser la question après lui) ; nul
    #: si l'idée n'a pas de passage unique.
    quote: str | None


class CentralIdeas(BaseModel):
    """Trois idées au plus ; une liste vide : rien à ajouter aux questions
    déjà écrites."""

    ideas: list[CentralIdeaRead]
