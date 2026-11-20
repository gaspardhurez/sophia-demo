"""Schémas Pydantic exposés par l'API pour les projets.

Le lien aux compétences passe par `skill_ids` (liste plate) : à la création, et
via l'endpoint dédié `set` en édition. Le PATCH générique ne touche qu'aux
champs scalaires.
"""

import uuid
from datetime import date, datetime

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from sophia.application.schemas.activity_type import LinkRead
from sophia.application.schemas.unit import UnitRead
from sophia.infrastructure.models import STORED_STATUSES, ProjectStatus, TotalMode


def _stored(status: ProjectStatus | None) -> ProjectStatus | None:
    """Seules les décisions s'écrivent : À faire, la coche « À la main »,
    l'abandon. En cours et Raté se lisent sur la période (design #32)."""
    if status is not None and status not in STORED_STATUSES:
        raise ValueError(
            "Le statut s'écrit todo, achieved ou abandoned ; "
            "en cours et raté se déduisent de la période"
        )
    return status


def _ordered(start: date | None, due: date | None) -> None:
    if start is not None and due is not None and start > due:
        raise ValueError("Le début doit précéder la fin")


class ProjectCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    # Nul : celui du domaine principal.
    emoji: str | None = Field(default=None, max_length=16)
    description: str | None = None
    precisions: str | None = None
    status: ProjectStatus = ProjectStatus.todo
    # La période : le début est obligatoire (design #32) ; une fin nulle,
    # c'est un projet sans fin (#196). Les Totaux se déclarent à part
    # (`POST /projects/{id}/totals`).
    start_at: date
    due_at: date | None
    skill_ids: list[uuid.UUID] = Field(default_factory=list)
    # Les domaines secondaires (#203), dans l'ordre : le principal est celui
    # de l'adresse. Les savoirs liés peuvent être de chacun.
    secondary_domain_ids: list[uuid.UUID] = Field(default_factory=list)

    _status = field_validator("status")(_stored)

    @model_validator(mode="after")
    def _period(self) -> "ProjectCreate":
        _ordered(self.start_at, self.due_at)
        return self


class ProjectUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    # Nul : revenir à celui du domaine principal.
    emoji: str | None = Field(default=None, max_length=16)
    description: str | None = None
    precisions: str | None = None
    status: ProjectStatus | None = None
    # Omises, elles ne bougent pas. Le début ne s'efface jamais (design #32) ;
    # une fin nulle retire la fin (#196).
    start_at: date | None = None
    due_at: date | None = None

    _status = field_validator("status")(_stored)

    @model_validator(mode="after")
    def _period(self) -> "ProjectUpdate":
        if "start_at" in self.model_fields_set and self.start_at is None:
            raise ValueError("Le début est obligatoire")
        _ordered(self.start_at, self.due_at)
        return self


class AchievementCreate(BaseModel):
    """Une **Réalisation** à déclarer : ce que le projet s'engage à avoir fait."""

    title: str = Field(min_length=1, max_length=200)
    emoji: str | None = Field(default=None, max_length=16)


class AchievementUpdate(BaseModel):
    """Renommage, emoji — et la coche, qui est le geste courant."""

    title: str | None = Field(default=None, min_length=1, max_length=200)
    emoji: str | None = Field(default=None, max_length=16)
    done: bool | None = None
    # Distribution : l'étape où cette réalisation doit être faite. `null`
    # explicite = on la retire du plan sans la retirer des conditions.
    step_id: uuid.UUID | None = None


