"""Endpoints du rituel de semaine (#91, #92) : la préparation d'une semaine,
désignée par son lundi (la semaine préparée, N+1)."""

import uuid
from datetime import date

from fastapi import APIRouter, HTTPException, status

from sophia.api.deps import DbSession
from sophia.application import preparations as use_cases
from sophia.application.planning import posing
from sophia.application.schemas.preparation import (
    PreparationProjectRead,
    RitualSlot,
    WeekPreparationRead,
)
from sophia.domain.preparation import check_monday
from sophia.infrastructure.models import Project, WeekPreparation

router = APIRouter(prefix="/preparations", tags=["preparations"])


def _get_or_404(db: DbSession, week_start: date) -> WeekPreparation:
    check_monday(week_start)
    prep = use_cases.get_preparation(db, week_start)
    if prep is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Préparation introuvable")
    return prep


def _project_or_404(db: DbSession, project_id: uuid.UUID) -> Project:
    project = use_cases.get_project(db, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Projet introuvable")
    return project


@router.get(
    "/{week_start}",
    response_model=WeekPreparationRead,
    operation_id="getWeekPreparation",
)
def get_preparation(week_start: date, db: DbSession) -> WeekPreparation:
    """La préparation de la semaine qui commence ce lundi ; 404 si son rituel
    n'a été ni posé ni démarré."""
    return _get_or_404(db, week_start)


@router.post(
    "/{week_start}/start",
    response_model=WeekPreparationRead,
    operation_id="startWeekPreparation",
)
def start_preparation(week_start: date, db: DbSession) -> WeekPreparation:
    """Démarrer : pose la semaine jusqu'à son dimanche (jamais dans le passé)
    et crée la préparation si elle manque. Idempotent."""
    return use_cases.start_preparation(db, week_start)


@router.post(
    "/{week_start}/activity",
    response_model=WeekPreparationRead,
    operation_id="planWeekPreparationActivity",
)
def plan_ritual(week_start: date, slot: RitualSlot, db: DbSession) -> WeekPreparation:
    """Planifier un créneau pour préparer la semaine : l'activité du rituel,
    posée à la main. 422 si la préparation a déjà la sienne."""
    return use_cases.plan_ritual(db, week_start, slot.start_at, slot.end_at)


@router.post(
    "/{week_start}/projects/{project_id}/pose",
    response_model=PreparationProjectRead,
    operation_id="poseWeekPreparationProject",
)
def pose_project(week_start: date, project_id: uuid.UUID, db: DbSession) -> dict:
    """Poser les séances d'un projet pour la semaine (ses activités types
    jusqu'au dimanche) — en ouvrant sa semaine prochaine. Idempotent ; rend sa
    lecture pour la préparation."""
    with posing:
        project = _project_or_404(db, project_id)
        use_cases.pose_project(db, week_start, project)
    db.refresh(project)
    return use_cases.project_week(db, week_start, project)


@router.put(
    "/{week_start}/projects/{project_id}/reviewed",
    response_model=WeekPreparationRead,
    operation_id="markProjectReviewed",
)
def mark_reviewed(
    week_start: date, project_id: uuid.UUID, db: DbSession
) -> WeekPreparation:
    """Marquer un projet comme revu. Idempotent."""
    prep = _get_or_404(db, week_start)
    return use_cases.set_reviewed(db, prep, _project_or_404(db, project_id), True)


@router.delete(
    "/{week_start}/projects/{project_id}/reviewed",
    response_model=WeekPreparationRead,
    operation_id="unmarkProjectReviewed",
)
def unmark_reviewed(
    week_start: date, project_id: uuid.UUID, db: DbSession
) -> WeekPreparation:
    """Démarquer un projet revu. Idempotent."""
    prep = _get_or_404(db, week_start)
    return use_cases.set_reviewed(db, prep, _project_or_404(db, project_id), False)


@router.post(
    "/{week_start}/validate",
    response_model=WeekPreparationRead,
    operation_id="validateWeekPreparation",
)
def validate_preparation(week_start: date, db: DbSession) -> WeekPreparation:
    """Valider la préparation : l'activité du rituel passe faite et se
    déplace au jour de la validation (recréée si elle a été supprimée)."""
    check_monday(week_start)
    with posing:
        return use_cases.validate_preparation(db, week_start)


@router.get(
    "/{week_start}/projects/{project_id}",
    response_model=PreparationProjectRead,
    operation_id="getPreparationProject",
)
def get_preparation_project(
    week_start: date,
    project_id: uuid.UUID,
    db: DbSession,
    past_step: uuid.UUID | None = None,
    next_step: uuid.UUID | None = None,
) -> dict:
    """Un projet pendant le rituel : la semaine écoulée et celle qui vient,
    chacune sur le périmètre de son étape — `past_step` / `next_step` pour en
    choisir une autre parmi celles qui croisent la semaine (#183). Lecture
    seule ; ne demande pas que la préparation existe."""
    return use_cases.project_week(
        db,
        week_start,
        _project_or_404(db, project_id),
        past_step,
        next_step,
    )
