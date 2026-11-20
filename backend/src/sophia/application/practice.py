"""Use cases sur la bibliothèque d'un savoir (V4).

Les objets de pratique appartiennent au savoir : on les repère avec ou sans
cycle. Leur place dans une rampe, leur verdict et leur rétention sont ceux d'un
cycle (`plans`, `PlanItem`).
"""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from sophia.application.schemas.practice import (
    PracticeItemCreate,
    PracticeItemUpdate,
)
from sophia.domain.practice import PracticePlanMismatch, PracticeSkillNotFound
from sophia.infrastructure.models import (
    AcquisitionPlan,
    ActivityAct,
    PlanItem,
    PracticeItem,
    Skill,
)


def _load_skill(db: Session, skill_id: uuid.UUID) -> Skill:
    skill = db.get(Skill, skill_id)
    if skill is None:
        raise PracticeSkillNotFound(str(skill_id))
    return skill


def list_practice_items(db: Session, skill_id: uuid.UUID) -> list[PracticeItem]:
    """La bibliothèque d'un savoir, par nature puis dans l'ordre où elle s'est
    remplie. L'ordre d'une rampe, lui, est celui de son cycle."""
    return list(
        db.scalars(
            select(PracticeItem)
            .options(selectinload(PracticeItem.acts).selectinload(ActivityAct.activity))
            .where(PracticeItem.skill_id == skill_id)
            .order_by(PracticeItem.nature, PracticeItem.created_at)
        )
    )


def get_practice_item(db: Session, item_id: uuid.UUID) -> PracticeItem | None:
    return db.get(PracticeItem, item_id)


def create_practice_item(
    db: Session, skill_id: uuid.UUID, payload: PracticeItemCreate
) -> PracticeItem:
    """Repérer un objet : il entre dans la bibliothèque, et, si un cycle est
    donné, en fin de sa rampe."""
    _load_skill(db, skill_id)
    plan = None
    if payload.plan_id is not None:
        plan = db.get(AcquisitionPlan, payload.plan_id)
        if plan is None or plan.skill_id != skill_id:
            raise PracticePlanMismatch(str(payload.plan_id))
    item = PracticeItem(skill_id=skill_id, **payload.model_dump(exclude={"plan_id"}))
    db.add(item)
    if plan is not None:
        ramp = [link for link in plan.items if link.item.nature is item.nature]
        rank = max((link.rank for link in ramp), default=-1) + 1
        plan.items.append(PlanItem(item=item, rank=rank))
    db.commit()
    db.refresh(item)
    return item


def update_practice_item(
    db: Session, item: PracticeItem, payload: PracticeItemUpdate
) -> PracticeItem:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


def delete_practice_item(db: Session, item: PracticeItem) -> None:
    """L'objet quitte la bibliothèque et toutes les rampes ; les séances qui
    le visaient survivent, déliées : elles ont eu lieu."""
    db.delete(item)
    db.commit()
