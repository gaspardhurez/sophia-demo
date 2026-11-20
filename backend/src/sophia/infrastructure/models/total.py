"""L'objectif **Total** d'un projet, et les valeurs que déclarent les activités.

Réunifie les anciens axes Volume et Régularité (décision du 24/09/2026). La
régularité n'a jamais mesuré de rythme : elle comptait
les occurrences faites d'une habitude contre une cible — un total au nombre de
fois. Les deux ne différaient que par la façon de compter, ce qui devient ici un
réglage du Total plutôt qu'un axe à part.

Un Total, c'est :
- **comment il compte** (`mode`) — la valeur déclarée dans une unité, la durée
  lue dans le calendrier, ou le nombre d'activités ;
- **ce qu'il compte** — toutes les activités liées au projet, ou seulement
  certaines activités types (`activity_types`) et/ou les séances
  d'apprentissage (`learning_sessions`, #37). Le choix est explicite : un Total
  qui perd sa dernière activité type est supprimé, jamais basculé sur
  « toutes » ;
- une **cible**.

La durée et le nombre **ne se déclarent pas** : ils se lisent sur l'activité.
Seule la valeur se déclare (`ActivityValue`), avec son unité — c'est ce qui la
rend lisible quand un projet porte plusieurs Totaux.
"""

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Table,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from sophia.domain.unit import plural_of
from sophia.infrastructure.database import Base
from sophia.infrastructure.models.base import uuid_pk

if TYPE_CHECKING:
    from sophia.infrastructure.models.activity import Activity
    from sophia.infrastructure.models.activity_type import ActivityType
    from sophia.infrastructure.models.project import Project, ProjectStep
    from sophia.infrastructure.models.unit import Unit


class TotalMode(enum.StrEnum):
    """Comment un Total compte."""

    value = "value"  # somme des valeurs déclarées dans son unité (km, recettes)
    duration = "duration"  # somme des durées lues au calendrier, en heures
    count = "count"  # nombre d'activités faites


# Les activités types que compte un Total. CASCADE des deux côtés ; le use case
# supprime d'abord le Total qui n'aurait plus rien à compter.
total_activity_types = Table(
    "total_activity_types",
    Base.metadata,
    Column(
        "total_id",
        Uuid,
        ForeignKey("project_totals.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "activity_type_id",
        Uuid,
        ForeignKey("activity_types.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class ProjectTotal(Base):
    """Un Total : une cible sur une somme, une durée ou un nombre d'activités."""

    __tablename__ = "project_totals"

    id: Mapped[uuid.UUID] = uuid_pk()
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    mode: Mapped[TotalMode] = mapped_column(
        Enum(TotalMode, name="total_mode"), nullable=False
    )
    # L'unité des valeurs additionnées — en mode `value` seulement. La durée se
    # compte en heures et le nombre en fois : ni l'une ni l'autre ne se choisit.
    # CASCADE : supprimer une unité sans la remplacer supprime les Totaux qui la
    # comptaient (décision du 24/09/2026) — un Total sans unité n'a pas de sens.
    unit_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("units.id", ondelete="CASCADE"), nullable=True, index=True
    )
    target: Mapped[float] = mapped_column(Float, nullable=False)
    # « sur Séances d'apprentissage » : les activités qui travaillent un savoir,
    # en bloc (#37, §5). Se cumule avec les activités types.
    learning_sessions: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    # Le mot qui remplace « fois », propre à ce Total (#58) — au nombre
    # seulement. Nul : « fois ». Le pluriel nul suit la règle (`plural_of`) ;
    # l'emoji remplace la marque (emojis des activités types, icône Fois).
    count_name: Mapped[str | None] = mapped_column(String(30), nullable=True)
    count_plural: Mapped[str | None] = mapped_column(String(30), nullable=True)
    count_emoji: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # Ordre d'affichage parmi les Totaux du projet.
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    project: Mapped["Project"] = relationship(back_populates="totals")
    unit: Mapped["Unit | None"] = relationship()
    activity_types: Mapped[list["ActivityType"]] = relationship(
        secondary=total_activity_types, passive_deletes=True
    )
    steps: Mapped[list["StepTotal"]] = relationship(
        back_populates="total",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    @property
    def activity_type_ids(self) -> list[uuid.UUID]:
        return [activity_type.id for activity_type in self.activity_types]

    @property
    def count_effective_plural(self) -> str | None:
        """Le pluriel du mot, prêt à afficher ; nul sans mot réglé."""
        if self.count_name is None:
            return None
        return self.count_plural or plural_of(self.count_name)

    @property
    def counts_everything(self) -> bool:
        """« sur toutes les activités » : aucun filtre posé."""
        return not self.activity_types and not self.learning_sessions

    def counts(self, activity: "Activity") -> bool:
        """Cette activité entre-t-elle dans ce Total ?"""
        if self.counts_everything:
            return True
        if self.learning_sessions and activity.acts:
            return True
        return activity.activity_type_id in set(self.activity_type_ids)

    def measure(self, activity: "Activity") -> float:
        """Ce que cette activité apporte au Total, selon sa façon de compter."""
        if self.mode is TotalMode.count:
            return 1.0
        if self.mode is TotalMode.duration:
            return activity.duration_hours
        return sum(v.value for v in activity.values if v.unit_id == self.unit_id)

    def done_in(self, activities: list["Activity"]) -> float:
        """Le réalisé de ce Total sur ces activités (celles d'un projet ou
        d'une étape)."""
        return sum(self.measure(a) for a in activities if a.done and self.counts(a))

    @property
    def progress(self) -> float:
        return self.done_in(self.project.activities)

    @property
    def is_met(self) -> bool:
        return self.progress >= self.target


class StepTotal(Base):
    """La tranche d'un Total confiée à une étape.

    Une étape ne crée pas de condition : elle dit quelle part d'un Total de son
    projet doit tomber à ce moment-là. La somme des tranches est plafonnée par
    la cible du Total — tenu côté use case.
    """

    __tablename__ = "step_totals"

    step_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("project_steps.id", ondelete="CASCADE"), primary_key=True
    )
    total_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("project_totals.id", ondelete="CASCADE"), primary_key=True
    )
    target: Mapped[float] = mapped_column(Float, nullable=False)

    step: Mapped["ProjectStep"] = relationship(back_populates="totals")
    total: Mapped["ProjectTotal"] = relationship(back_populates="steps")

    @property
    def progress(self) -> float:
        return self.total.done_in(self.step.activities)

    @property
    def is_met(self) -> bool:
        return self.progress >= self.target


class ActivityValue(Base):
    """Une valeur déclarée sur une activité : « 10 km », « 200 m de D+ ».

    Au plus une par unité et par activité. Une table plutôt qu'une colonne : une
    même sortie déclare souvent plusieurs choses, comme une séance porte
    plusieurs relevés de métrique. CASCADE sur l'unité : la supprimer sans la
    remplacer supprime les valeurs déclarées dedans (décision du 24/09/2026).
    """

    __tablename__ = "activity_values"

    activity_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("activities.id", ondelete="CASCADE"), primary_key=True
    )
    unit_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("units.id", ondelete="CASCADE"), primary_key=True
    )
    value: Mapped[float] = mapped_column(Float, nullable=False)

    activity: Mapped["Activity"] = relationship(back_populates="values")
    unit: Mapped["Unit"] = relationship()
