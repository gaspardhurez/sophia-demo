"""Le compagnon de l'étude accompagnée — ses ports et l'état de ses actions.

Deux ports, implémentés dans `infrastructure/` :

- `Companion` — le LLM (`infrastructure/llm/` : l'API Claude, ou
  l'abonnement par Claude Code avec l'API en relais, selon
  `SOPHIA_LLM_BACKEND`) ;
- `Transcriber` — la transcription de la voix (adaptateur mlx-whisper,
  `infrastructure/transcription/`) : l'API Claude ne prend pas d'audio, la
  dictée passe donc par deux étages.

Un port indisponible (pas de clé, transcription absente) reste un port : son
adaptateur porte le motif et lève `CompanionUnavailable` si on l'appelle,
traduite en 503 par `main.py`.

Chaque port expose sa disponibilité — ce dont l'écran a besoin pour montrer ou
griser une action —, puis une méthode par usage, ajoutée lot par lot, chacune
avec son prompt versionné, son entrée au journal des appels
(`infrastructure/llm/journal.py`) :

- dictée (livrée) : `Transcriber.transcribe`, par tranches en direct, puis
  `Companion.clean_dictation` à l'arrêt (`application/dictation.py`) ;
- vérification des notes d'une ressource (livrée) : `Companion.review_notes`
  (`application/review.py`) ;
- idées centrales, le tri avant les questions (livrées) :
  `Companion.central_ideas` (`application/ideas.py`) ;
- réponse dans un fil (livrée) : `Companion.reply_in_thread` ;
- « Cadrer l'étude » (#175), ses trois temps : `Companion.intention_turn`,
  `Companion.propose_scope`, `Companion.search_resources` (cette dernière
  avec l'outil de recherche web de l'API) — `application/framing.py`.

Rien n'est posé avant son usage : une méthode sans écran qui l'appelle serait du
code mort.
"""

from dataclasses import dataclass, field
from typing import Protocol

from sophia.application.schemas.companion import ActionStatus, CompanionStatus
from sophia.domain.framing import IntentionTurn, ResourceProposal, ScopeTag


class CompanionUnavailable(Exception):
    """On a appelé un port indisponible. Porte le motif, lisible tel quel."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class CompanionFailed(Exception):
    """Le port, disponible, n'a pas rendu de résultat (réseau, clé refusée,
    réponse refusée ou illisible). Porte le motif, lisible tel quel."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True)
class Availability:
    available: bool
    # Le motif, en français, quand le port est indisponible.
    reason: str | None = None


@dataclass(frozen=True)
class DictationContext:
    """Ce que le LLM reçoit pour nettoyer une dictée — des valeurs, jamais
    d'objet ORM : le port ne voit que ce qui part sur le réseau."""

    skill: str
    # La ressource, quand on dicte dans ses notes ; nulle dans celles du savoir.
    resource: str | None
    # La partie de la ressource qui intéresse (« Section(s) concernée(s) »).
    resource_part: str | None
    # Les titres des notes du savoir : son vocabulaire, sans le corps.
    note_titles: tuple[str, ...]
    # La transcription brute, telle que Whisper l'a entendue.
    transcript: str


# --- Vérification des notes d'une ressource, réponse dans un fil -------------


@dataclass(frozen=True)
class ReplyLine:
    """Une réponse d'un fil : `author` vaut `user` ou `sophia`."""

    author: str
    body: str


@dataclass(frozen=True)
class ExistingComment:
    """Un commentaire déjà laissé sur la ressource (résolu compris) : la
    vérification le reçoit pour ne pas se redire."""

    kind: str
    quote: str
    message: str
    status: str
    replies: tuple[ReplyLine, ...] = ()


@dataclass(frozen=True)
class ReviewContext:
    """Ce qu'une vérification envoie : le savoir, le cycle (intention,
    périmètre), la ressource et sa partie, les notes de la ressource en texte,
    la source, et les commentaires existants."""

    skill_title: str
    intention: str | None
    scope: str | None
    resource_title: str
    resource_author: str | None
    resource_reference: str | None
    resource_part: str | None
    notes_text: str
    # `web`, `youtube` (horodatée) ou `pasted` (collée par l'utilisateur).
    source_kind: str
    source_text: str
    existing_comments: tuple[ExistingComment, ...] = ()


