"""Modèles des notes d'un savoir (design #79, #88) — `SkillNotes`, `NoteQuestion`.

**Un seul document par savoir** (`skill_notes`), le JSON de l'éditeur
(TipTap). Ses titres ne sont que de la mise en forme : rien n'est rangé en
sections. Le serveur n'en lit que les nœuds `question` et les titres au-dessus
d'eux (`domain.notes.question_places`).

**Les questions en table** : elles ne s'effacent pas d'un retour arrière et
l'historique des passations s'y accroche par clé étrangère. Elles
appartiennent au savoir ; leur place et leur ordre viennent du document, au
moment de l'usage — rien n'est stocké de leur rang.
"""

import uuid
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, Enum, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from sophia.domain.notes import AnswerForm, QuestionKind, is_complete
from sophia.infrastructure.database import Base
from sophia.infrastructure.models.base import TimestampMixin, uuid_pk

if TYPE_CHECKING:
    from sophia.infrastructure.models.skill import Skill


class SkillNotes(TimestampMixin, Base):
    __tablename__ = "skill_notes"

    # Un document par savoir : il part avec lui.
    skill_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("skills.id", ondelete="CASCADE"), primary_key=True
    )
    # Le document en JSON d'éditeur (un nœud `doc`) ; `None` = vide.
    doc: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    skill: Mapped["Skill"] = relationship(back_populates="notes")


class NoteQuestion(TimestampMixin, Base):
    __tablename__ = "note_questions"

    id: Mapped[uuid.UUID] = uuid_pk()
    # Le savoir de la question : elle part avec lui.
    skill_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("skills.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    kind: Mapped[QuestionKind] = mapped_column(
        Enum(QuestionKind, name="question_kind"), nullable=False
    )
    # La forme de la réponse attendue : elle règle la correction.
    form: Mapped[AnswerForm] = mapped_column(
        Enum(AnswerForm, name="answer_form"),
        nullable=False,
        default=AnswerForm.free,
        server_default=AnswerForm.free.value,
    )
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    # Réponse libre : la réponse attendue. Liste : les éléments à mentionner,
    # `{"id", "text"}` — l'id suit l'élément dans l'historique, même
    # reformulé. Les deux champs restent, quelle que soit la forme : en
    # changer ne perd pas ce qu'on avait écrit de l'autre côté.
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    points: Mapped[list[dict[str, str]]] = mapped_column(
        JSON, nullable=False, default=list
    )

    skill: Mapped["Skill"] = relationship(back_populates="note_questions")

    @property
    def complete(self) -> bool:
        """Posée et pourvue de sa réponse attendue : seule une question
        complète compte et entre dans une passation."""
        return is_complete(
            self.form, self.prompt, self.answer, [p["text"] for p in self.points]
        )
