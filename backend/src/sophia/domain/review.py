"""La vérification des notes d'une ressource (#173). Pur, sans framework.

Sophia relit les notes prises sur une ressource contre cette ressource et
laisse **au plus trois commentaires**, aucun s'il n'y a rien. Ce module porte
ce qui ne dépend ni du LLM ni de la base : les types de commentaire, le texte
des notes tel qu'il est envoyé, et les garde-fous appliqués à ce que le modèle
rend (couper à trois, écarter une citation introuvable).
"""

import re
from collections.abc import Iterator
from dataclasses import dataclass
from enum import StrEnum
from typing import Any


class ReviewError(Exception):
    """Base des violations d'invariant sur la vérification."""


class ReviewNothingToReview(ReviewError):
    """Les notes de la ressource sont vides : rien à vérifier."""


class ReviewPastedTooLong(ReviewError):
    """Le passage collé dépasse ce qu'une vérification envoie."""


class ReviewEmptyReply(ReviewError):
    """Une réponse vide dans un fil."""


class ReviewKind(StrEnum):
    """Ce que relève un commentaire — libellés écran : Inexact, En surface,
    Oubli, Traduit mot à mot (cf. `cas/methode-etude.md`, procédé v2)."""

    inexact = "inexact"
    surface = "surface"
    omission = "omission"
    literal_translation = "literal_translation"


class ReviewAnchor(StrEnum):
    """Où le commentaire s'accroche : un **passage** des notes (surligné), ou
    une **insertion** après un passage (l'oubli, trait pointillé « + »)."""

    passage = "passage"
    insertion = "insertion"


class ReviewStatus(StrEnum):
    """Ouvert, ou résolu (« Résolu » vaut archivé : il reste, replié)."""

    open = "open"
    resolved = "resolved"


class PasteReason(StrEnum):
    """Pourquoi la source n'a pas pu être lue, et qu'on demande de la coller :
    pas de lien, page illisible (payante, réseau, vide), vidéo sans
    sous-titres, ou source trop longue même restreinte à sa partie."""

    no_link = "no_link"
    unreachable = "unreachable"
    no_transcript = "no_transcript"
    too_long = "too_long"


class ReplyAuthor(StrEnum):
    user = "user"
    sophia = "sophia"


#: Le dosage : trois commentaires au plus par vérification.
MAX_FINDINGS = 3

#: Ce qu'une vérification envoie de la source, au plus, en caractères (environ
#: 50 000 jetons). Au-delà, la source est refusée (`too_long`) et l'on demande
#: de coller le passage utile — jamais de troncature silencieuse.
MAX_SOURCE_CHARS = 200_000


@dataclass(frozen=True)
class Finding:
    """Un commentaire tel que le modèle le rend, avant garde-fous."""

    kind: ReviewKind
    quote: str | None
    after_quote: str | None
    message: str
    where_to_look: str | None


@dataclass(frozen=True)
class KeptFinding:
    """Un commentaire retenu, ancré : `quote` est l'extrait des notes, tel
    qu'il y figure ; `anchor` dit s'il est surligné ou si l'oubli s'insère
    après lui."""

    kind: ReviewKind
    anchor: ReviewAnchor
    quote: str
    message: str
    where_to_look: str | None


# --- Le texte des notes --------------------------------------------------------

# Nœuds inline : leur parent est un bloc de texte (une ligne des notes).
_INLINE = {"text", "hardBreak", "inlineMath", "mention", "emoji"}
_LIST_ITEMS = {"listItem", "taskItem"}
# Un paragraphe qui a des enfants (`textList > textItem`) : son texte, puis
# ses blocs enfants en retrait — sans puce.
_TEXT_ITEM = "textItem"


def _inline_text(node: dict[str, Any]) -> str:
    kind = node.get("type")
    if kind == "text":
        text = node.get("text")
        return text if isinstance(text, str) else ""
    if kind == "hardBreak":
        return " "
    if kind == "inlineMath":
        attrs = node.get("attrs")
        latex = attrs.get("latex") if isinstance(attrs, dict) else None
        return f"${latex}$" if isinstance(latex, str) else ""
    return ""


