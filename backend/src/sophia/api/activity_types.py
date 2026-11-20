"""Endpoints REST des activités types (#37) — ce qu'on fait, au niveau du domaine.

Leur planification pour un projet se règle côté projet
(`/projects/{id}/activity-types/{type_id}`) ; ici, l'activité type elle-même
et son repli du domaine.
"""

import uuid

from fastapi import APIRouter, HTTPException, status

from sophia.api.deps import DbSession
from sophia.application import activity_types as use_cases
from sophia.application import domains as domain_use_cases
from sophia.application.schemas.activity_type import (
    ActivityTypeCreate,
    ActivityTypeRead,
    ActivityTypeUpdate,
)
from sophia.infrastructure.models import ActivityType

router = APIRouter(tags=["activity-types"])


def _get_or_404(db: DbSession, type_id: uuid.UUID) -> ActivityType:
    activity_type = use_cases.get_activity_type(db, type_id)
    if activity_type is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Activité type introuvable")
    return activity_type


@router.get(
    "/activity-types",
    response_model=list[ActivityTypeRead],
    operation_id="listActivityTypes",
)
def list_activity_types(
    db: DbSession, domain_id: uuid.UUID | None = None
) -> list[ActivityType]:
    return use_cases.list_activity_types(db, domain_id)


@router.post(
    "/activity-types",
    response_model=ActivityTypeRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="createActivityType",
)
def create_activity_type(payload: ActivityTypeCreate, db: DbSession) -> ActivityType:
    if domain_use_cases.get_domain(db, payload.domain_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Domaine introuvable")
    return use_cases.create_activity_type(db, payload)


@router.get(
    "/activity-types/{activity_type_id}",
    response_model=ActivityTypeRead,
    operation_id="getActivityType",
)
def get_activity_type(activity_type_id: uuid.UUID, db: DbSession) -> ActivityType:
    return _get_or_404(db, activity_type_id)


@router.patch(
    "/activity-types/{activity_type_id}",
    response_model=ActivityTypeRead,
    operation_id="updateActivityType",
)
def update_activity_type(
    activity_type_id: uuid.UUID, payload: ActivityTypeUpdate, db: DbSession
) -> ActivityType:
    return use_cases.update_activity_type(
        db, _get_or_404(db, activity_type_id), payload
    )


@router.delete(
    "/activity-types/{activity_type_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="deleteActivityType",
)
def delete_activity_type(activity_type_id: uuid.UUID, db: DbSession) -> None:
    """Supprime l'activité type : ses occurrences restent, sans type ; les
    Totaux qui ne comptaient qu'elle sont supprimés."""
    use_cases.delete_activity_type(db, _get_or_404(db, activity_type_id))