class AchievementActivityRead(BaseModel):
    """Une séance qui prépare la réalisation (#92)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    emoji: str | None
    all_day: bool
    start_at: datetime | None
    end_at: datetime | None
    done: bool


class AchievementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    step_id: uuid.UUID | None
    title: str
    emoji: str | None
    done: bool
    done_at: datetime | None
    created_at: datetime
    # Les séances liées, dans l'ordre du calendrier. Les lier ne coche rien.
    activities: list[AchievementActivityRead]


class StepMetricSet(BaseModel):
    """Distribue un résultat à une étape, avec son palier éventuel."""

    metric_id: uuid.UUID
    # `null` = pas de palier : l'étape situe le travail sans poser d'engagement
    # intermédiaire, et ce lien ne la conditionne pas.
    target: float | None = None


class StepMetricRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    metric_id: uuid.UUID
    target: float | None
    # N'a de sens qu'avec un palier (cf. `StepMetric.is_met`).
    is_met: bool


class TotalCreate(BaseModel):
    """Déclare un Total. Le mode dit comment il compte ; l'unité n'a de sens
    qu'en mode `value`. Ni activité type ni séances d'apprentissage = toutes
    les activités liées au projet."""

    mode: TotalMode
    unit_id: uuid.UUID | None = None
    target: float = Field(gt=0)
    activity_type_ids: list[uuid.UUID] = Field(default_factory=list)
    learning_sessions: bool = False


class TotalUpdate(BaseModel):
    """Modifie un Total. Vérifié sur l'état résultant, comme à la création."""

    mode: TotalMode | None = None
    unit_id: uuid.UUID | None = None
    target: float | None = Field(default=None, gt=0)
    activity_type_ids: list[uuid.UUID] | None = None
    learning_sessions: bool | None = None
    # Le mot qui remplace « fois » (#58), au nombre seulement. `null` (ou vide)
    # efface : « Revenir à « fois » » les envoie tous les trois à `null`.
    count_name: str | None = Field(default=None, max_length=30)
    count_plural: str | None = Field(default=None, max_length=30)
    count_emoji: str | None = Field(default=None, max_length=16)


class TotalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    mode: TotalMode
    # Toujours présente dans le contrat, `null` hors mode `value`.
    unit: UnitRead | None
    target: float
    # Ni l'un ni l'autre = toutes les activités liées au projet.
    activity_type_ids: list[uuid.UUID]
    learning_sessions: bool
    # Le mot du Total au nombre (#58) : formes brutes (`null` = « fois », ou
    # pluriel par défaut) et pluriel résolu.
    count_name: str | None
    count_plural: str | None
    count_effective_plural: str | None
    count_emoji: str | None
    position: int
    progress: float  # réalisé : valeurs, heures ou nombre d'activités faites
    is_met: bool


class StepTotalSet(BaseModel):
    """Confie à une étape une tranche d'un Total de son projet."""

    total_id: uuid.UUID
    target: float = Field(gt=0)


class StepTotalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total_id: uuid.UUID
    target: float
    progress: float  # réalisé du Total sur les activités de l'étape
    is_met: bool


class ProjectDomainsSet(BaseModel):
    """Remplace les domaines du projet (#203), dans l'ordre : le premier est
    le principal. Un domaine retiré délie ce qui en vient (`ProjectDomainTies`)."""

    domain_ids: list[uuid.UUID]


class NamedRef(BaseModel):
    """Un objet nommé, pour l'énumérer."""

    id: uuid.UUID
    title: str


class ProjectDomainTies(BaseModel):
    """Ce qui lie un projet à un de ses domaines (#203) : ce qu'il perd quand
    le domaine le quitte — retiré du projet, ou supprimé. Les savoirs visés
    (et leurs cycles pour ce projet), les activités types planifiées (et les
    Totaux qui ne comptaient qu'elles), les Résultats sur ses métriques, et
    les liens de ses activités au projet."""

    skills: list[NamedRef]
    activity_types: list[NamedRef]
    results: list[NamedRef]
    activities: int


class ProjectSkillsSet(BaseModel):
    """Remplace l'ensemble des compétences liées à un projet."""

    skill_ids: list[uuid.UUID] = Field(default_factory=list)


class ProjectStepCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    skill_ids: list[uuid.UUID] = Field(default_factory=list)
    start_at: date | None = None
    due_at: date | None = None

    @model_validator(mode="after")
    def _period(self) -> "ProjectStepCreate":
        _ordered(self.start_at, self.due_at)
        return self


class ProjectStepUpdate(BaseModel):
    """L'ordre ne s'écrit pas ici : il se change pour toutes les étapes à la
    fois (`PUT /projects/{id}/steps/order`), qui garde les rangs uniques et
    la séquence alignée."""

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    # Coche manuelle (n'a d'effet que sur un jalon : rien d'assigné).
    done: bool | None = None
    start_at: date | None = None
    due_at: date | None = None

    @model_validator(mode="before")
    @classmethod
    def _no_order(cls, data: object) -> object:
        if isinstance(data, dict) and "order" in data:
            raise ValueError(
                "L'ordre des étapes se change par PUT /projects/{id}/steps/order"
            )
        return data

    @model_validator(mode="after")
    def _period(self) -> "ProjectStepUpdate":
        _ordered(self.start_at, self.due_at)
        return self


