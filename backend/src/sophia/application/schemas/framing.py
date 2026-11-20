"""Schémas de « Cadrer l'étude » (#175) : les propositions du compagnon pour
les trois temps. Rien n'est écrit par ces routes : l'intention et le périmètre
s'écrivent par `PATCH /plans/{id}`, les préférences par `PATCH /domains/{id}`,
les ressources par les routes du cycle."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from sophia.domain.framing import MAX_GENERATED_QUESTIONS


class IntentionExchange(BaseModel):
    """Un échange du chat : la question de Sophia, la réponse envoyée
    (pastilles choisies et texte libre, telles qu'envoyées)."""

    question: str = Field(max_length=500)
    answer: str = Field(min_length=1, max_length=4000)


class IntentionRequest(BaseModel):
    """Les échanges depuis l'ouverture (vides : la question d'ouverture), et
    l'intention dont on part — celle du cycle, ou le brouillon courant."""

    turns: list[IntentionExchange] = Field(
        default_factory=list, max_length=MAX_GENERATED_QUESTIONS + 1
    )
    intention: str | None = Field(default=None, max_length=1000)


class IntentionReply(BaseModel):
    """Le tour suivant. `question` : la question à poser (l'ouverture, fixe,
    quand il n'y a pas d'échange) ; nulle quand `done`. `suggestions` : des
    réponses proposées, courtes (5 au plus ; aucune quand `done`).
    `intention` : le brouillon reformulé d'après les réponses (200
    caractères au plus), ou celui reçu tant qu'il n'y a pas de réponse."""

    model_config = ConfigDict(from_attributes=True)

    question: str | None
    suggestions: list[str]
    intention: str | None
    done: bool


class ScopeRequest(BaseModel):
    """L'intention de l'écran ; nulle, celle du cycle."""

    intention: str | None = Field(default=None, max_length=1000)


class ScopeTagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    #: La partie, courte (60 caractères au plus, sans « ; »).
    label: str
    #: Proposée dans ce cycle (cochée) ; sinon un bord, hors de ce cycle.
    in_cycle: bool


class ScopeProposal(BaseModel):
    """Les parties possibles du savoir, 10 au plus ; vide : rien à proposer."""

    tags: list[ScopeTagRead]


class ResourcesRequest(BaseModel):
    """Les préférences de l'écran (nulles : celles gardées au domaine), et
    les liens à ne pas reproposer — déjà ajoutés, déjà proposés."""

    preferences: str | None = Field(default=None, max_length=2000)
    exclude: list[str] = Field(default_factory=list, max_length=200)


class ResourceProposalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    title: str
    #: Un lien tiré des résultats de la recherche web, jamais inventé.
    url: str
    author: str | None
    #: Pourquoi s'y fier, court (« coachs de joueurs du circuit pro »).
    why_trust: str
    kind: Literal["video", "text"] | None
    #: En clair : « 14 min », « 8 min de lecture ».
    duration: str | None
    #: En clair : « mars 2025 ».
    date: str | None
    #: Ce qu'elle couvre du périmètre (« Placement, Frappe »).
    covers: str | None


class ResourceProposals(BaseModel):
    """Jusqu'à 8 ressources, dans l'ordre de consommation conseillé ; vide :
    rien de solide."""

    resources: list[ResourceProposalRead]
