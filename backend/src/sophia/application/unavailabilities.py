"""Use cases des indisponibilités (#105).

Chaque écriture renvoie l'indisponibilité entière, créneaux compris : le
panneau et la grille la relisent d'un bloc.
"""

import uuid
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from sophia.application.schemas.unavailability import (
    UnavailabilityCreate,
    UnavailabilitySlotCreate,
    UnavailabilitySlotUpdate,
    UnavailabilityUpdate,
)
from sophia.domain.unavailability import check_period, check_slot, overlaps
from sophia.infrastructure.models import Unavailability, UnavailabilitySlot


def _check(u: Unavailability) -> None:
    """La période avance, et chaque créneau y tient encore."""
    check_period(u.all_day, u.start_at, u.end_at)
    for s in u.slots:
        check_slot(u.all_day, u.start_at, u.end_at, s.start_at, s.end_at)


def _save(db: Session, u: Unavailability) -> Unavailability:
    db.commit()
    db.refresh(u)
    return u


def list_unavailabilities(
    db: Session, start: datetime, end: datetime
) -> list[Unavailability]:
    """Celles qui touchent la fenêtre `[start, end[`, par début.

    La requête prend un jour de marge sur la fin (une journée entière court
    jusqu'au lendemain de son `end_at`) ; la règle exacte tranche ensuite.
    """
    rows = db.scalars(
        select(Unavailability)
        .where(
            Unavailability.start_at < end,
            Unavailability.end_at > start - timedelta(days=1),
        )
        .order_by(Unavailability.start_at)
    )
    return [u for u in rows if overlaps(u.all_day, u.start_at, u.end_at, start, end)]


def get_unavailability(
    db: Session, unavailability_id: uuid.UUID
) -> Unavailability | None:
    return db.get(Unavailability, unavailability_id)


def create_unavailability(db: Session, payload: UnavailabilityCreate) -> Unavailability:
    u = Unavailability(**payload.model_dump())
    _check(u)
    db.add(u)
    return _save(db, u)


def update_unavailability(
    db: Session, u: Unavailability, payload: UnavailabilityUpdate
) -> Unavailability:
    """Changer ses dates au point d'exclure un créneau bloqué est refusé : rien
    ne bouge en silence."""
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(u, field, value)
    try:
        _check(u)
    except Exception:
        db.rollback()
        raise
    return _save(db, u)


def delete_unavailability(db: Session, u: Unavailability) -> None:
    """Sans confirmation : ses créneaux et ses notes partent avec elle."""
    db.delete(u)
    db.commit()


def get_slot(u: Unavailability, slot_id: uuid.UUID) -> UnavailabilitySlot | None:
    return next((s for s in u.slots if s.id == slot_id), None)


def add_slot(
    db: Session, u: Unavailability, payload: UnavailabilitySlotCreate
) -> Unavailability:
    check_slot(u.all_day, u.start_at, u.end_at, payload.start_at, payload.end_at)
    u.slots.append(UnavailabilitySlot(**payload.model_dump()))
    return _save(db, u)


def update_slot(
    db: Session,
    u: Unavailability,
    slot: UnavailabilitySlot,
    payload: UnavailabilitySlotUpdate,
) -> Unavailability:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(slot, field, value)
    try:
        check_slot(u.all_day, u.start_at, u.end_at, slot.start_at, slot.end_at)
    except Exception:
        db.rollback()
        raise
    return _save(db, u)


def remove_slot(
    db: Session, u: Unavailability, slot: UnavailabilitySlot
) -> Unavailability:
    u.slots.remove(slot)
    return _save(db, u)
