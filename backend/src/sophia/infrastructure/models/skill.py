"""Modèle `Skill` — l'arbre de savoirs d'un domaine.

Un savoir appartient à **un seul** domaine (`domain_id`), et son parent
(`parent_skill_id`, unique) est du même domaine : chaque domaine possède son
arbre. Le partage entre domaines (M2M `skill_domains`) est retiré le
23/09/2026. Pas de plafond de profondeur.
"""

import enum
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, Integer, String, Text, literal_column
from sqlalchemy.orm import Mapped, mapped_column, relationship

from sophia.infrastructure.database import Base
from sophia.infrastructure.models.base import TimestampMixin, uuid_pk
from sophia.infrastructure.models.notes import NoteQuestion
from sophia.infrastructure.models.plan import PlanState

if TYPE_CHECKING:
    from sophia.infrastructure.models.domain import Domain
    from sophia.infrastructure.models.notes import SkillNotes
    from sophia.infrastructure.models.plan import AcquisitionPlan
    from sophia.infrastructure.models.practice import PracticeItem
    from sophia.infrastructure.models.resource import Resource


class SkillStatus(enum.StrEnum):
    """Progression saisie manuellement sur une compétence."""

    not_started = "not_started"
    in_progress = "in_progress"
    acquired = "acquired"


class Skill(TimestampMixin, Base):
    __tablename__ = "skills"

    id: Mapped[uuid.UUID] = uuid_pk()
    # Le domaine du savoir, unique. Le supprimer emporte ses savoirs.
    domain_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("domains.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    parent_skill_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("skills.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Propre au nœud, à tout niveau : un parent a le sien, indépendant de celui
    # de ses enfants. Aucune agrégation — et pas de nature de nœud non plus :
    # tout nœud est un savoir, qu'il ait des enfants ou non (23/09/2026).
    status: Mapped[SkillStatus] = mapped_column(
        Enum(SkillStatus, name="skill_status"),
        nullable=False,
        default=SkillStatus.not_started,
    )
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    domain: Mapped["Domain"] = relationship(back_populates="skills")

    # Arbre auto-référencé. `remote_side=[id]` désigne le côté « un » de la
    # relation parent (la PK visée par parent_skill_id).
    parent: Mapped["Skill | None"] = relationship(
        "Skill",
        remote_side=[id],
        back_populates="children",
    )
    children: Mapped[list["Skill"]] = relationship(
        "Skill",
        back_populates="parent",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    # Contenu V4 : le catalogue de pratique et les cycles d'acquisition. Les
    # deux n'ont pas de sens sans leur savoir et partent avec lui (CASCADE en
    # base, `passive_deletes` pour laisser la base le faire).
    practice_items: Mapped[list["PracticeItem"]] = relationship(
        back_populates="skill",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    plans: Mapped[list["AcquisitionPlan"]] = relationship(
        back_populates="skill",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="AcquisitionPlan.created_at",
    )
    # Ses ressources (design #81) : elles partent avec lui.
    resources: Mapped[list["Resource"]] = relationship(
        back_populates="skill",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Resource.created_at",
    )
    # Ses notes (design #79, #88) : un document et ses questions, qui partent
    # avec lui.
    notes: Mapped["SkillNotes | None"] = relationship(
        back_populates="skill",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    note_questions: Mapped[list["NoteQuestion"]] = relationship(
        back_populates="skill",
        cascade="all, delete-orphan",
        passive_deletes=True,
        # L'ordre de création (le rowid départage deux questions de la même
        # seconde) : celui des questions qu'aucun nœud du document ne pose.
        order_by=lambda: [
            NoteQuestion.created_at,
            literal_column("note_questions.rowid"),
        ],
    )

    @property
    def level(self) -> int:
        """Où en est le savoir, de 0 à 4 : la jauge à quatre crans.

        La même lecture que `learning` d'un projet (`_skill_level`) : 4 s'il
        est acquis ou a un cycle clos, sinon la sous-phase du cycle actif (1
        Étude, 2 Pratique, 3 Application), 1 s'il est « en cours » sans cycle
        actif, 0 sinon. Exposé sur le savoir pour les listes qui ne passent pas
        par un projet (le sélecteur du panneau d'activité, #44).
        """
        # Import local : `project` importe déjà ce module.
        from sophia.infrastructure.models.project import _skill_level

        return _skill_level(self)

    @property
    def active_plan(self) -> "AcquisitionPlan | None":
        """Le cycle **en cours**, s'il y en a un — un seul à la fois."""
        return next((p for p in self.plans if p.state is PlanState.active), None)

    @property
    def has_open_cycle(self) -> bool:
        """Un cycle est en cours (à clore compris) : la pastille de l'en-tête et
        l'anneau de l'extrait d'arbre le disent."""
        return self.active_plan is not None

    @property
    def has_cycle(self) -> bool:
        """Un cycle en cours ou prévu : le savoir a des pièces à poser (#107,
        point 15 — pas d'acte sans cycle)."""
        return any(p.state in ("draft", "active") for p in self.plans)
