"""Schémas Pydantic de la passation de l'interro (design #80)."""

import uuid
from datetime import UTC, date, datetime

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator

from sophia.application.schemas.notes import QuestionPoint
from sophia.domain.notes import AnswerForm, QuestionKind
from sophia.domain.recall import RecallVerdict


class RecallAnswerWrite(BaseModel):
    """Le passage en cours d'une question : le texte tapé, et le verdict —
    nul tant qu'on n'a pas jugé. Réponse libre : `known`. Liste :
    `known_points`, les ids des éléments donnés ; la question est sue s'ils y
    sont tous (`known` est alors ignoré). Remplace ce que le passage en cours
    portait ; un passage jugé est clos, le suivant en ouvre un neuf."""

    answer: str | None = Field(default=None, max_length=10_000)
    known: bool | None = None
    known_points: list[uuid.UUID] | None = None


class RecallAttemptRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    #: 1 pour le premier essai.
    number: int
    #: La question telle qu'elle était posée à ce passage.
    prompt: str
    answer: str | None
    known: bool | None
    known_points: list[uuid.UUID]


class RecallAnswerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    #: La question d'origine — nulle si elle a disparu depuis.
    question_id: uuid.UUID | None
    position: int
    #: Rang dans la file : une question ratée passe derrière les autres.
    queue_rank: int
    #: Quand elle peut se repasser (UTC) ; nul = tout de suite. Le délai se
    #: propose, il ne s'impose pas.
    available_at: AwareDatetime | None
    kind: QuestionKind
    form: AnswerForm
    prompt: str
    #: Les titres au-dessus de la question au départ, joints par « › »
    #: (vide s'il n'y en a pas).
    section_title: str
    expected_answer: str | None
    points: list[QuestionPoint]
    #: Sue une fois dans la passation : elle ne se repasse plus.
    known: bool
    #: Les passages ratés ; dès le 3ᵉ passage, « Réviser » se propose.
    failures: int
    #: Le jour de la séance de révision posée pour cette question, s'il y en
    #: a une.
    revision_on: date | None
    #: Les passages, du premier au dernier (le dernier peut être en cours).
    attempts: list[RecallAttemptRead]

    @field_validator("available_at", mode="before")
    @classmethod
    def _utc(cls, value: datetime | None) -> datetime | None:
        # La base garde l'UTC sans fuseau : on le rend explicite.
        if isinstance(value, datetime) and value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value


class RecallSessionSummary(BaseModel):
    """Une passation dans l'historique : sa date, son score au premier essai
    (et le verdict des passations d'avant le 07/10/2026). Une passation
    ouverte (`finished_at` nul) dit ce qui est déjà su : `known_now`."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    plan_id: uuid.UUID
    skill_id: uuid.UUID
    #: Le jour de la passation (celui de sa fin).
    day: date
    started_at: datetime
    finished_at: datetime | None
    stage_before: int
    stage_after: int | None
    #: Les questions sues au premier essai, posé à la fin.
    known_count: int | None
    total: int
    #: Les questions déjà sues — « En cours · 5 sur 12 sues » ; vaut `total`
    #: sur une passation terminée.
    known_now: int = Field(validation_alias="known_count_now")
    #: Le verdict des passations d'avant le 07/10/2026 ; nul ensuite.
    verdict: RecallVerdict | None
    #: La prochaine interro que cette passation a fixée.
    next_due_on: date | None


class RecallSessionRead(RecallSessionSummary):
    #: Les questions, dans l'ordre de la passation, avec leurs réponses.
    answers: list[RecallAnswerRead]


class RecallRevisionWrite(BaseModel):
    """« Réviser » : le jour de la séance de révision."""

    day: date
