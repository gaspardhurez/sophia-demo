"""Schémas Pydantic des notes d'un savoir (design #79, #88)."""

import uuid
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from sophia.domain.notes import AnswerForm, QuestionKind


class QuestionPoint(BaseModel):
    """Un élément à mentionner : son id le suit dans l'historique, même
    reformulé."""

    id: uuid.UUID
    text: str


class QuestionPointWrite(BaseModel):
    """Un élément écrit : sans id, le serveur lui en donne un."""

    id: uuid.UUID | None = None
    text: str = ""


class NoteQuestionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: QuestionKind
    form: AnswerForm
    prompt: str
    answer: str | None
    points: list[QuestionPoint]
    #: Posée et pourvue de sa réponse attendue (`domain.notes.is_complete`) :
    #: seule une question complète compte et entre dans une passation.
    complete: bool


class NotesRead(BaseModel):
    """Le document d'un savoir et ses questions."""

    #: Le document TipTap (`{"type": "doc", "content": […]}`), nul s'il n'a
    #: jamais été écrit. Lu, il pose toutes les questions : une question
    #: qu'aucun nœud ne pose y reçoit un nœud `question` en fin.
    doc: dict[str, Any] | None
    #: Toutes les questions du savoir, sans ordre : c'est le document qui
    #: les ordonne.
    questions: list[NoteQuestionRead]


class NotesWrite(BaseModel):
    """Le document entier : il remplace l'ancien. Aucune question ne part."""

    doc: dict[str, Any] | None = None


class NoteQuestionCreate(BaseModel):
    """Une question peut naître vide : elle se crée en place et s'écrit au fil
    de la saisie (#88). Incomplète, elle ne compte pas."""

    kind: QuestionKind
    form: AnswerForm = AnswerForm.free
    prompt: str = ""
    answer: str | None = None
    points: list[QuestionPointWrite] = Field(default_factory=list)


class NoteQuestionUpdate(BaseModel):
    kind: QuestionKind | None = None
    form: AnswerForm | None = None
    prompt: str | None = None
    answer: str | None = None
    points: list[QuestionPointWrite] | None = None
