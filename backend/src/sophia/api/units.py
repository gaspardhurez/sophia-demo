"""Endpoints REST du référentiel d'unités."""

import uuid

from fastapi import APIRouter, HTTPException, status

from sophia.api.deps import DbSession
from sophia.application import units as use_cases
from sophia.application.schemas.unit import (
    UnitCreate,
    UnitRead,
    UnitUpdate,
    UnitUsage,
)
from sophia.infrastructure.models import Unit

router = APIRouter(tags=["units"])


def _get_unit_or_404(db: DbSession, unit_id: uuid.UUID) -> Unit:
    unit = use_cases.get_unit(db, unit_id)
    if unit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unité introuvable")
    return unit


@router.get("/units", response_model=list[UnitRead], operation_id="listUnits")
def list_units(db: DbSession) -> list[Unit]:
    return use_cases.list_units(db)


@router.post(
    "/units",
    response_model=UnitRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="createUnit",
)
def create_unit(payload: UnitCreate, db: DbSession) -> Unit:
    return use_cases.create_unit(db, payload)


@router.patch("/units/{unit_id}", response_model=UnitRead, operation_id="updateUnit")
def update_unit(unit_id: uuid.UUID, payload: UnitUpdate, db: DbSession) -> Unit:
    return use_cases.update_unit(db, _get_unit_or_404(db, unit_id), payload)


@router.get(
    "/units/{unit_id}/usage",
    response_model=UnitUsage,
    operation_id="getUnitUsage",
)
def get_unit_usage(unit_id: uuid.UUID, db: DbSession) -> UnitUsage:
    """Ce qu'une suppression toucherait — sert à l'annoncer dans l'UI."""
    return use_cases.unit_usage(db, _get_unit_or_404(db, unit_id))


@router.delete(
    "/units/{unit_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="deleteUnit",
)
def delete_unit(
    unit_id: uuid.UUID, db: DbSession, replace_by: uuid.UUID | None = None
) -> None:
    """Supprime l'unité. `replace_by` bascule d'abord tout ce qui l'emploie
    vers une autre unité ; sans lui, Totaux et valeurs partent avec elle."""
    replacement = _get_unit_or_404(db, replace_by) if replace_by else None
    use_cases.delete_unit(db, _get_unit_or_404(db, unit_id), replacement)
