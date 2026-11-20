"""Routes des notes d'un savoir (design #79, #88) — le document et ses questions."""

import uuid

from fastapi import APIRouter, HTTPException, status

from sophia.api.deps import DbSession
from sophia.application import notes as use_cases
from sophia.application.schemas.notes import (
    NoteQuestionCreate,
    NoteQuestionRead,
    NoteQuestionUpdate,
    NotesRead,
    NotesWrite,
)
from sophia.infrastructure.models import NoteQuestion

router = APIRouter(tags=["notes"])


def _get_question_or_404(db: DbSession, question_id: uuid.UUID) -> NoteQuestion:
    question = use_cases.get_question(db, question_id)
    if question is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Question introuvable")
    return question


@router.get(
    "/skills/{skill_id}/notes", response_model=NotesRead, operation_id="getNotes"
)
def get_notes(skill_id: uuid.UUID, db: DbSession) -> dict:
    return use_cases.read_notes(db, skill_id)


@router.put(
    "/skills/{skill_id}/notes", response_model=NotesRead, operation_id="saveNotes"
)
def save_notes(skill_id: uuid.UUID, payload: NotesWrite, db: DbSession) -> dict:
    """`PUT` : le document entier ; il remplace l'ancien, aucune question ne
    part."""
    return use_cases.save_notes(db, skill_id, payload)


@router.post(
    "/skills/{skill_id}/note-questions",
    response_model=NoteQuestionRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="createNoteQuestion",
)
def create_question(
    skill_id: uuid.UUID, payload: NoteQuestionCreate, db: DbSession
) -> NoteQuestion:
    return use_cases.create_question(db, skill_id, payload)


@router.patch(
    "/note-questions/{question_id}",
    response_model=NoteQuestionRead,
    operation_id="updateNoteQuestion",
)
def update_question(
    question_id: uuid.UUID, payload: NoteQuestionUpdate, db: DbSession
) -> NoteQuestion:
    return use_cases.update_question(db, _get_question_or_404(db, question_id), payload)


@router.delete(
    "/note-questions/{question_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="deleteNoteQuestion",
)
def delete_question(question_id: uuid.UUID, db: DbSession) -> None:
    use_cases.delete_question(db, _get_question_or_404(db, question_id))
