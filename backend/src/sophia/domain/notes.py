"""Les notes d'un savoir (design #79, #88). Pur, sans framework.

**Un seul document par savoir**, en JSON d'éditeur (TipTap). Ses titres (H1,
H2, H3) ne sont que de la mise en forme : rien n'est rangé en sections. Les
**questions** vivent en table (l'historique des passations s'y accroche), mais
leur **place** vient du document. Depuis le #213, une question est une
**annotation** : une marque `questionRef` sur un passage, ou son id dans
l'attribut `questions` d'un bloc de texte — d'un titre pour une question de
section. L'ancien nœud `question` (un bloc) se lit encore. Leur ordre et leur
contexte (les titres au-dessus d'elles) se lisent du document au moment de
l'usage (`question_places`).
"""

import uuid
from collections.abc import Iterator
from enum import StrEnum
from typing import Any


class NotesError(Exception):
    """Base des violations d'invariant sur les notes."""


class NotesSkillNotFound(NotesError):
    """Le savoir dont on écrit les notes n'existe pas."""


class QuestionKind(StrEnum):
    """La **nature** de la question : le type de connaissance qu'elle
    travaille — `factual` (un fait), `elaborative` (un pourquoi, un comment).
    Une étiquette : elle ne change rien à la mécanique, que règle la forme de
    la réponse (`AnswerForm` ; déliées le 07/10/2026)."""

    factual = "factual"
    elaborative = "elaborative"


class AnswerForm(StrEnum):
    """La **forme** de la réponse attendue — elle règle la correction.

    `free` : une réponse libre, un seul verdict (su / pas su). `list` : des
    éléments à mentionner, un verdict par élément ; la question est sue quand
    tous le sont (chantier interro-reapprentissage, 07/10/2026)."""

    free = "free"
    list = "list"


def is_complete(
    form: AnswerForm, prompt: str, answer: str | None, points: list[str]
) -> bool:
    """Une question **compte** quand elle est posée et porte sa réponse
    attendue : une réponse pour une réponse libre, au moins un élément pour
    une liste — sans elle, la passation n'aurait rien à révéler. `points` :
    le texte des éléments.

    Une question incomplète s'enregistre quand même (elle se crée vide, en
    place, et s'écrit au fil de la saisie, #88) ; elle n'entre simplement ni
    dans le compte d'un cycle ni dans une passation."""
    if not prompt.strip():
        return False
    if form is AnswerForm.free:
        return bool((answer or "").strip())
    return any(p.strip() for p in points)


def with_point_ids(points: list[dict[str, Any]]) -> list[dict[str, str]]:
    """Les éléments d'une liste, tels qu'ils se stockent : `{"id", "text"}`,
    l'id en texte. Un élément sans id en reçoit un : c'est lui qui le suit
    dans l'historique, même reformulé."""
    return [
        {"id": str(p.get("id") or uuid.uuid4()), "text": str(p.get("text") or "")}
        for p in points
    ]


# --- La place des questions : le document fait foi ----------------------------

#: Le nœud TipTap qui pose une question dans le document : un bloc atomique,
#: sans contenu, `{"type": "question", "attrs": {"id": "<uuid>"}}`.
QUESTION_NODE = "question"
#: Un titre : `{"type": "heading", "attrs": {"level": 1|2|3}, "content": […]}`.
HEADING_NODE = "heading"
#: La marque qui pose une question sur un passage (#213), sur ses nœuds de
#: texte : `{"type": "questionRef", "attrs": {"id": "<uuid>"}}`.
QUESTION_MARK = "questionRef"
#: L'attribut d'un bloc de texte (paragraphe, titre) qui y pose des questions
#: entières (#213) : une liste d'ids. Sur un titre, des questions de section.
QUESTIONS_ATTR = "questions"
#: Ce qui sépare les titres d'un chemin, à l'affichage (« Le geste › Préparation »).
PATH_SEPARATOR = " › "


def _nodes(node: Any) -> Iterator[dict[str, Any]]:
    """Tous les nœuds d'un JSON d'éditeur, en profondeur, dans l'ordre du
    document (un nœud avant ses enfants)."""
    if not isinstance(node, dict):
        return
    yield node
    content = node.get("content")
    if isinstance(content, list):
        for child in content:
            yield from _nodes(child)


