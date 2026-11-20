"""Les activités types et leur planification (#37).

Remplace l'habitude, qui mêlait **ce qu'on fait** et **quand on le fait** :

- `ActivityType` porte ce qu'on fait (titre, emoji, unité suggérée, ce qui compte
  comme fait) et vit au niveau du domaine. Il porte aussi le **repli du domaine** :
  une planification qui ne pose que les jours où aucun projet ouvert ne porte
  l'activité type.
- `ProjectActivityType` porte **quand** : la planification d'une activité type
  pour un projet, pendant sa période, sur les étapes où le lien n'est pas
  éteint (`ProjectActivityTypeStepOff`).

Chaque lien (et chaque repli) retient **jusqu'où il a posé** (`posed_until`) :
un jour derrière cette date n'est jamais reposé, d'où la disparition des
`habit_logs`.
"""

import enum
import uuid
from datetime import date, datetime, time
from typing import TYPE_CHECKING

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    String,
    Text,
    Time,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from sophia.infrastructure.database import Base
from sophia.infrastructure.models.base import uuid_pk

if TYPE_CHECKING:
    from sophia.infrastructure.models.activity import Activity
    from sophia.infrastructure.models.domain import Domain
    from sophia.infrastructure.models.project import Project, ProjectStep
    from sophia.infrastructure.models.unit import Unit


class Planning(enum.StrEnum):
    """Comment un lien (ou un repli) pose ses occurrences."""

    daily = "daily"  # tous les jours
    weekly = "weekly"  # les jours cochés
    manual = "manual"  # rien n'est généré : le lien sert au « sur », à la main


class ActivityType(Base):
    __tablename__ = "activity_types"

    id: Mapped[uuid.UUID] = uuid_pk()
    domain_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("domains.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    # **Ce qui compte comme fait**, une seule fois pour tous ses projets. Le
    # titre suffit à « Run » ; il ne suffit plus dès qu'on juge une journée
    # (« Étirements ») : cocher demande alors une règle.
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    emoji: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # L'unité proposée quand une occurrence déclare une valeur. `SET NULL` :
    # ranger le référentiel ne détruit pas une activité type.
    unit_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("units.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Le repli du domaine : sans dates, sans créneau (des cases du jour).
    fallback_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    fallback_planning: Mapped[Planning] = mapped_column(
        Enum(Planning, name="planning"), nullable=False, default=Planning.weekly
    )
    # 0 = lundi … 6 = dimanche ; ne sert qu'en hebdomadaire.
    fallback_weekdays: Mapped[list[int]] = mapped_column(
        JSON, nullable=False, default=list
    )
    fallback_posed_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    domain: Mapped["Domain"] = relationship()
    unit: Mapped["Unit | None"] = relationship(back_populates="activity_types")
    links: Mapped[list["ProjectActivityType"]] = relationship(
        back_populates="activity_type",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    # Supprimer l'activité type garde ses occurrences, sans type (SET NULL) :
    # ce qui a été fait ou prévu ne disparaît pas avec l'étiquette.
    activities: Mapped[list["Activity"]] = relationship(
        back_populates="activity_type", passive_deletes=True
    )

    @property
    def project_ids(self) -> list[uuid.UUID]:
        return [link.project_id for link in self.links]


class ProjectActivityType(Base):
    """Une activité type **planifiée pour un projet** : la récurrence est ici.

    Le lien couvre toujours la période du projet, tant qu'il est ouvert, sauf
    les étapes où il est éteint. C'est aussi par lui qu'une occurrence générée
    reçoit son projet, à sa création, une fois pour toutes.
    """

    __tablename__ = "project_activity_types"

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )
    activity_type_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("activity_types.id", ondelete="CASCADE"), primary_key=True
    )
    planning: Mapped[Planning] = mapped_column(
        Enum(Planning, name="planning"), nullable=False, default=Planning.weekly
    )
    weekdays: Mapped[list[int]] = mapped_column(JSON, nullable=False, default=list)
    # Créneau facultatif. Sans : l'occurrence est la **case du jour** (journée
    # entière, une seule par jour et par activité type). Avec : un bloc à l'heure.
    slot_start: Mapped[time | None] = mapped_column(Time, nullable=True)
    slot_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # « Préserver après le projet » : le repli du domaine prend le relais à la
    # clôture.
    preserve_after: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    posed_until: Mapped[date | None] = mapped_column(Date, nullable=True)

    project: Mapped["Project"] = relationship(back_populates="activity_types")
    activity_type: Mapped["ActivityType"] = relationship(back_populates="links")
    steps_off: Mapped[list["ProjectActivityTypeStepOff"]] = relationship(
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    @property
    def has_slot(self) -> bool:
        return self.slot_start is not None and self.slot_minutes is not None

    @property
    def off_step_ids(self) -> list[uuid.UUID]:
        return [off.step_id for off in self.steps_off]

    # Ce que l'écran nomme sans recharger les activités types du domaine.
    @property
    def type_title(self) -> str:
        return self.activity_type.title

    @property
    def type_emoji(self) -> str | None:
        return self.activity_type.emoji

    @property
    def type_description(self) -> str | None:
        return self.activity_type.description


class ProjectActivityTypeStepOff(Base):
    """Une étape où le lien est **éteint** : il n'y pose rien.

    Par défaut (aucune ligne), le lien est actif sur toutes les étapes — c'est le
    switch des cartes d'étape du plan.
    """

    __tablename__ = "project_activity_type_steps_off"

    project_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    activity_type_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    step_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("project_steps.id", ondelete="CASCADE"), primary_key=True
    )

    __table_args__ = (
        # Le lien qu'il éteint : part avec lui.
        ForeignKeyConstraint(
            ["project_id", "activity_type_id"],
            [
                "project_activity_types.project_id",
                "project_activity_types.activity_type_id",
            ],
            ondelete="CASCADE",
        ),
    )

    step: Mapped["ProjectStep"] = relationship()
