"""Modèles de la passation de l'interro (design #80) — `RecallSession`,
`RecallAnswer`.

**Une passation** fait passer les questions complètes du savoir, dans
l'ordre de ses notes ; une question ratée retourne en fin de file et se
repose après un délai. Elle se termine quand chaque question a été sue une
fois, et c'est sa fin qui fait avancer la courbe du cycle
(`domain/recall.py`). Une passation non terminée se reprend là où on l'a
quittée — le lendemain aussi.

**Chaque passage** d'une question est une tentative (`RecallAttempt`) : le
texte tapé, le verdict, les éléments donnés pour une liste. Le premier essai
fait le score ; les suivants servent à réapprendre.

**Les réponses copient leur question** (texte, marque, titres au-dessus
d'elle, réponse attendue) au moment où la passation commence : la liste d'une
passation est figée, et l'historique reste lisible si la question change ou
disparaît (`question_id` passe alors à nul).
"""

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from sophia.domain.notes import AnswerForm, QuestionKind
from sophia.domain.recall import RecallVerdict, due_after, is_finished
from sophia.infrastructure.database import Base
from sophia.infrastructure.models.base import uuid_pk

if TYPE_CHECKING:
    from sophia.infrastructure.models.activity import Activity
    from sophia.infrastructure.models.notes import NoteQuestion
    from sophia.infrastructure.models.plan import AcquisitionPlan