def _is_textblock(node: dict[str, Any]) -> bool:
    content = node.get("content")
    return isinstance(content, list) and any(
        isinstance(c, dict) and c.get("type") in _INLINE for c in content
    )


def note_blocks(doc: dict[str, Any] | None) -> Iterator[tuple[str, str]]:
    """Les blocs de texte d'un document TipTap, dans l'ordre : `(préfixe,
    texte)`. Le préfixe dit la forme (`# ` pour un titre, `- ` pour une puce,
    indentée selon la profondeur) ; le texte est celui du bloc, celui que le
    front retrouve pour ancrer un commentaire."""

    # `bullet` : ce bloc ouvre une puce (il porte le tiret) ; les blocs suivants
    # de la même puce s'alignent dessous.
    def walk(node: Any, depth: int, bullet: bool) -> Iterator[tuple[str, str]]:
        if not isinstance(node, dict):
            return
        kind = node.get("type")
        if _is_textblock(node):
            text = "".join(
                _inline_text(c) for c in node["content"] if isinstance(c, dict)
            ).strip()
            if not text:
                return
            if kind == "heading":
                attrs = node.get("attrs")
                level = attrs.get("level") if isinstance(attrs, dict) else 1
                level = level if isinstance(level, int) else 1
                yield ("#" * level + " ", text)
            elif depth > 0:
                yield ("  " * (depth - 1) + ("- " if bullet else "  "), text)
            else:
                yield ("", text)
            return
        content = node.get("content")
        if not isinstance(content, list):
            return
        is_item = kind in _LIST_ITEMS
        for i, child in enumerate(content):
            if kind == _TEXT_ITEM:
                yield from walk(child, depth + (i > 0), bullet and i == 0)
            elif is_item:
                yield from walk(child, depth + 1, i == 0)
            else:
                yield from walk(child, depth, bullet and i == 0)

    yield from walk(doc, 0, False)


def notes_text(doc: dict[str, Any] | None) -> str:
    """Les notes en texte, une ligne par bloc : ce qui part au modèle."""
    return "\n".join(prefix + text for prefix, text in note_blocks(doc))


# --- Les garde-fous ------------------------------------------------------------

_SPACES = re.compile(r"\s+")
# Un modèle recopie parfois la forme de la ligne avec l'extrait.
_LINE_MARKER = re.compile(r"^\s*(?:#{1,6}\s+|[-*•]\s+)")
_QUOTES = str.maketrans({"’": "'", "‘": "'", "“": '"', "”": '"', "«": '"', "»": '"'})


def _normalize(text: str) -> str:
    return _SPACES.sub(" ", text.translate(_QUOTES)).strip()


def strip_quote(quote: str | None) -> str | None:
    if quote is None:
        return None
    cleaned = _LINE_MARKER.sub("", quote).strip().strip("…").strip()
    return cleaned or None


def quote_in_notes(quote: str, blocks: list[str]) -> bool:
    """L'extrait figure-t-il dans **un** bloc des notes ? Un extrait à cheval
    sur deux blocs ne s'ancre pas : il ne compte pas. Espaces et guillemets
    typographiques sont ramenés à une forme commune."""
    needle = _normalize(quote)
    return bool(needle) and any(needle in _normalize(b) for b in blocks)


def keep_findings(
    findings: list[Finding], doc: dict[str, Any] | None
) -> list[KeptFinding]:
    """Ce qu'on garde de ce que le modèle rend : un commentaire dont l'extrait
    existe dans les notes (`quote`, ou `after_quote` pour un oubli), avec un
    message ; trois au plus, dans l'ordre rendu."""
    blocks = [text for _, text in note_blocks(doc)]
    kept: list[KeptFinding] = []
    for f in findings:
        if f.kind is ReviewKind.omission:
            anchor = ReviewAnchor.insertion
            quote = strip_quote(f.after_quote) or strip_quote(f.quote)
        else:
            anchor = ReviewAnchor.passage
            quote = strip_quote(f.quote)
        message = f.message.strip()
        if not message or quote is None or not quote_in_notes(quote, blocks):
            continue
        where = (f.where_to_look or "").strip() or None
        kept.append(KeptFinding(f.kind, anchor, quote, message, where))
        if len(kept) == MAX_FINDINGS:
            break
    return kept
