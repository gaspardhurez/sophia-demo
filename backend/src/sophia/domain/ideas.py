"""Les idées centrales d'une section des notes (#173). Pur, sans framework.

Le tri avant les questions : parmi ce que dit une section, ce qu'il faut savoir
**sans rouvrir ses notes** — seules ces idées-là reçoivent une question.
Sophia en propose **trois au plus**, aucune s'il n'y a rien à ajouter aux
questions déjà écrites ; elle ne rédige jamais la question.

Ce module porte ce qui ne dépend ni du LLM ni de la base : le titre et le
texte de la section envoyée, les questions qu'elle pose, et les garde-fous
appliqués à ce que le modèle rend.
"""

import uuid
from dataclasses import dataclass
from typing import Any

from sophia.domain.notes import HEADING_NODE, question_places
from sophia.domain.review import note_blocks, notes_text, quote_in_notes, strip_quote


class IdeasError(Exception):
    """Base des violations d'invariant sur les idées centrales."""


class IdeasNothingToSort(IdeasError):
    """La section envoyée n'a pas de texte : rien à trier."""


#: Le dosage : trois idées au plus par section.
MAX_IDEAS = 3


@dataclass(frozen=True)
class Idea:
    """Une idée telle que le modèle la rend, avant garde-fous."""

    idea: str
    reason: str
    angle: str
    quote: str | None


# --- La section envoyée ----------------------------------------------------------


def _nodes(section: dict[str, Any] | None) -> list[Any]:
    content = section.get("content") if isinstance(section, dict) else None
    return content if isinstance(content, list) else []


def section_title(section: dict[str, Any] | None) -> str | None:
    """Le titre de la section : son premier bloc s'il est un titre non vide
    (une section sans titre — le texte d'avant tout titre — n'en a pas)."""
    for node in _nodes(section):
        if not isinstance(node, dict):
            continue
        if node.get("type") != HEADING_NODE:
            return None
        text = "".join(t for _, t in note_blocks({"content": [node]})).strip()
        if text:
            return text
    return None


def section_text(section: dict[str, Any] | None) -> str:
    """Le texte de la section, une ligne par bloc (titres compris, questions
    exclues : un nœud question n'a pas de texte)."""
    return notes_text(section)


def section_question_ids(section: dict[str, Any] | None) -> list[uuid.UUID]:
    """Les questions que pose la section, dans son ordre."""
    return [qid for qid, _ in question_places(section)]


# --- Les garde-fous ------------------------------------------------------------


@dataclass(frozen=True)
class KeptIdea:
    """Une idée retenue. `quote` : l'extrait de la section où elle se lit,
    tel qu'il y figure dans un seul bloc ; nul si le modèle n'en a pas donné
    ou s'il est introuvable (l'idée reste : elle peut tenir à plusieurs
    blocs)."""

    idea: str
    reason: str
    angle: str
    quote: str | None


def keep_ideas(ideas: list[Idea], section: dict[str, Any] | None) -> list[KeptIdea]:
    """Ce qu'on garde de ce que le modèle rend : une idée énoncée, avec son
    angle, qui ne soit pas une question rédigée (un point d'interrogation
    l'écarte) ; trois au plus, dans l'ordre rendu. Un extrait introuvable
    dans la section est retiré, l'idée gardée."""
    blocks = [text for _, text in note_blocks(section)]
    kept: list[KeptIdea] = []
    for i in ideas:
        idea, angle = i.idea.strip(), i.angle.strip()
        if not idea or not angle or "?" in idea or "?" in angle:
            continue
        quote = strip_quote(i.quote)
        if quote is not None and not quote_in_notes(quote, blocks):
            quote = None
        kept.append(KeptIdea(idea, i.reason.strip(), angle, quote))
        if len(kept) == MAX_IDEAS:
            break
    return kept
