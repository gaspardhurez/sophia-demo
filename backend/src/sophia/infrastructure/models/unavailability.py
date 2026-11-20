"""Modèles `Unavailability` et `UnavailabilitySlot` — les indisponibilités du
calendrier (#105).

Une indisponibilité, c'est un temps où l'on n'est pas libre : un week-end chez
ses parents, un déplacement. Elle **se montre** au calendrier — un voile clair
sous les activités — et **ne bloque rien** : on peut toujours y poser une
activité. Elle n'appartient à aucun domaine, aucun projet ; c'est la vie
autour.

Dedans, des **créneaux bloqués** (le train de l'aller, celui du retour) : un
temps pris pour de bon, peint en gris. Le terme est générique — un créneau
bloqué n'est pas forcément un trajet.

Les dates sont locales, comme celles des activités. En journées entières, minuit
pour le début, et `end_at` = le dernier jour à minuit.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from sophia.infrastructure.database import Base
from sophia.infrastructure.models.base import TimestampMixin, uuid_pk


class Unavailability(TimestampMixin, Base):
    __tablename__ = "unavailabilities"

    id: Mapped[uuid.UUID] = uuid_pk()
    emoji: Mapped[str | None] = mapped_column(String(16), nullable=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    all_day: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    start_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    end_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    slots: Mapped[list["UnavailabilitySlot"]] = relationship(
        back_populates="unavailability",
        cascade="all, delete-orphan",
        order_by="UnavailabilitySlot.start_at",
    )


class UnavailabilitySlot(Base):
    """Un créneau bloqué : toujours **dans** la période de son indisponibilité
    (cf. `domain/unavailability.py`), supprimé avec elle."""

    __tablename__ = "unavailability_slots"

    id: Mapped[uuid.UUID] = uuid_pk()
    unavailability_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("unavailabilities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    emoji: Mapped[str | None] = mapped_column(String(16), nullable=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    start_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    unavailability: Mapped[Unavailability] = relationship(back_populates="slots")
