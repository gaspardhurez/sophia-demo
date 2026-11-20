"""Schémas Pydantic des objets de pratique (V4)."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from sophia.infrastructure.models import (
    ContentSource,
    EvalMode,
    PracticeKind,
    PracticeNature,
)


class PracticeItemCreate(BaseModel):
    nature: PracticeNature = PracticeNature.isolated
    kind: PracticeKind = PracticeKind.manual
    title: str = Field(min_length=1, max_length=200)
    emoji: str | None = Field(default=None, max_length=16)
    instructions: str | None = None
    reference: str | None = Field(default=None, max_length=500)
    eval_mode: EvalMode = EvalMode.self_declared
    statement_source: ContentSource | None = None
    solution_source: ContentSource | None = None
    #: Ajouté aussi, en fin de sa rampe, à ce cycle du savoir.
    plan_id: uuid.UUID | None = None


class PracticeItemUpdate(BaseModel):
    nature: PracticeNature | None = None
    kind: PracticeKind | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    emoji: str | None = Field(default=None, max_length=16)
    instructions: str | None = None
    reference: str | None = Field(default=None, max_length=500)
    eval_mode: EvalMode | None = None
    statement_source: ContentSource | None = None
    solution_source: ContentSource | None = None


class PracticeItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    skill_id: uuid.UUID
    nature: PracticeNature
    kind: PracticeKind
    title: str
    emoji: str | None
    instructions: str | None
    reference: str | None
    eval_mode: EvalMode
    statement_source: ContentSource | None
    solution_source: ContentSource | None
    created_at: datetime
    #: Nombre d'activités **faites** qui visent cet objet, tous cycles
    #: confondus — les passes réelles.
    #: Dérivé, jamais stocké : c'est le calendrier qui compte.
    sessions: int
