"""Cadrer l'étude (#175) : les garde-fous des trois temps. Pur, sans framework.

« Cadrer l'étude » lance l'étude d'un cycle en trois temps, chacun passable :

1. **Intention** — une question d'ouverture fixe, puis au plus
   `MAX_GENERATED_QUESTIONS` questions générées pour le savoir ; à chaque
   réponse, l'intention reformulée (`keep_intention_turn`) ;
2. **Périmètre** — les parties possibles du savoir, dans ou hors du cycle
   (`keep_scope_tags`), écrites en texte (`scope_text`) ;
3. **Ressources** — des propositions tirées d'une vraie recherche web, dont
   les liens viennent **des seuls résultats de recherche**
   (`keep_resources`).

Ce module porte ce qui ne dépend ni du LLM ni de la base : ce qu'on garde de
ce que le modèle rend, et la mise en forme du périmètre.
"""

from dataclasses import dataclass
from urllib.parse import urlsplit, urlunsplit

# --- 1. Intention ----------------------------------------------------------------

#: La question d'ouverture, générique et fixe : elle ne coûte pas d'appel.
OPENING_QUESTION = "Qu'est-ce que tu veux tirer de ce cycle ?"
#: Celle d'une relance, quand le cycle a déjà une intention (maquette, « Relancé
#: en cours d'étude ») : elle part de l'intention existante.
REOPENING_QUESTION = "Ton intention, c'est toujours ça ? Qu'est-ce qui a bougé depuis ?"
#: Les questions générées après l'ouverture, au plus.
MAX_GENERATED_QUESTIONS = 5
#: Les réponses proposées sous une question, au plus.
MAX_SUGGESTIONS = 5
#: Une réponse proposée tient sur une pastille.
MAX_SUGGESTION_CHARS = 80
#: La réponse proposée toujours là, en dernier : s'en remettre à Sophia, qui
#: tranche (le contenu qui compte, c'est elle qui le sait).
DEFER_SUGGESTION = "Je ne sais pas, propose-moi"
#: L'intention s'écrit dans `target_level` (200 caractères).
MAX_INTENTION_CHARS = 200


def questions_left(answered: int) -> int:
    """Les questions générées qu'on peut encore poser, `answered` réponses
    déjà données (la première répond à l'ouverture)."""
    asked = max(answered - 1, 0)
    return max(MAX_GENERATED_QUESTIONS - asked, 0)


@dataclass(frozen=True)
class IntentionTurn:
    """Un tour de l'intention, tel que le modèle le rend ou tel qu'on le
    renvoie : la question suivante (nulle quand c'est fini), les réponses
    proposées, l'intention reformulée, et si le compagnon a fini."""

    question: str | None
    suggestions: list[str]
    intention: str | None
    done: bool


def _clean(text: str | None) -> str | None:
    cleaned = " ".join(text.split()) if text else ""
    return cleaned or None


def keep_suggestions(suggestions: list[str]) -> list[str]:
    """Les réponses proposées gardées : non vides, courtes, sans doublon
    (casse ignorée), dans l'ordre rendu, puis `DEFER_SUGGESTION` en dernier —
    `MAX_SUGGESTIONS` en tout."""
    kept: list[str] = []
    seen: set[str] = {DEFER_SUGGESTION.casefold()}
    for raw in suggestions:
        s = _clean(raw)
        if s is None or len(s) > MAX_SUGGESTION_CHARS or s.casefold() in seen:
            continue
        seen.add(s.casefold())
        kept.append(s)
        if len(kept) == MAX_SUGGESTIONS - 1:
            break
    return [*kept, DEFER_SUGGESTION]


def fit_intention(text: str | None) -> str | None:
    """L'intention ramenée à `MAX_INTENTION_CHARS` : coupée au dernier mot
    entier, suivie de « … », quand le modèle a dépassé."""
    cleaned = _clean(text)
    if cleaned is None or len(cleaned) <= MAX_INTENTION_CHARS:
        return cleaned
    cut = cleaned[: MAX_INTENTION_CHARS - 1].rsplit(" ", 1)[0].rstrip(" ,;:.")
    return f"{cut}…"


