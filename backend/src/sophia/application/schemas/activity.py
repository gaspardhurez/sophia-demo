"""Schémas Pydantic exposés par l'API pour les activités (V2 — Exécution)."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from sophia.application.schemas.unit import UnitRead
from sophia.infrastructure.models import ActKind, PracticeNature


class ActivityValueSet(BaseModel):
    """Une valeur déclarée : « 10 » en km. La durée et le nombre ne se
    déclarent pas, ils se lisent sur l'activité."""

    unit_id: uuid.UUID
    value: float


class ActivityValueRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    unit_id: uuid.UUID
    unit: UnitRead
    value: float


class ActivityProjectSet(BaseModel):
    """L'activité compte pour ce projet, à cette étape (facultative)."""

    project_id: uuid.UUID
    step_id: uuid.UUID | None = None


class ActivityProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    project_id: uuid.UUID
    step_id: uuid.UUID | None


class ActivityActSet(BaseModel):
    """Un acte d'apprentissage : ce savoir, dans ce cycle (facultatif), et ce
    qu'on y fait — l'étude, l'interro (d'un cycle), un objet de pratique, ou
    une phase de pratique sans objet (pièce générique, d'un cycle, #107)."""

    model_config = ConfigDict(extra="forbid")

    skill_id: uuid.UUID
    kind: ActKind
    # Le cycle : posé par le geste (le cycle en cours du savoir), jamais déduit.
    plan_id: uuid.UUID | None = None
    # L'objet travaillé — un acte `practice` seulement.
    practice_item_id: uuid.UUID | None = None
    # La phase d'un acte `practice` générique, à la place d'un objet.
    nature: PracticeNature | None = None


class ActivityActRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    skill_id: uuid.UUID
    kind: ActKind
    plan_id: uuid.UUID | None
    practice_item_id: uuid.UUID | None
    # Le nom du savoir, pour le lire sans charger le domaine (l'infobulle de
    # la séance qui porte une interro, #85).
    skill_name: str
    # L'objet de pratique d'un acte `practice` (titre, emoji) ; nuls sinon.
    item_title: str | None
    item_emoji: str | None
    # La phase dite par un acte générique ; nulle sinon.
    nature: PracticeNature | None
    # Le jour où l'interro a été passée (acte `recall`) ; nul sinon.
    passed_on: date | None
    # Le retour d'un acte de pratique (#139) : niveau 1–5 et note ; nuls sinon.
    level: int | None
    feedback: str | None


class ActivityActFeedbackSet(BaseModel):
    """Le retour d'une passe (#139) : un niveau de maîtrise de 1 à 5 et une note
    libre. Il remplace le précédent ; un niveau nul efface le retour."""

    model_config = ConfigDict(extra="forbid")

    level: int | None = Field(default=None, ge=1, le=5)
    feedback: str | None = None


class ActivityAchievementSet(BaseModel):
    """Lier une réalisation à la séance qui la prépare (#92)."""

    model_config = ConfigDict(extra="forbid")

    achievement_id: uuid.UUID


class ActivityAchievementRead(BaseModel):
    """Une réalisation que la séance prépare, lue avec elle."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    emoji: str | None
    done: bool


class ActivityCreate(BaseModel):
    # Un champ inconnu est refusé : un client resté sur `project_id` /
    # `step_id` (avant #37) perdrait son rattachement sans le savoir.
    model_config = ConfigDict(extra="forbid")

    domain_id: uuid.UUID
    # Les projets pour lesquels elle compte (aucun par défaut).
    projects: list[ActivityProjectSet] | None = None
    # Ses actes d'apprentissage (aucun par défaut) ; ensuite, ils s'ajoutent
    # et se retirent un à un (`/activities/{id}/acts`).
    acts: list[ActivityActSet] = Field(default_factory=list)
    activity_type_id: uuid.UUID | None = None
    title: str = Field(min_length=1, max_length=200)
    emoji: str | None = Field(default=None, max_length=16)
    all_day: bool = False
    start_at: datetime | None = None
    end_at: datetime | None = None
    # Au plus une valeur par unité.
    values: list[ActivityValueSet] = Field(default_factory=list)
    done: bool = False
    notes: str | None = None


class ActivityUpdate(BaseModel):
    # Un champ inconnu est refusé : un client resté sur `project_id` /
    # `step_id` (avant #37) perdrait son rattachement sans le savoir.
    model_config = ConfigDict(extra="forbid")

    domain_id: uuid.UUID | None = None
    # Remplace la liste entière ; absent = inchangée.
    projects: list[ActivityProjectSet] | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    emoji: str | None = Field(default=None, max_length=16)
    all_day: bool | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    # Remplace la liste entière ; absent = inchangée.
    values: list[ActivityValueSet] | None = None
    done: bool | None = None
    notes: str | None = None


class ActivitiesMoveSet(BaseModel):
    """Déplacer une sélection : toutes du même décalage (une journée entière
    ignore les minutes)."""

    model_config = ConfigDict(extra="forbid")

    ids: list[uuid.UUID] = Field(min_length=1)
    days: int = 0
    minutes: int = 0


class ActivitiesDeleteSet(BaseModel):
    """Supprimer une sélection."""

    model_config = ConfigDict(extra="forbid")

    ids: list[uuid.UUID] = Field(min_length=1)


class ActivityMergeSet(BaseModel):
    """La séance à fusionner dans celle de l'URL (elle disparaît)."""

    source_id: uuid.UUID


class ActivityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    domain_id: uuid.UUID
    projects: list[ActivityProjectRead] = Field(validation_alias="project_links")
    acts: list[ActivityActRead]
    activity_type_id: uuid.UUID | None
    title: str
    emoji: str | None
    all_day: bool
    start_at: datetime | None
    end_at: datetime | None
    values: list[ActivityValueRead]
    done: bool
    notes: str | None
    # Case du jour d'une activité type quotidienne : la rangée « quotidien ».
    daily: bool
    # Les réalisations que cette séance prépare (#92).
    achievements: list[ActivityAchievementRead]
    # Le jour d'où elle a été reportée (« Reporter »), nul sinon.
    postponed_from: date | None
    # L'activité du rituel de semaine : le lundi de la semaine qu'elle
    # prépare ; nul pour toute autre activité.
    ritual_week_start: date | None
    created_at: datetime
