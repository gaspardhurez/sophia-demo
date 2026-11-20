"""Endpoints REST des compétences.

Routes nichées sous le domaine pour lister/créer (un skill appartient toujours à
un domaine), à plat pour l'unitaire. Le changement de parent a son endpoint
dédié `reparent` — jamais via le PATCH générique.
"""

import uuid
from typing import Literal

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.orm import Session

from sophia.api.deps import DbSession
from sophia.application import domains as domain_use_cases
from sophia.application import skills as use_cases
from sophia.application.schemas.skill import (
    SkillCreate,
    SkillRead,
    SkillReparent,
    SkillUpdate,
)
from sophia.infrastructure.models import Skill

router = APIRouter(tags=["skills"])


def _domain_or_404(db: Session, domain_id: uuid.UUID) -> None:
    if domain_use_cases.get_domain(db, domain_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Domaine introuvable")


def _get_skill_or_404(db: Session, skill_id: uuid.UUID) -> Skill:
    skill = use_cases.get_skill(db, skill_id)
    if skill is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Compétence introuvable")
    return skill


@router.get(
    "/domains/{domain_id}/skills",
    response_model=list[SkillRead],
    operation_id="listSkills",
)
def list_skills(domain_id: uuid.UUID, db: DbSession) -> list[Skill]:
    _domain_or_404(db, domain_id)
    return use_cases.list_skills(db, domain_id)


@router.post(
    "/domains/{domain_id}/skills",
    response_model=SkillRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="createSkill",
)
def create_skill(domain_id: uuid.UUID, payload: SkillCreate, db: DbSession) -> Skill:
    _domain_or_404(db, domain_id)
    return use_cases.create_skill(db, domain_id, payload)


@router.get(
    "/skills",
    response_model=list[SkillRead],
    operation_id="listAllSkills",
)
def list_all_skills(db: DbSession) -> list[Skill]:
    """Tous les savoirs, tous domaines confondus."""
    return use_cases.list_all_skills(db)


@router.get("/skills/{skill_id}", response_model=SkillRead, operation_id="getSkill")
def get_skill(skill_id: uuid.UUID, db: DbSession) -> Skill:
    return _get_skill_or_404(db, skill_id)


@router.patch(
    "/skills/{skill_id}", response_model=SkillRead, operation_id="updateSkill"
)
def update_skill(skill_id: uuid.UUID, payload: SkillUpdate, db: DbSession) -> Skill:
    return use_cases.update_skill(db, _get_skill_or_404(db, skill_id), payload)


@router.delete(
    "/skills/{skill_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="deleteSkill",
)
def delete_skill(
    skill_id: uuid.UUID,
    db: DbSession,
    children: Literal["delete", "lift"] = "delete",
) -> None:
    """`children=lift` : ses enfants remontent à sa place au lieu de partir avec."""
    use_cases.delete_skill(db, _get_skill_or_404(db, skill_id), children)


@router.post(
    "/skills/{skill_id}/reparent",
    response_model=SkillRead,
    operation_id="reparentSkill",
)
def reparent_skill(skill_id: uuid.UUID, payload: SkillReparent, db: DbSession) -> Skill:
    skill = _get_skill_or_404(db, skill_id)
    return use_cases.reparent_skill(db, skill, payload.new_parent_id, payload.index)