def opening_turn(intention: str | None, suggestions: list[str]) -> IntentionTurn:
    """Le tour d'ouverture : la question fixe — celle de la relance quand une
    intention existe déjà —, les réponses proposées pour ce savoir, et
    l'intention telle qu'elle est (une relance part d'elle)."""
    current = _clean(intention)
    return IntentionTurn(
        question=OPENING_QUESTION if current is None else REOPENING_QUESTION,
        suggestions=keep_suggestions(suggestions),
        intention=current,
        done=False,
    )


def keep_intention_turn(
    turn: IntentionTurn, *, previous: str | None, answered: int
) -> IntentionTurn:
    """Ce qu'on garde d'un tour rendu par le modèle, `answered` réponses
    données :

    - l'intention reformulée, ramenée à la longueur du champ ; vide, la
      précédente reste ;
    - fini si le modèle le dit, s'il ne pose pas de question, ou au plafond
      des questions générées : alors ni question ni réponses proposées ;
    - sinon la question, et ses réponses proposées gardées.
    """
    intention = fit_intention(turn.intention) or _clean(previous)
    question = _clean(turn.question)
    done = turn.done or question is None or questions_left(answered) == 0
    if done:
        return IntentionTurn(None, [], intention, True)
    return IntentionTurn(question, keep_suggestions(turn.suggestions), intention, False)


# --- 2. Périmètre ------------------------------------------------------------------

#: Les parties proposées, au plus.
MAX_SCOPE_TAGS = 10
#: Une partie tient sur une étiquette.
MAX_TAG_CHARS = 60
#: La ligne des bords, dans le texte du périmètre.
OUTSIDE_PREFIX = "Hors de ce cycle : "
#: Le séparateur des bords sur cette ligne (une partie peut porter une virgule).
OUTSIDE_SEPARATOR = " ; "
#: L'ancien séparateur (phase 1, tout sur une ligne), encore relu.
_OLD_SEPARATOR = " · "


@dataclass(frozen=True)
class ScopeTag:
    """Une partie possible du savoir : dans ce cycle (cochée) ou hors de ce
    cycle (un bord : ce qui revient à un autre savoir ou à un autre cycle)."""

    label: str
    in_cycle: bool


def keep_scope_tags(tags: list[ScopeTag]) -> list[ScopeTag]:
    """Les parties gardées : non vides, courtes, sans doublon (casse
    ignorée, la première l'emporte), `MAX_SCOPE_TAGS` au plus, dans l'ordre
    rendu."""
    kept: list[ScopeTag] = []
    seen: set[str] = set()
    for tag in tags:
        label = _clean(tag.label)
        if label is None or len(label) > MAX_TAG_CHARS or label.casefold() in seen:
            continue
        # Le séparateur des bords ne peut pas vivre dans une étiquette.
        label = label.replace(";", ",")
        seen.add(label.casefold())
        kept.append(ScopeTag(label, tag.in_cycle))
        if len(kept) == MAX_SCOPE_TAGS:
            break
    return kept


def scope_text(tags: list[ScopeTag]) -> str | None:
    """Le périmètre écrit : les parties retenues, une par ligne, puis une
    ligne « Hors de ce cycle : a ; b » s'il y a des bords. Rien de retenu :
    pas de périmètre (`None`), même s'il y a des bords.

        Placement sous le lob
        Frappe : effet latéral et coupé
        Hors de ce cycle : Volée côté revers ; Smash par 3
    """
    inside = [t.label.strip() for t in tags if t.in_cycle and t.label.strip()]
    if not inside:
        return None
    outside = [t.label.strip() for t in tags if not t.in_cycle and t.label.strip()]
    lines = list(inside)
    if outside:
        lines.append(OUTSIDE_PREFIX + OUTSIDE_SEPARATOR.join(outside))
    return "\n".join(lines)


