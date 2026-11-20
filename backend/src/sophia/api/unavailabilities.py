"""Routes des indisponibilités du calendrier (#105)."""

import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, status

from sophia.api.deps import DbSession
from sophia.application import unavailabilities as use_cases
from sophia.application.schemas.unavailability import (
    UnavailabilityCreate,
    UnavailabilityRead,
    UnavailabilitySlotCreate,
    UnavailabilitySlotUpdate,
    UnavailabilityUpdate,
)
from sophia.infrastructure.models import Unavailability, UnavailabilitySlot

router = APIRouter(tags=["unavailabilities"])


def _get_or_404(db: DbSession, unavailability_id: uuid.UUID) -> Unavailability:
    u = use_cases.get_unavailability(db, unavailability_id)
    if u is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Indisponibilité introuvable")
    return u


def _slot_or_404(u: Unavailability, slot_id: uuid.UUID) -> UnavailabilitySlot:
    slot = use_cases.get_slot(u, slot_id)
    if slot is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Créneau bloqué introuvable")
    return slot


@router.get(
    "/unavailabilities",
    response_model=list[UnavailabilityRead],
    operation_id="listUnavailabilities",
)
def list_unavailabilities(
    start: datetime, end: datetime, db: DbSession
) -> list[Unavailability]:
    """Celles qui touchent la fenêtre `[start, end[`."""
    return use_cases.list_unavailabilities(db, start, end)


@router.post(
    "/unavailabilities",
    response_model=UnavailabilityRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="createUnavailability",
)
def create_unavailability(
    payload: UnavailabilityCreate, db: DbSession
) -> Unavailability:
    return use_cases.create_unavailability(db, payload)


@router.patch(
    "/unavailabilities/{unavailability_id}",
    response_model=UnavailabilityRead,
    operation_id="updateUnavailability",
)
def update_unavailability(
    unavailability_id: uuid.UUID, payload: UnavailabilityUpdate, db: DbSession
) -> Unavailability:
    return use_cases.update_unavailability(
        db, _get_or_404(db, unavailability_id), payload
    )


@router.delete(
    "/unavailabilities/{unavailability_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="deleteUnavailability",
)
def delete_unavailability(unavailability_id: uuid.UUID, db: DbSession) -> None:
    use_cases.delete_unavailability(db, _get_or_404(db, unavailability_id))


@router.post(
    "/unavailabilities/{unavailability_id}/slots",
    response_model=UnavailabilityRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="addUnavailabilitySlot",
)
def add_slot(
    unavailability_id: uuid.UUID, payload: UnavailabilitySlotCreate, db: DbSession
) -> Unavailability:
    return use_cases.add_slot(db, _get_or_404(db, unavailability_id), payload)


@router.patch(
    "/unavailabilities/{unavailability_id}/slots/{slot_id}",
    response_model=UnavailabilityRead,
    operation_id="updateUnavailabilitySlot",
)
def update_slot(
    unavailability_id: uuid.UUID,
    slot_id: uuid.UUID,
    payload: UnavailabilitySlotUpdate,
    db: DbSession,
) -> Unavailability:
    u = _get_or_404(db, unavailability_id)
    return use_cases.update_slot(db, u, _slot_or_404(u, slot_id), payload)


@router.delete(
    "/unavailabilities/{unavailability_id}/slots/{slot_id}",
    response_model=UnavailabilityRead,
    operation_id="removeUnavailabilitySlot",
)
def remove_slot(
    unavailability_id: uuid.UUID, slot_id: uuid.UUID, db: DbSession
) -> Unavailability:
    u = _get_or_404(db, unavailability_id)
    return use_cases.remove_slot(db, u, _slot_or_404(u, slot_id))
