"""Route du pense-bête — deux verbes sur une ressource unique."""

from fastapi import APIRouter

from sophia.api.deps import DbSession
from sophia.application import notepad as use_cases
from sophia.application.schemas.notepad import NotepadRead, NotepadWrite
from sophia.infrastructure.models import Notepad

router = APIRouter(tags=["notepad"])


@router.get("/notepad", response_model=NotepadRead, operation_id="getNotepad")
def get_notepad(db: DbSession) -> Notepad:
    return use_cases.get_notepad(db)


@router.put("/notepad", response_model=NotepadRead, operation_id="saveNotepad")
def save_notepad(payload: NotepadWrite, db: DbSession) -> Notepad:
    """`PUT` : on remplace le texte entier, il n'y a rien à fusionner."""
    return use_cases.save_notepad(db, payload)
