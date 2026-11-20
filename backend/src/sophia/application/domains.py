"""Use cases sur les domaines.

CRUD pur : les modèles SQLAlchemy servent d'entités (cf. CLAUDE.md, pragmatisme
des couches). On n'introduira une entité de domaine dédiée que quand une vraie
logique métier apparaîtra.
"""

import uuid
from collections.abc import Iterable
from datetime import date
from typing import get_args

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from sophia.application.schemas.domain import (
    DomainColor,
    DomainCounter,
    DomainCreate,
    DomainUpdate,
)
from sophia.domain.counter import tally
from sophia.domain.domain import SystemDomainLocked
from sophia.infrastructure.models import (
    Activity,
    ActivityValue,
    Domain,
    Unit,
)


def list_domains(db: Session) -> list[Domain]:
    """Les domaines de l'utilisateur : le domaine système n'y figure pas."""
    return list(
        db.scalars(select(Domain).where(Domain.system.is_(False)).order_by(Domain.name))
    )


def get_domain(db: Session, domain_id: uuid.UUID) -> Domain | None:
    return db.get(Domain, domain_id)


def _next_color(db: Session) -> str:
    """La couleur par défaut d'un nouveau domaine : la suivante dans l'ordre de
    la palette selon le nombre de domaines — la présélection du formulaire."""
    palette = get_args(DomainColor)
    count = (
        db.scalar(
            select(func.count()).select_from(Domain).where(Domain.system.is_(False))
        )
        or 0
    )
    return palette[count % len(palette)]


def create_domain(db: Session, payload: DomainCreate) -> Domain:
    data = payload.model_dump()
    data["color"] = data["color"] or _next_color(db)
    domain = Domain(**data)
    db.add(domain)
    db.commit()
    db.refresh(domain)
    return domain


def update_domain(db: Session, domain: Domain, payload: DomainUpdate) -> Domain:
    if domain.system:
        raise SystemDomainLocked
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(domain, field, value)
    db.commit()
    db.refresh(domain)
    return domain


def domain_counters(db: Session, domain: Domain) -> list[DomainCounter]:
    """Les compteurs du domaine : les heures d'abord, puis une unité par
    valeur déclarée, dans l'ordre où elles sont apparues.

    Mêmes règles qu'un Total : seules les activités faites comptent, la durée
    se lit au calendrier. Le jour d'une activité est celui où elle est posée ;
    non datée, celui de sa création.
    """
    activities = db.scalars(
        select(Activity)
        .where(Activity.domain_id == domain.id, Activity.done.is_(True))
        .options(selectinload(Activity.values).selectinload(ActivityValue.unit))
    ).all()
    return counters_of(activities)


def counters_of(activities: Iterable[Activity]) -> list[DomainCounter]:
    """Les compteurs de ces activités, faites ou non : seules les faites
    comptent. Partagé par le domaine et le projet (#194)."""
    activities = [a for a in activities if a.done]
    year = date.today().year

    def day(activity: Activity) -> date:
        return (activity.start_at or activity.created_at).date()

    counters: list[DomainCounter] = []
    hours = tally(((day(a), a.duration_hours) for a in activities), year)
    if hours is not None:
        counters.append(DomainCounter(unit=None, **vars(hours)))

    by_unit: dict[uuid.UUID, tuple[Unit, list[tuple[date, float]]]] = {}
    for activity in activities:
        for value in activity.values:
            entry = by_unit.setdefault(value.unit_id, (value.unit, []))
            entry[1].append((day(activity), value.value))
    unit_counters = [
        DomainCounter(unit=unit, **vars(found))
        for unit, entries in by_unit.values()
        if (found := tally(entries, year)) is not None
    ]
    unit_counters.sort(key=lambda c: (c.since, c.unit.name.lower()))
    return counters + unit_counters
