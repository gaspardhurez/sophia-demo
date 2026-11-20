"""Modèles `Resource`, `PlanResource`, `ResourceNotes` (design #81, #173) — de
quoi étudier.

**Une ressource appartient au savoir** : un livre, une vidéo, un cours, avec la
partie concernée. On la repère à tout moment, même sans cycle — comme un
exercice. **Chaque cycle choisit celles qu'il étudie** (`plan_resources`) :
c'est ce qui borne l'étude.

**L'étude est actionnable** (#173) : dans un cycle, les ressources ont un
**ordre de consommation** et une case « consommée » — au cycle, pas à la
ressource : un second cycle repart avec ses propres cases. Une ressource porte
ses **notes** (un document, brouillon de l'étude), qui partent avec elle. Dans
un cycle, elle se **lie aux parties de son périmètre** qu'elle couvre (30/10).
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from sophia.domain.resource_kind import ResourceKind
from sophia.infrastructure.database import Base
from sophia.infrastructure.models.base import TimestampMixin, uuid_pk

if TYPE_CHECKING:
    from sophia.infrastructure.models.plan import AcquisitionPlan
    from sophia.infrastructure.models.review import ReviewComment
    from sophia.infrastructure.models.skill import Skill


class PlanResource(Base):
    """Une ressource **dans l'étude d'un cycle**. Supprimer l'un ou l'autre
    défait le lien."""

    __tablename__ = "plan_resources"

    plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("acquisition_plans.id", ondelete="CASCADE"), primary_key=True
    )
    resource_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("resources.id", ondelete="CASCADE"), primary_key=True
    )
    # L'ordre de consommation dans ce cycle, de 0 à n-1 : réordonné à la main,
    # une ressource ajoutée va en fin, un retrait recompacte. « Consommées en
    # bas » est un affichage : il ne touche pas à la position.
    position: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    # Consommée : le moment où la case a été cochée ; décocher la remet à nul.
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Les parties du périmètre du cycle qu'elle couvre (30/10) : des libellés
    # de parties retenues (`domain/scope_links.py`), dans l'ordre du
    # périmètre. Ils suivent le périmètre : renommés avec lui, retirés quand
    # une partie n'est plus retenue.
    scope_parts: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, default=list, server_default="[]"
    )

    plan: Mapped["AcquisitionPlan"] = relationship(back_populates="resource_links")
    resource: Mapped["Resource"] = relationship(back_populates="plan_links")


class Resource(Base):
    __tablename__ = "resources"

    id: Mapped[uuid.UUID] = uuid_pk()
    # Une ressource n'a pas de sens sans son savoir : elle part avec lui.
    skill_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("skills.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    #: Son auteur, à part du titre (« Martin Breuss », « Tennis MBA ») : la
    #: colonne des notes l'écrit en second, sous le titre.
    author: Mapped[str | None] = mapped_column(String(200), nullable=True)
    #: Un lien, ou une référence (« Tennis MBA, épisode 12 »).
    reference: Mapped[str | None] = mapped_column(String(500), nullable=True)
    #: La sorte, lue au lien quand il est posé (`domain/resource_kind`) : elle
    #: dessine la tuile — 📺 vidéo, 📘 texte, 🔗 nulle pour un lien.
    kind: Mapped[ResourceKind | None] = mapped_column(
        Enum(ResourceKind, name="resource_kind"), nullable=True
    )
    #: La partie concernée (« de 4:10 à 9:30 », « chapitres 2 et 3 »).
    part: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    skill: Mapped["Skill"] = relationship(back_populates="resources")
    # Ses places dans les cycles, et ses notes : elles partent avec elle.
    plan_links: Mapped[list[PlanResource]] = relationship(
        back_populates="resource",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    notes: Mapped["ResourceNotes | None"] = relationship(
        back_populates="resource",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    # Les commentaires de la vérification de ses notes (#173).
    review_comments: Mapped[list["ReviewComment"]] = relationship(
        back_populates="resource",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ReviewComment.created_at",
    )


class ResourceNotes(TimestampMixin, Base):
    """Les notes prises sur une ressource (#173) : temporaires, peu mises en
    forme ; le produit final, ce sont les notes du savoir. Même forme de
    document que celles-ci (JSON TipTap), sans questions."""

    __tablename__ = "resource_notes"

    # Un document par ressource : il part avec elle.
    resource_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("resources.id", ondelete="CASCADE"), primary_key=True
    )
    # Le document en JSON d'éditeur (un nœud `doc`) ; `None` = vide.
    doc: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    resource: Mapped[Resource] = relationship(back_populates="notes")