@dataclass(frozen=True)
class ReviewFinding:
    """Un commentaire rendu par le modèle, **avant** les garde-fous
    (`domain.review.keep_findings`). `kind` : `inexact`, `surface`,
    `omission`, `literal_translation`. `quote` : l'extrait exact des notes
    commenté ; `after_quote` : pour un oubli, l'extrait après lequel il
    s'insère. Porte sa provenance (version du prompt, modèle)."""

    kind: str
    quote: str | None
    after_quote: str | None
    message: str
    where_to_look: str | None
    prompt_version: str
    model: str


@dataclass(frozen=True)
class ReplyContext:
    """Ce qu'une réponse dans un fil envoie : le commentaire, son passage, le
    fil (dernière ligne : l'utilisateur), et la source si elle a pu être lue."""

    skill_title: str
    resource_title: str
    resource_part: str | None
    notes_text: str
    comment_kind: str
    comment_quote: str
    comment_message: str
    comment_where_to_look: str | None
    thread: tuple[ReplyLine, ...] = field(default_factory=tuple)
    source_text: str | None = None


# --- Idées centrales d'une section --------------------------------------------


@dataclass(frozen=True)
class ExistingQuestion:
    """Une question déjà posée dans la section : les idées qu'elle couvre ne
    se reproposent pas. `answer` : la réponse attendue (les éléments d'une
    liste, mis bout à bout), nulle si elle n'est pas encore écrite."""

    prompt: str
    answer: str | None


@dataclass(frozen=True)
class IdeasContext:
    """Ce qu'une demande d'idées centrales envoie : le savoir, le cycle
    (intention, périmètre), **une** section des notes (titre, texte une ligne
    par bloc) et ses questions existantes."""

    skill_title: str
    intention: str | None
    scope: str | None
    section_title: str | None
    section_text: str
    questions: tuple[ExistingQuestion, ...] = ()


@dataclass(frozen=True)
class CentralIdea:
    """Une idée rendue par le modèle, **avant** les garde-fous
    (`domain.ideas.keep_ideas`) : `idea` (ce qu'il faut savoir sans les
    notes), `reason` (pourquoi elle compte, court), `angle` (par où
    l'interroger — jamais une question rédigée), `quote` (l'extrait de la
    section où elle se lit, ou nul). Porte sa provenance."""

    idea: str
    reason: str
    angle: str
    quote: str | None
    prompt_version: str
    model: str


# --- Cadrer l'étude (#175) -------------------------------------------------------


@dataclass(frozen=True)
class FramingProject:
    """Un projet du cycle, et les étapes de ce projet qui portent le
    savoir (leur titre)."""

    title: str
    steps: tuple[str, ...] = ()


@dataclass(frozen=True)
class PastCycle:
    """Un autre cycle du savoir : son état, son intention, son périmètre."""

    state: str
    intention: str | None
    scope: str | None


@dataclass(frozen=True)
class CycleResource:
    """Une ressource déjà dans le cycle."""

    title: str
    author: str | None
    reference: str | None


@dataclass(frozen=True)
class SkillFrame:
    """Ce que les trois temps du cadrage savent du savoir et de son cycle :
    le savoir et sa place dans l'arbre (ancêtres de la racine au parent,
    frères, enfants), le domaine, les projets du cycle et leurs étapes,
    les autres cycles du savoir, les titres de ses notes, et ce que le
    cycle porte déjà (intention, périmètre, ressources)."""

    skill_title: str
    skill_description: str | None
    domain: str
    ancestors: tuple[str, ...] = ()
    siblings: tuple[str, ...] = ()
    children: tuple[str, ...] = ()
    projects: tuple[FramingProject, ...] = ()
    past_cycles: tuple[PastCycle, ...] = ()
    note_titles: tuple[str, ...] = ()
    intention: str | None = None
    scope: str | None = None
    resources: tuple[CycleResource, ...] = ()


@dataclass(frozen=True)
class QuestionAnswer:
    """Un échange de l'intention : la question posée, la réponse envoyée."""

    question: str
    answer: str


@dataclass(frozen=True)
class IntentionContext:
    """Un tour de l'intention : le savoir, les échanges (vides : on ne veut
    que les réponses proposées pour la question d'ouverture), le brouillon
    d'intention dont on part, et les questions qu'on peut encore poser
    (0 : c'est le dernier tour, on ne veut plus que l'intention)."""

    frame: SkillFrame
    turns: tuple[QuestionAnswer, ...]
    draft: str | None
    questions_left: int


