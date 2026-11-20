"""La **préparation de la semaine** — le rituel (05/10/2026, #92).

Une charnière entre deux semaines calendaires : elle **valide la semaine N** et
**prépare la semaine N+1**. Elle se désigne par la semaine qu'elle prépare
(`week_start`, le lundi de N+1), une seule par semaine.

Elle ne stocke que **l'avancement** : son état, les projets revus. Tout geste
fait pendant le rituel (cocher, reporter, poser une cible, lier une séance)
écrit des données réelles ailleurs ; relire suffit donc à reprendre.

Elle est portée par une **activité** (l'activité du rituel, dans le domaine
système), posée chaque dimanche par la préparation du calendrier. La ligne naît
avec elle : c'est ce qui rend la pose idempotente — une semaine qui a sa ligne
a eu son rituel posé, et une activité supprimée ou déplacée ne revient pas.
"""

import enum
import uuid
from datetime import date, datetime, timedelta
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, Enum, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from sophia.infrastructure.database import Base
from sophia.infrastructure.models.base import uuid_pk

if TYPE_CHECKING:
    from sophia.infrastructure.models.activity import Activity
    from sophia.infrastructure.models.project import Project


class WeekPreparationState(enum.StrEnum):
    """Où en est le rituel d'une semaine.

    - `todo` — posé (son activité est au calendrier), pas commencé ;
    - `in_progress` — démarré : la semaine N+1 a été posée, on y travaille ;
    - `validated` — « Valider la préparation ».
    """

    todo = "todo"
    in_progress = "in_progress"
    validated = "validated"


class WeekPreparation(Base):
    __tablename__ = "week_preparations"

    id: Mapped[uuid.UUID] = uuid_pk()
    # Le lundi de la semaine préparée (N+1). La semaine validée est la
    # précédente.
    week_start: Mapped[date] = mapped_column(Date, nullable=False, unique=True)
    state: Mapped[WeekPreparationState] = mapped_column(
        Enum(WeekPreparationState, name="week_preparation_state"),
        nullable=False,
        default=WeekPreparationState.todo,
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    validated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # L'activité du rituel. Supprimée, le lien tombe (SET NULL) et la ligne
    # reste : la semaine a eu son rituel posé, il ne revient pas. Une seule
    # aujourd'hui ; plusieurs activités par rituel passeraient par une table.
    activity_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("activities.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    activity: Mapped["Activity | None"] = relationship(
        back_populates="week_preparation"
    )
    reviewed: Mapped[list["WeekPreparationProject"]] = relationship(
        back_populates="preparation",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="WeekPreparationProject.reviewed_at",
    )

    @property
    def past_week_start(self) -> date:
        """Le lundi de la semaine que le rituel valide (N)."""
        return self.week_start - timedelta(days=7)


class WeekPreparationProject(Base):
    """Un projet **revu** pendant le rituel — la coche de sa carte."""

    __tablename__ = "week_preparation_projects"

    preparation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("week_preparations.id", ondelete="CASCADE"), primary_key=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    )
    reviewed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    preparation: Mapped["WeekPreparation"] = relationship(back_populates="reviewed")
    project: Mapped["Project"] = relationship()
