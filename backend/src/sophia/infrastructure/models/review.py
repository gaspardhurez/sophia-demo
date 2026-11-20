"""Modèles `ReviewComment`, `ReviewReply` (#173) — la vérification des notes
d'une ressource.

Les **commentaires** de Sophia sur les notes d'une ressource sont gardés d'une
visite à l'autre tant qu'ils ne sont ni supprimés ni résolus — « Résolu » vaut
archivé : le commentaire reste, replié, et se rouvre d'un clic. « Vérifier à
nouveau » ajoute sans effacer. Rien d'autre de la vérification n'est gardé :
ni le texte de la source, ni le contexte envoyé (il va au journal des appels).

L'**ancrage** dans le document (la marque TipTap) est l'affaire du front : le
serveur garde l'extrait (`quote`) et sa nature (`anchor`).
"""

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from sophia.domain.review import ReplyAuthor, ReviewAnchor, ReviewKind, ReviewStatus
from sophia.infrastructure.database import Base
from sophia.infrastructure.models.base import uuid_pk

if TYPE_CHECKING:
    from sophia.infrastructure.models.resource import Resource


def _now() -> datetime:
    """UTC naïf, à la microseconde (comme `func.now()` de SQLite, en plus
    fin) : deux lignes écrites dans la même seconde — les commentaires d'une
    vérification, une réponse et celle de Sophia — gardent leur ordre."""
    return datetime.now(UTC).replace(tzinfo=None)


class ReviewComment(Base):
    __tablename__ = "review_comments"

    id: Mapped[uuid.UUID] = uuid_pk()
    # Les commentaires partent avec la ressource (et donc avec ses notes).
    resource_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("resources.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[ReviewKind] = mapped_column(
        Enum(ReviewKind, name="review_kind"), nullable=False
    )
    # `passage` : `quote` est surligné ; `insertion` : l'oubli s'insère après.
    anchor: Mapped[ReviewAnchor] = mapped_column(
        Enum(ReviewAnchor, name="review_anchor"), nullable=False
    )
    #: L'extrait des notes, tel qu'il y figurait à la vérification.
    quote: Mapped[str] = mapped_column(Text, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    #: Où regarder dans la source (un horodatage, une section).
    where_to_look: Mapped[str | None] = mapped_column(String(200), nullable=True)
    status: Mapped[ReviewStatus] = mapped_column(
        Enum(ReviewStatus, name="review_status"),
        nullable=False,
        default=ReviewStatus.open,
        server_default=ReviewStatus.open.value,
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    #: Les commentaires d'une même vérification partagent ce `run_id`.
    run_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    # La provenance : de quel prompt, de quel modèle vient le commentaire.
    prompt_version: Mapped[str] = mapped_column(String(80), nullable=False)
    model: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=_now, server_default=func.now(), nullable=False
    )

    resource: Mapped["Resource"] = relationship(back_populates="review_comments")
    replies: Mapped[list["ReviewReply"]] = relationship(
        back_populates="comment",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ReviewReply.created_at",
    )


class ReviewReply(Base):
    """Une réponse dans le fil d'un commentaire : de l'utilisateur, ou de
    Sophia qui lui répond."""

    __tablename__ = "review_replies"

    id: Mapped[uuid.UUID] = uuid_pk()
    comment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("review_comments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    author: Mapped[ReplyAuthor] = mapped_column(
        Enum(ReplyAuthor, name="review_reply_author"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=_now, server_default=func.now(), nullable=False
    )

    comment: Mapped[ReviewComment] = relationship(back_populates="replies")