class RecallSession(Base):
    __tablename__ = "recall_sessions"

    id: Mapped[uuid.UUID] = uuid_pk()
    # Une passation n'a pas de sens sans son cycle : elle part avec lui.
    plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("acquisition_plans.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Le jour de la passation : celui de sa fin — le jour où la dernière
    # question a été sue —, d'où compte l'intervalle suivant (celui où elle a
    # commencé, tant qu'elle n'est pas finie).
    day: Mapped[date] = mapped_column(Date, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Abandonnée par « Recommencer » (07/10/2026) : elle ne se reprend plus et
    # ne paraît pas dans l'historique, mais ses passages restent.
    abandoned_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Le rang de la courbe avant la passation, et celui qu'elle lui a donné.
    stage_before: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    stage_after: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Le score au premier essai, posé à la fin (nul tant qu'elle ne l'est
    # pas) : pour information, sans effet sur la courbe.
    known_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Le verdict des passations d'avant le 07/10/2026 ; plus écrit.
    verdict: Mapped[RecallVerdict | None] = mapped_column(
        Enum(RecallVerdict, name="recall_verdict"), nullable=True
    )

    plan: Mapped["AcquisitionPlan"] = relationship(back_populates="recall_sessions")
    answers: Mapped[list["RecallAnswer"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="RecallAnswer.position",
    )

    @property
    def skill_id(self) -> uuid.UUID:
        return self.plan.skill_id

    @property
    def is_finished(self) -> bool:
        return self.finished_at is not None

    @property
    def is_open(self) -> bool:
        """Commencée, ni terminée ni abandonnée : elle se reprend."""
        return self.finished_at is None and self.abandoned_at is None

    @property
    def known_count_now(self) -> int:
        """Les questions déjà sues — « En cours · 3 sur 5 sues »."""
        return sum(1 for a in self.answers if a.known)

    @property
    def next_due_on(self) -> date | None:
        """La prochaine interro que cette passation a fixée ; aucune si elle
        a terminé la courbe."""
        if self.stage_after is None or is_finished(self.stage_after):
            return None
        return due_after(self.day, self.stage_after)


class RecallAnswer(Base):
    """Une question d'une passation, et ce qu'on y a répondu."""

    __tablename__ = "recall_answers"

    id: Mapped[uuid.UUID] = uuid_pk()
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("recall_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # La question d'origine, tant qu'elle existe.
    question_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("note_questions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Rang dans la passation : l'ordre du document des notes.
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Rang dans la file : `position` au départ ; une question ratée passe
    # derrière toutes les autres.
    queue_rank: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Quand la question peut se repasser : après un échec, ou l'ouverture des
    # notes du savoir, maintenant + `RETRY_DELAY` (UTC). Nul : tout de suite.
    # Le délai se propose, il ne s'impose pas : on peut passer outre.
    available_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # --- La question telle qu'elle était au début de la passation.
    kind: Mapped[QuestionKind] = mapped_column(
        Enum(QuestionKind, name="question_kind"), nullable=False
    )
    form: Mapped[AnswerForm] = mapped_column(
        Enum(AnswerForm, name="answer_form"),
        nullable=False,
        default=AnswerForm.free,
        server_default=AnswerForm.free.value,
    )
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    # Le chemin des titres au-dessus de la question, joints par « › » (vide
    # s'il n'y en a pas). Le nom date des sections (avant le 03/10/2026).
    section_title: Mapped[str] = mapped_column(String(300), nullable=False)
    expected_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Les éléments d'une liste, `{"id", "text"}`.
    points: Mapped[list[dict[str, str]]] = mapped_column(
        JSON, nullable=False, default=list
    )
    # « Réviser » (dès le 3ᵉ passage) : la séance de révision posée pour cette
    # question. Elle part si on la retire ; supprimée au calendrier, le lien
    # tombe.
    revision_activity_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("activities.id", ondelete="SET NULL"), nullable=True
    )

    session: Mapped[RecallSession] = relationship(back_populates="answers")
    question: Mapped["NoteQuestion | None"] = relationship()
    revision: Mapped["Activity | None"] = relationship()
    attempts: Mapped[list["RecallAttempt"]] = relationship(
        back_populates="answer_row",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="RecallAttempt.number",
    )

    @property
    def revision_on(self) -> date | None:
        """Le jour de la séance de révision posée, s'il y en a une."""
        if self.revision is None or self.revision.start_at is None:
            return None
        return self.revision.start_at.date()

    @property
    def known(self) -> bool:
        """Sue une fois dans la passation : elle ne se repasse plus."""
        return any(a.known for a in self.attempts)

    @property
    def failures(self) -> int:
        """Les passages ratés : après trois, l'app propose une séance d'étude."""
        return sum(1 for a in self.attempts if a.known is False)

    @property
    def first_known(self) -> bool | None:
        """Sue au premier essai ; nul tant que ce premier essai n'est pas
        jugé."""
        return self.attempts[0].known if self.attempts else None

    @property
    def open_attempt(self) -> "RecallAttempt | None":
        """Le passage en cours : le dernier, s'il n'est pas encore jugé."""
        last = self.attempts[-1] if self.attempts else None
        return last if last is not None and last.known is None else None


class RecallAttempt(Base):
    """Un passage d'une question : ce qu'on a tapé, puis le verdict — un
    seul pour une réponse libre ; pour une liste, les éléments donnés, et sue
    s'ils y sont tous."""

    __tablename__ = "recall_attempts"

    id: Mapped[uuid.UUID] = uuid_pk()
    answer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("recall_answers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # 1 pour le premier essai, puis 2, 3…
    number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # La question telle qu'elle était posée à ce passage : l'interro suit les
    # notes, chaque passage garde son texte.
    prompt: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Le texte tapé.
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Su / pas su ; nul tant que pas jugé.
    known: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    # Liste : les ids des éléments donnés.
    known_points: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    judged_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    answer_row: Mapped[RecallAnswer] = relationship(back_populates="attempts")


class RecallRestart(Base):
    """Un « Recommencer » de l'interro d'un cycle : la courbe est revenue à
    J+1 ce jour-là (07/10/2026). Une ligne de l'historique."""

    __tablename__ = "recall_restarts"

    id: Mapped[uuid.UUID] = uuid_pk()
    plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("acquisition_plans.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    plan: Mapped["AcquisitionPlan"] = relationship(back_populates="recall_restarts")