@dataclass(frozen=True)
class ScopeContext:
    """Une proposition de périmètre : le savoir et l'intention du cycle."""

    frame: SkillFrame
    intention: str | None


@dataclass(frozen=True)
class ResourcesContext:
    """Une recherche de ressources : le savoir (intention, périmètre et
    ressources du cycle compris), les préférences du domaine, et les liens à
    ne pas reproposer."""

    frame: SkillFrame
    preferences: str | None
    exclude: tuple[str, ...] = ()


@dataclass(frozen=True)
class ResourceSearch:
    """Ce qu'une recherche rend, **avant** les garde-fous
    (`domain.framing.keep_resources`) : les propositions du modèle, et les
    URL des résultats renvoyés par l'outil de recherche — les seules qu'une
    proposition peut porter."""

    proposals: list[ResourceProposal]
    found_urls: tuple[str, ...]


class Companion(Protocol):
    def availability(self) -> Availability: ...

    def clean_dictation(self, ctx: DictationContext) -> list[str]:
        """La transcription nettoyée, une puce par phrase, dans l'ordre dicté ;
        vide si rien ne porte sur
        le contenu."""
        ...

    def review_notes(self, ctx: ReviewContext) -> list[ReviewFinding]:
        """Relit les notes d'une ressource contre sa source : trois
        commentaires au plus, aucun s'il n'y a rien."""
        ...

    def central_ideas(self, ctx: IdeasContext) -> list[CentralIdea]:
        """Les idées d'une section à savoir sans les notes, que ses questions
        ne couvrent pas encore : trois au plus, aucune s'il n'y a rien."""
        ...

    def reply_in_thread(self, ctx: ReplyContext) -> str:
        """La réponse de Sophia dans le fil d'un commentaire : un avis éclairé,
        court, jamais définitif."""
        ...

    def intention_turn(self, ctx: IntentionContext) -> IntentionTurn:
        """Un tour de l'intention, **avant** les garde-fous
        (`domain.framing`) : sans échange, les réponses proposées à la
        question d'ouverture ; sinon l'intention reformulée et la question
        suivante, générée pour ce savoir, avec ses réponses proposées — ou
        `done` quand le compagnon en sait assez."""
        ...

    def propose_scope(self, ctx: ScopeContext) -> list[ScopeTag]:
        """Les parties possibles du savoir, chacune dans ou hors de ce
        cycle (les bords), **avant** les garde-fous."""
        ...

    def search_resources(self, ctx: ResourcesContext) -> ResourceSearch:
        """Des ressources trouvées par une vraie recherche web, dans l'ordre
        de consommation conseillé, et les URL des résultats de recherche."""
        ...


class Transcriber(Protocol):
    def availability(self) -> Availability: ...

    def transcribe(self, pcm: bytes, hint: str) -> str:
        """Le texte entendu dans un bout d'audio — PCM 16 bits signé,
        petit-boutiste, mono, 16 kHz (`domain/dictation.py`) ; chaîne vide si
        rien. `hint` : du vocabulaire attendu (noms propres, termes
        techniques), et la fin de ce qui a déjà été dit. Appelé à chaque
        passe d'une dictée en direct : une passe doit tenir sous la seconde."""
        ...


def _status(*ports: Availability) -> ActionStatus:
    """Une action est disponible si tous les ports qu'elle demande le sont ; sinon
    elle dit tous les motifs, pour qu'on sache tout ce qu'il manque d'un coup."""
    reasons = [p.reason for p in ports if not p.available and p.reason]
    available = all(p.available for p in ports)
    return ActionStatus(
        available=available,
        reason=None if available else " ".join(reasons) or None,
    )


def companion_status(companion: Companion, transcriber: Transcriber) -> CompanionStatus:
    """L'état des actions du compagnon : la dictée demande les deux ports, les
    autres le seul LLM."""
    llm = companion.availability()
    voice = transcriber.availability()
    return CompanionStatus(
        dictation=_status(voice, llm),
        review=_status(llm),
        ideas=_status(llm),
        reply=_status(llm),
        intention=_status(llm),
        scope=_status(llm),
        resources=_status(llm),
    )