def parse_scope(text: str | None) -> list[ScopeTag]:
    """L'inverse de `scope_text`, pour une relance : chaque ligne non vide
    est une partie retenue (puce de début de ligne retirée), la ligne
    « Hors de ce cycle : … » donne les bords. Un périmètre écrit à la main
    se relit ainsi ligne à ligne ; celui de la phase 1 (« a · b » sur une
    ligne) se relit aussi, et une partie en double ne compte qu'une fois —
    comme `parseScope` côté front, qui dessine les étiquettes."""
    tags: list[ScopeTag] = []
    seen: set[str] = set()

    def push(label: str, in_cycle: bool) -> None:
        label = label.strip()
        if label and label not in seen:
            seen.add(label)
            tags.append(ScopeTag(label, in_cycle))

    for raw in (text or "").splitlines():
        line = raw.strip().lstrip("-•*").strip()
        if not line:
            continue
        if line.startswith(OUTSIDE_PREFIX.strip()):
            rest = line[len(OUTSIDE_PREFIX.strip()) :]
            sep = OUTSIDE_SEPARATOR.strip()
            for part in rest.split(sep if sep in rest else _OLD_SEPARATOR.strip()):
                push(part, False)
        else:
            for part in line.split(_OLD_SEPARATOR):
                push(part, True)
    return tags


def scope_parts(text: str | None) -> list[str]:
    """Les parties **retenues** du périmètre, dans son ordre : les étiquettes
    de l'en-tête des notes, auxquelles une ressource se lie."""
    return [t.label for t in parse_scope(text) if t.in_cycle]


# --- 3. Ressources -----------------------------------------------------------------

#: Les propositions renvoyées, au plus (l'écran en montre une partie et
#: remplace une ajoutée par la suivante).
MAX_RESOURCES = 8
RESOURCE_KINDS = ("video", "text")


@dataclass(frozen=True)
class ResourceProposal:
    """Une ressource proposée. `why_trust` : pourquoi s'y fier (qui la fait,
    sa réputation) ; `kind` : `video`, `text` ou nul ; `duration` et `date`
    en clair (« 14 min », « mars 2025 ») ; `covers` : ce qu'elle couvre du
    périmètre."""

    title: str
    url: str
    author: str | None
    why_trust: str
    kind: str | None
    duration: str | None
    date: str | None
    covers: str | None


def normalize_url(url: str) -> str:
    """La forme comparable d'un lien : schéma et hôte en minuscules, sans
    `www.`, sans fragment, sans `/` final ; `http` et `https` confondus."""
    raw = url.strip()
    try:
        parts = urlsplit(raw)
    except ValueError:
        return raw.casefold()
    if not parts.scheme or not parts.netloc:
        return raw.casefold().rstrip("/")
    host = parts.netloc.lower().removeprefix("www.")
    path = parts.path.rstrip("/")
    return urlunsplit(("https", host, path, parts.query, ""))


def keep_resources(
    proposals: list[ResourceProposal],
    *,
    found_urls: list[str],
    exclude: list[str],
) -> list[ResourceProposal]:
    """Ce qu'on garde de ce que le modèle propose :

    - **un lien tiré des seuls résultats de recherche** : une URL absente de
      `found_urls` (les résultats renvoyés par l'outil) est jetée — le
      modèle n'invente pas d'adresse ;
    - un lien écarté (`exclude` : déjà ajouté, déjà proposé, déjà dans le
      cycle) ou déjà gardé est jeté ;
    - un titre ou un « pourquoi s'y fier » vide est jeté ; une sorte
      inconnue devient nulle, un champ vide aussi ;
    - `MAX_RESOURCES` au plus, dans l'ordre proposé (l'ordre de
      consommation conseillé).
    """
    found = {normalize_url(u) for u in found_urls if u.strip()}
    taken = {normalize_url(u) for u in exclude if u.strip()}
    kept: list[ResourceProposal] = []
    for p in proposals:
        url = p.url.strip()
        key = normalize_url(url) if url else ""
        title, why = _clean(p.title), _clean(p.why_trust)
        if not key or key not in found or key in taken or not title or not why:
            continue
        taken.add(key)
        kind = p.kind if p.kind in RESOURCE_KINDS else None
        kept.append(
            ResourceProposal(
                title=title,
                url=url,
                author=_clean(p.author),
                why_trust=why,
                kind=kind,
                duration=_clean(p.duration),
                date=_clean(p.date),
                covers=_clean(p.covers),
            )
        )
        if len(kept) == MAX_RESOURCES:
            break
    return kept