class StepSkillsSet(BaseModel):
    """Remplace l'ensemble des compétences liées à une étape."""

    skill_ids: list[uuid.UUID] = Field(default_factory=list)


class StepsReorder(BaseModel):
    """Nouvel ordre des étapes : la liste complète des ids, dans l'ordre voulu."""

    step_ids: list[uuid.UUID] = Field(min_length=1)


class SequenceSegment(BaseModel):
    """Une coupe de la séquence : les savoirs d'une étape, dans l'ordre.
    `step_id` nul : la séquence à plat d'un projet sans étapes."""

    step_id: uuid.UUID | None = None
    skill_ids: list[uuid.UUID]


class SequenceWrite(BaseModel):
    """La séquence entière. Ce qu'elle ne range pas est hors séquence."""

    segments: list[SequenceSegment]


class ProjectStepRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    description: str | None
    order: int
    done: bool  # effectif : tout ce qui lui est assigné, ou la coche si rien
    # Jalon : rien d'assigné, donc c'est la coche qui tranche. L'écran s'en
    # sert pour n'offrir la coche que là où elle a un effet.
    is_manual: bool
    skill_ids: list[uuid.UUID]
    start_at: date | None
    due_at: date | None
    # Ce que l'étape distribue, en plus de ses compétences.
    totals: list[StepTotalRead]
    metrics: list[StepMetricRead]


class LearningSkillRead(BaseModel):
    """Un savoir visé et son niveau — un carré de la mosaïque (design #27)."""

    skill_id: uuid.UUID
    name: str
    level: int  # 0 pas commencé, 1 Étude, 2 Pratique, 3 Application, 4 acquis
    # Rang dans la séquence d'acquisition ; nul = hors séquence.
    position: int | None


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    # Ses domaines (#203), le principal en tête : il donne au projet sa
    # couleur, et le projet part avec lui.
    domain_ids: list[uuid.UUID]
    title: str
    # Choisi par l'utilisateur ; nul, l'écran prend celui du domaine principal.
    emoji: str | None
    description: str | None
    precisions: str | None
    # Statut EFFECTIF : dérivé des cibles dès que le projet s'en fixe, saisi à
    # la main sinon (cf. `Project.effective_status`). L'abandon reste une
    # écriture, via un PATCH `status = abandoned`.
    status: ProjectStatus = Field(validation_alias="effective_status")
    # Le statut tel qu'il est STOCKÉ — le client en a besoin pour savoir si
    # le projet a été abandonné, ce que le statut effectif ne distingue pas
    # d'un échec aux cibles.
    manual_status: ProjectStatus = Field(validation_alias="status")
    # Le projet s'est-il fixé des cibles ? Décide si l'UI propose les boutons
    # « atteint / raté » (à la main) ou seulement « abandonner ».
    is_tracked: bool
    # Tous les objectifs remplis. Sur un projet sans fin, constaté sans
    # clore : l'en-tête propose « Valider » (#197).
    targets_met: bool
    # Les Totaux, dans leur ordre d'affichage.
    totals: list[TotalRead]
    # Les activités types planifiées pour le projet (#37).
    activity_types: list[LinkRead]
    start_at: date
    # La fin prévue ; nulle, pas de fin (#196).
    due_at: date | None
    # La fin constatée : le jour d'une clôture à la main (#196).
    ended_at: date | None
    achieved_at: datetime | None
    created_at: datetime
    skill_ids: list[uuid.UUID]
    direct_skill_ids: list[uuid.UUID]
    # Les savoirs visés, avec leur niveau (mosaïque de l'objectif Apprentissage).
    learning: list[LearningSkillRead]
    steps: list[ProjectStepRead]
    # Les réalisations voyagent AVEC le projet : elles n'existent que pour
    # lui, contrairement aux résultats visés qui pointent des métriques du
    # domaine et se lisent par un appel dédié.
    achievements: list[AchievementRead]
