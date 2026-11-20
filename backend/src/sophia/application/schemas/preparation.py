"""Schémas Pydantic du rituel de semaine (#91, #92)."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, model_validator

from sophia.application.schemas.activity import ActivityActRead, ActivityRead
from sophia.application.schemas.metric import MetricValueRead
from sophia.application.schemas.project import AchievementRead
from sophia.application.schemas.unit import UnitRead
from sophia.infrastructure.models import (
    MetricDirection,
    PracticeNature,
    WeekPreparationState,
)


class RitualSlot(BaseModel):
    """Le créneau où l'on prévoit de préparer une semaine."""

    model_config = ConfigDict(extra="forbid")

    start_at: datetime
    end_at: datetime

    @model_validator(mode="after")
    def _ordered(self) -> "RitualSlot":
        if self.end_at <= self.start_at:
            raise ValueError("La fin du créneau doit suivre son début.")
        return self


class WeekPreparationReviewRead(BaseModel):
    """Un projet revu pendant le rituel."""

    model_config = ConfigDict(from_attributes=True)

    project_id: uuid.UUID
    reviewed_at: datetime


class WeekPreparationRead(BaseModel):
    """La préparation d'une semaine : la charnière qui valide la semaine
    d'avant (`past_week_start`) et prépare celle-ci (`week_start`). Elle ne
    garde que l'avancement ; le reste est lu ailleurs."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    week_start: date
    past_week_start: date
    state: WeekPreparationState
    started_at: datetime | None
    validated_at: datetime | None
    # L'activité du rituel ; nulle si elle a été supprimée.
    activity_id: uuid.UUID | None
    reviewed: list[WeekPreparationReviewRead]


# --- Un projet pendant le rituel -----------------------------------------


class PrepTotalRead(BaseModel):
    """Un Total du périmètre, sur la semaine écoulée."""

    total_id: uuid.UUID
    # La cible du périmètre : la tranche de l'étape en cours, sinon le Total.
    target: float
    # Le réalisé à la fin de la semaine écoulée (activités faites datées
    # jusqu'au dimanche, plus les non datées), et ce que la semaine a apporté.
    progress: float
    gain: float


class PrepResultPastRead(BaseModel):
    """Un Résultat du périmètre, sur la semaine écoulée."""

    metric_id: uuid.UUID
    name: str
    emoji: str | None
    unit: UnitRead | None
    direction: MetricDirection
    # Le palier de l'étape en cours s'il y en a un, sinon la cible du
    # projet.
    target: float
    # Le meilleur relevé compté de la semaine, de la saison avant elle, et de
    # la saison à sa fin.
    week_best: MetricValueRead | None
    best_before: MetricValueRead | None
    best: MetricValueRead | None
    # De `best_before` à `week_best`, quand la semaine a battu la saison ;
    # nul sinon (jamais de +0).
    delta: float | None
    is_met: bool


class PrepPracticeItemRead(BaseModel):
    """Un objet de pratique qui a bougé ou est en cours."""

    item_id: uuid.UUID
    title: str
    emoji: str | None
    nature: PracticeNature
    # Son premier passage (acte sur une séance faite) tombe dans la semaine.
    started_this_week: bool
    # Commencé et pas encore validé.
    in_progress: bool
    # Validé dans la semaine (`done_at`).
    completed_this_week: bool
    # Les séances faites de la semaine qui l'ont travaillé.
    sessions_this_week: int
    # Le niveau du dernier retour donné dans la semaine (#139), 1–5.
    last_level: int | None
    # Son critère de maîtrise dans le cycle (#157) : `criterion_passes` passes
    # à `criterion_level` ou plus ; `criterion_reached`, celles faites,
    # plafonné — toutes si l'objet est maîtrisé (comme la tuile de phase).
    criterion_passes: int
    criterion_level: int
    criterion_reached: int


class PrepSkillRead(BaseModel):
    """Un savoir du projet, dans l'ordre de la séquence."""

    skill_id: uuid.UUID
    name: str
    level: int  # 0 pas commencé, 1 Étude, 2 Pratique, 3 Mise en situation, 4 acquis
    position: int | None
    # Porté par l'étape en cours (toujours vrai sans étape en cours).
    in_scope: bool
    # Le cycle de ce savoir pour ce projet, s'il y en a un.
    plan_id: uuid.UUID | None
    # Son cycle pour le projet a été terminé (acquis) dans la semaine.
    acquired_this_week: bool
    # Les pièces travaillées dans la semaine, hors objets (#108) : séances
    # faites qui les portent, interros passées.
    study_sessions: int
    recalls_this_week: int
    practice_sessions: int
    application_sessions: int
    # Le niveau du dernier retour de la semaine sur ces pièces génériques (#139).
    practice_last_level: int | None
    application_last_level: int | None
    items: list[PrepPracticeItemRead]


class PrepStepSpanRead(BaseModel):
    """Une étape datée qui croise la semaine, et ses jours dedans (#183)."""

    step_id: uuid.UUID
    title: str
    first_day: date
    last_day: date


class PrepPastRead(BaseModel):
    """La semaine écoulée (N)."""

    week_start: date
    # L'étape qui borne le périmètre de la semaine ; nulle = le projet.
    step_id: uuid.UUID | None
    # Les étapes datées qui croisent la semaine : deux ou plus, on choisit.
    steps: list[PrepStepSpanRead]
    totals: list[PrepTotalRead]
    results: list[PrepResultPastRead]
    # Les réalisations du périmètre cochées dans la semaine.
    achievements: list[AchievementRead]
    learning: list[PrepSkillRead]
    # Les activités de la semaine liées au projet.
    done_activities: list[ActivityRead]
    missed_activities: list[ActivityRead]


class PrepResultNextRead(BaseModel):
    """Un Résultat du périmètre, pour la semaine qui vient."""

    metric_id: uuid.UUID
    name: str
    emoji: str | None
    unit: UnitRead | None
    direction: MetricDirection
    target: float
    # L'échéance de la cible : celle de l'étape en cours, sinon du projet.
    # Nulle sans échéance (projet sans fin, #196).
    deadline: date | None
    # La meilleure valeur comptée de la saison — d'où part la suggestion.
    current: MetricValueRead | None
    # La cible suggérée pour la semaine (`domain.preparation.suggest_week_target`).
    suggestion: float | None
    # Les cibles déjà posées : relevés non comptés sur des séances de la
    # semaine (leur `activity_id` désigne la séance).
    targets: list[MetricValueRead]


class PrepActRead(BaseModel):
    """Un acte d'apprentissage posé sur une séance de la semaine."""

    activity_id: uuid.UUID
    act: ActivityActRead


class PrepNextRead(BaseModel):
    """La semaine qui vient (N+1)."""

    week_start: date
    step_id: uuid.UUID | None
    steps: list[PrepStepSpanRead]
    # Les savoirs de l'étape de la semaine ; nul = ceux du projet.
    skill_ids: list[uuid.UUID] | None
    results: list[PrepResultNextRead]
    # Les réalisations du périmètre liées à une séance de la semaine (leurs
    # séances dans `activities`).
    achievements: list[AchievementRead]
    # Les actes posés sur les séances de la semaine liées au projet, pour
    # ses savoirs.
    acts: list[PrepActRead]
    activities: list[ActivityRead]


class PreparationProjectRead(BaseModel):
    """Un projet pendant le rituel : la semaine écoulée et celle qui vient,
    chacune sur le périmètre de son étape (#91, #183)."""

    project_id: uuid.UUID
    past: PrepPastRead
    next: PrepNextRead
