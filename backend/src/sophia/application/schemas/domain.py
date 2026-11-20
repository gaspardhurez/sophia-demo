"""Schémas Pydantic exposés par l'API pour les domaines."""

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from sophia.application.schemas.project import ProjectDomainTies
from sophia.application.schemas.unit import UnitRead
from sophia.infrastructure.models import DomainStatus

# Palette curée des couleurs de domaine (miroir de la palette front). Stockée en
# clé nommée pour garder les variantes tailwind (douce/pleine/dark).
DomainColor = Literal[
    "emerald",
    "teal",
    "sky",
    "blue",
    "violet",
    "fuchsia",
    "rose",
    "amber",
    "orange",
    "lime",
]


class DomainCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    emoji: str | None = Field(default=None, max_length=16)
    # Absente : la suivante dans l'ordre de la palette (cf. `create_domain`).
    color: DomainColor | None = None
    vision: str | None = None


class DomainUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    emoji: str | None = Field(default=None, max_length=16)
    color: DomainColor | None = None
    vision: str | None = None
    status: DomainStatus | None = None
    # Préférences de ressources (#175) ; vide ou blanc : effacées.
    resource_preferences: str | None = Field(default=None, max_length=2000)

    @field_validator("resource_preferences")
    @classmethod
    def _blank_preferences(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None

    @field_validator("color")
    @classmethod
    def _color_stays(cls, value: DomainColor | None) -> DomainColor:
        # Absente = inchangée ; un domaine ne perd pas sa couleur.
        if value is None:
            raise ValueError("Un domaine a toujours une couleur.")
        return value


class DomainRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    emoji: str | None
    color: str | None
    vision: str | None
    # Les préférences de ressources (format, sources), gardées par domaine
    # (#175) : pré-remplies au cadrage de l'étude du savoir suivant.
    resource_preferences: str | None
    status: DomainStatus
    # Le domaine système (« Sophia ») : celui de l'app, sans réglage.
    system: bool
    created_at: datetime
    updated_at: datetime


class UnlinkedProject(BaseModel):
    """Un projet délié par la suppression d'un de ses domaines secondaires :
    les domaines qui lui restent, et ce qu'il perd."""

    id: uuid.UUID
    title: str
    remaining_domain_ids: list[uuid.UUID]
    loses: ProjectDomainTies


class DomainUsage(BaseModel):
    """Ce qu'une suppression de domaine emporterait — pour l'annoncer avant
    (design #51). Chaque objet part avec ce qui en dépend (cycles et exercices
    d'un savoir, objectifs et étapes d'un projet, valeurs et relevés d'une
    activité, relevés d'une métrique) : la modale le dit en toutes lettres, elle
    ne compte que les objets eux-mêmes."""

    skills: int
    # Les projets dont il est le principal : ils partent.
    projects: int
    activities: int
    activity_types: int
    metrics: int
    # Ceux dont il est secondaire (#203) : déliés, pas supprimés.
    unlinked: list[UnlinkedProject]


class DomainCounter(BaseModel):
    """Un compteur du domaine : ce qui a été fait, cumulé depuis toujours.

    Un par unité déclarée par ses activités faites, plus les heures lues au
    calendrier (`unit` nul). Il n'existe qu'à partir de la première valeur.
    """

    # Nulle : les heures.
    unit: UnitRead | None
    total: float
    # Dont l'année en cours — ce que montre le survol.
    year_total: float
    since: date