def _text(node: dict[str, Any]) -> str:
    """Le texte d'un nœud : ses nœuds `text`, mis bout à bout."""
    return "".join(
        n["text"]
        for n in _nodes(node)
        if n.get("type") == "text" and isinstance(n.get("text"), str)
    ).strip()


def _level(node: dict[str, Any]) -> int:
    """Le niveau d'un titre ; illisible, il vaut 1."""
    attrs = node.get("attrs")
    raw = attrs.get("level") if isinstance(attrs, dict) else None
    return raw if isinstance(raw, int) and not isinstance(raw, bool) else 1


def _uuid(raw: Any) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(raw))
    except ValueError:
        return None


def _question_id(node: dict[str, Any]) -> uuid.UUID | None:
    attrs = node.get("attrs")
    return _uuid(attrs.get("id") if isinstance(attrs, dict) else None)


def _anchored_ids(node: dict[str, Any]) -> list[uuid.UUID | None]:
    """Les questions qu'un nœud pose : un ancien nœud `question`, l'attribut
    `questions` d'un bloc de texte, les marques `questionRef` d'un texte."""
    if node.get("type") == QUESTION_NODE:
        return [_question_id(node)]
    if node.get("type") == "text":
        marks = node.get("marks")
        return [
            _uuid((m.get("attrs") or {}).get("id"))
            for m in (marks if isinstance(marks, list) else [])
            if isinstance(m, dict) and m.get("type") == QUESTION_MARK
        ]
    attrs = node.get("attrs")
    raw = attrs.get(QUESTIONS_ATTR) if isinstance(attrs, dict) else None
    return [_uuid(r) for r in raw] if isinstance(raw, list) else []


def question_places(
    doc: dict[str, Any] | None,
) -> list[tuple[uuid.UUID, tuple[str, ...]]]:
    """Les questions que pose le document, dans son ordre, chacune avec le
    chemin des titres au-dessus d'elle.

    Le document se lit en profondeur (colonnes, listes… comprises), dans
    l'ordre. Un titre de niveau *n* remplace les titres de niveau ≥ *n* du
    chemin ; un titre vide les retire sans prendre de place. Une question
    posée sur un titre (une question de section) ou dans son texte a ce
    titre au bout de son chemin ; sur un bloc, ses questions entières passent
    avant celles de ses passages. Seule la première occurrence d'une question
    compte ; un id illisible est ignoré. Les ids ne sont pas filtrés : c'est
    à l'appelant d'écarter ceux qui ne sont pas des questions du savoir.
    """
    places: list[tuple[uuid.UUID, tuple[str, ...]]] = []
    seen: set[uuid.UUID] = set()
    path: list[tuple[int, str]] = []
    for node in _nodes(doc):
        if node.get("type") == HEADING_NODE:
            level = _level(node)
            path = [(lv, t) for lv, t in path if lv < level]
            title = _text(node)
            if title:
                path.append((level, title))
        for qid in _anchored_ids(node):
            if qid is None or qid in seen:
                continue
            seen.add(qid)
            places.append((qid, tuple(t for _, t in path)))
    return places


def with_question_nodes(
    doc: dict[str, Any] | None, missing_ids: list[uuid.UUID]
) -> dict[str, Any] | None:
    """Le document, avec un nœud `question` ajouté en fin pour chacune de
    `missing_ids`, dans l'ordre. Rend une copie : l'original n'est pas touché.
    Un document vide devient un document qui ne porte que ces nœuds."""
    if not missing_ids:
        return doc
    out = dict(doc) if isinstance(doc, dict) else {"type": "doc"}
    content = out.get("content")
    out["content"] = [
        *(content if isinstance(content, list) else []),
        *({"type": QUESTION_NODE, "attrs": {"id": str(q)}} for q in missing_ids),
    ]
    return out


def heading_titles(doc: dict[str, Any] | None) -> list[str]:
    """Les titres du document, dans son ordre, sans les vides ni les doublons.

    Ce que le compagnon reçoit des notes pour la dictée : le vocabulaire du
    savoir tel que l'utilisateur l'a déjà écrit, sans le corps des notes.
    """
    titles: list[str] = []
    for node in _nodes(doc):
        if node.get("type") == HEADING_NODE:
            title = _text(node)
            if title and title not in titles:
                titles.append(title)
    return titles
