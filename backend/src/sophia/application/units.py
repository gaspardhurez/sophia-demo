"""Use cases du référentiel d'unités.

Catalogue **construit à l'usage** : aucune graine, on crée l'unité au moment
où on en a besoin depuis le sélecteur.
"""

import uuid

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from sophia.application.schemas.unit import UnitCreate, UnitUpdate, UnitUsage
from sophia.domain.unit import DuplicateUnitName, UnitReplacedByItself
from sophia.infrastructure.models import (
    ActivityType,
    ActivityValue,
    Metric,
    ProjectTotal,
    Unit,
)


def list_units(db: Session) -> list[Unit]:
    return list(db.scalars(select(Unit).order_by(Unit.name)))


def get_unit(db: Session, unit_id: uuid.UUID) -> Unit | None:
    return db.get(Unit, unit_id)


def _check_name_free(db: Session, name: str, exclude: uuid.UUID | None = None) -> None:
    stmt = select(Unit).where(func.lower(Unit.name) == name.strip().lower())
    if exclude is not None:
        stmt = stmt.where(Unit.id != exclude)
    if db.scalar(stmt) is not None:
        raise DuplicateUnitName


def create_unit(db: Session, payload: UnitCreate) -> Unit:
    _check_name_free(db, payload.name)
    unit = Unit(**payload.model_dump())
    unit.name = unit.name.strip()
    db.add(unit)
    db.commit()
    db.refresh(unit)
    return unit


def update_unit(db: Session, unit: Unit, payload: UnitUpdate) -> Unit:
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        _check_name_free(db, data["name"], exclude=unit.id)
        data["name"] = data["name"].strip()
    for field, value in data.items():
        setattr(unit, field, value)
    db.commit()
    db.refresh(unit)
    return unit


def _count(db: Session, column) -> int:
    return db.scalar(select(func.count()).where(column)) or 0


def unit_usage(db: Session, unit: Unit) -> UnitUsage:
    """Ce qu'emploie cette unité : Totaux, valeurs, métriques, activités types."""
    return UnitUsage(
        totals=_count(db, ProjectTotal.unit_id == unit.id),
        values=_count(db, ActivityValue.unit_id == unit.id),
        metrics=_count(db, Metric.unit_id == unit.id),
        activity_types=_count(db, ActivityType.unit_id == unit.id),
    )


def delete_unit(db: Session, unit: Unit, replace_by: Unit | None = None) -> None:
    """Supprime l'unité — en basculant d'abord ce qui l'emploie, si on la
    remplace (décision du 24/09/2026, design #27).

    **Sans remplacement**, la base tranche : Totaux et valeurs déclarées sont
    supprimés (CASCADE — un Total en km sans km ne veut rien dire), métriques
    et activités types sont déliées (SET NULL — elles fonctionnent sans unité).

    **Avec remplacement** — le geste du ménage, un doublon ou une faute de
    frappe —, tout bascule vers l'autre unité, puis celle-ci disparaît. Aucun
    nombre n'est converti. Une activité qui porte déjà une valeur dans l'unité
    de remplacement garde celle-là : cas non traité, assumé.
    """
    if replace_by is not None:
        if replace_by.id == unit.id:
            raise UnitReplacedByItself
        _transfer(db, unit.id, replace_by.id)
    db.delete(unit)
    db.commit()


def _transfer(db: Session, old: uuid.UUID, new: uuid.UUID) -> None:
    for model, column in (
        (ActivityType, ActivityType.unit_id),
        (Metric, Metric.unit_id),
        (ProjectTotal, ProjectTotal.unit_id),
    ):
        db.execute(update(model).where(column == old).values({column.key: new}))
    already = set(
        db.scalars(
            select(ActivityValue.activity_id).where(ActivityValue.unit_id == new)
        )
    )
    for value in db.scalars(select(ActivityValue).where(ActivityValue.unit_id == old)):
        if value.activity_id in already:
            db.delete(value)
        else:
            value.unit_id = new
    db.flush()
