"""Schémas Pydantic des activités types et de la planification (#37)."""

import uuid
from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, Field, model_validator

from sophia.application.schemas.activity import ActivityProjectRead
from sophia.application.schemas.unit import UnitRead
from sophia.infrastructure.models import Planning

# 0 = lundi … 6 = dimanche.
Weekday = int


def _check_weekdays(weekdays: list[int]) -> list[int]:
    if any(d < 0 or d > 6 for d in weekdays):
        raise ValueError("Un jour va de 0 (lundi) à 6 (dimanche).")
    return sorted(set(weekdays))


class ActivityTypeCreate(BaseModel):
    domain_id: uuid.UUID
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    emoji: str | None = Field(default=None, max_length=16)
    unit_id: uuid.UUID | None = None
    # Le repli du domaine (réglé sur la page domaine, design #51).
    fallback_active: bool = False
    fallback_planning: Planning = Planning.weekly
    fallback_weekdays: list[Weekday] = Field(default_factory=list)

    @model_validator(mode="after")
    def _days(self):
        self.fallback_weekdays = _check_weekdays(self.fallback_weekdays)
        return self


class ActivityTypeUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    emoji: str | None = Field(default=None, max_length=16)
    unit_id: uuid.UUID | None = None
    fallback_active: bool | None = None
    fallback_planning: Planning | None = None
    fallback_weekdays: list[Weekday] | None = None

    @model_validator(mode="after")
    def _days(self):
        if self.fallback_weekdays is not None:
            self.fallback_weekdays = _check_weekdays(self.fallback_weekdays)
        return self


class ActivityTypeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    domain_id: uuid.UUID
    # Les projets qui la planifient (lecture).
    project_ids: list[uuid.UUID]
    title: str
    description: str | None
    emoji: str | None
    unit_id: uuid.UUID | None
    unit: UnitRead | None
    fallback_active: bool
    fallback_planning: Planning
    fallback_weekdays: list[Weekday]
    fallback_posed_until: date | None
    created_at: datetime


class LinkSet(BaseModel):
    """La planification d'une activité type pour un projet."""

    planning: Planning = Planning.weekly
    weekdays: list[Weekday] = Field(default_factory=list)
    # Créneau facultatif : les deux, ou aucun.
    slot_start: time | None = None
    slot_minutes: int | None = Field(default=None, gt=0)
    preserve_after: bool = False
    # Les étapes où le lien est éteint ; vide = actif partout.
    off_step_ids: list[uuid.UUID] = Field(default_factory=list)

    @model_validator(mode="after")
    def _coherent(self):
        self.weekdays = _check_weekdays(self.weekdays)
        if (self.slot_start is None) != (self.slot_minutes is None):
            raise ValueError("Un créneau a une heure et une durée, ou rien.")
        return self


class LinkRead(BaseModel):
    """Une activité type planifiée pour le projet. Titre, emoji et description
    voyagent avec le lien pour que l'écran le nomme sans recharger le domaine."""

    model_config = ConfigDict(from_attributes=True)

    activity_type_id: uuid.UUID
    title: str = Field(validation_alias="type_title")
    emoji: str | None = Field(validation_alias="type_emoji")
    description: str | None = Field(validation_alias="type_description")
    planning: Planning
    weekdays: list[Weekday]
    slot_start: time | None
    slot_minutes: int | None
    preserve_after: bool
    off_step_ids: list[uuid.UUID]
    posed_until: date | None


class PlanningLevel(BaseModel):
    """Jusqu'où le calendrier est posé (`null` : rien de préparé)."""

    posed_until: date | None


class PrepareRequest(BaseModel):
    """Préparer jusqu'à une date ; absent = la semaine en cours."""

    until: date | None = None


class GhostRead(BaseModel):
    """Une occurrence que la planification poserait, pas encore posée."""

    model_config = ConfigDict(from_attributes=True)

    # Nul pour le rituel de semaine, qui n'a pas d'activité type.
    activity_type_id: uuid.UUID | None
    domain_id: uuid.UUID
    title: str
    emoji: str | None
    all_day: bool
    start_at: datetime
    end_at: datetime
    projects: list[ActivityProjectRead]
    # Case du jour quotidienne : la rangée « quotidien ».
    daily: bool
    # Le rituel de semaine (#92) : le lundi de la semaine qu'il préparerait ;
    # nul pour une occurrence d'activité type.
    ritual_week_start: date | None
