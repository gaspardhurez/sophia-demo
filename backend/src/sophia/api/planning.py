"""Endpoints de la planification (#37) : préparer, savoir jusqu'où c'est posé,
voir au-delà (les fantômes)."""

from datetime import date

from fastapi import APIRouter

from sophia.api.deps import DbSession
from sophia.application import planning as use_cases
from sophia.application.schemas.activity_type import (
    GhostRead,
    PlanningLevel,
    PrepareRequest,
)

router = APIRouter(tags=["planning"])


@router.get(
    "/planning/level", response_model=PlanningLevel, operation_id="getPlanningLevel"
)
def get_level(db: DbSession) -> PlanningLevel:
    return PlanningLevel(posed_until=use_cases.level(db))


@router.post(
    "/planning/prepare", response_model=PlanningLevel, operation_id="preparePlanning"
)
def prepare(payload: PrepareRequest, db: DbSession) -> PlanningLevel:
    """Pose jusqu'à `until`, ou la semaine en cours sans date — ce qu'appelle
    l'app à son ouverture. Idempotent : rien n'est posé deux fois."""
    with use_cases.posing:
        if payload.until is None:
            use_cases.prepare_current_week(db)
        else:
            use_cases.prepare_until(db, payload.until)
        return PlanningLevel(posed_until=use_cases.level(db))


@router.get(
    "/planning/preview", response_model=list[GhostRead], operation_id="previewPlanning"
)
def preview(db: DbSession, start: date, end: date) -> list[use_cases.Ghost]:
    """Ce que la planification poserait sur [start, end[ au-delà de ce qui est
    posé, sans rien écrire."""
    return use_cases.preview(db, start, end)
