"""Routes des objets de pratique (V4) — la bibliothèque d'un savoir."""

import uuid

from fastapi import APIRouter, HTTPException, status

from sophia.api.deps import DbSession
from sophia.application import practice as use_cases
from sophia.application.schemas.practice import (
    PracticeItemCreate,
    PracticeItemRead,
    PracticeItemUpdate,
)
from sophia.infrastructure.models import PracticeItem

router = APIRouter(tags=["practice"])


def _get_item_or_404(db: DbSession, item_id: uuid.UUID) -> PracticeItem:
    item = use_cases.get_practice_item(db, item_id)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Objet de pratique introuvable")
    return item


@router.get(
    "/skills/{skill_id}/practice",
    response_model=list[PracticeItemRead],
    operation_id="listPracticeItems",
)
def list_practice_items(skill_id: uuid.UUID, db: DbSession) -> list[PracticeItem]:
    return use_cases.list_practice_items(db, skill_id)


@router.post(
    "/skills/{skill_id}/practice",
    response_model=PracticeItemRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="createPracticeItem",
)
def create_practice_item(
    skill_id: uuid.UUID, payload: PracticeItemCreate, db: DbSession
) -> PracticeItem:
    return use_cases.create_practice_item(db, skill_id, payload)


@router.patch(
    "/practice/{item_id}",
    response_model=PracticeItemRead,
    operation_id="updatePracticeItem",
)
def update_practice_item(
    item_id: uuid.UUID, payload: PracticeItemUpdate, db: DbSession
) -> PracticeItem:
    return use_cases.update_practice_item(db, _get_item_or_404(db, item_id), payload)


@router.delete(
    "/practice/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="deletePracticeItem",
)
def delete_practice_item(item_id: uuid.UUID, db: DbSession) -> None:
    use_cases.delete_practice_item(db, _get_item_or_404(db, item_id))
