"""Use cases sur les compétences.

Un savoir appartient à **un seul** domaine, et chaque domaine possède son arbre.
Invariants tenus ici : un parent du **même domaine**, pas de cycle.
"""

import uuid
from collections.abc import Collection

from sqlalchemy import select
from sqlalchemy.orm import Session

from sophia.application import sequence as sequence_use_cases
from sophia.application.schemas.skill import SkillCreate, SkillUpdate
from sophia.domain.skill import (
    CrossDomainParent,
    ParentNotFound,
    SkillCycle,
)
from sophia.infrastructure.models import Project, Skill, project_skills


def resolve_linkable_skill(
    db: Session,
    domain_ids: Collection[uuid.UUID],
    skill_id: uuid.UUID,
    *,
    not_found: type[Exception],
    other_domain: type[Exception],
) -> Skill:
    """Charge une compétence **liable** dans ces domaines.

    Deux conditions, valables partout où une compétence se rattache à quelque
    chose : elle existe, et elle est **d'un des domaines** visés — celui d'une
    activité, ceux d'un projet (#203). Avoir des enfants n'y
    change rien : un parent est un savoir et se lie comme les autres.

    La règle est posée ici et nulle part ailleurs. Les **types d'erreur sont
    injectés** parce que le motif du refus se raconte différemment selon
    l'appelant : un projet explique qu'une condition ne pourrait jamais être
    remplie, une activité qu'elle ne peut pas porter ce savoir. Une seule règle,
    des messages qui restent contextuels.
    """
    skill = db.get(Skill, skill_id)
    if skill is None:
        raise not_found(str(skill_id))
    if skill.domain_id not in domain_ids:
        raise other_domain(str(skill_id))
    return skill


def _descendant_ids(db: Session, skill_id: uuid.UUID) -> set[uuid.UUID]:
    """Tous les descendants (à tous les niveaux) de `skill_id`."""
    descendants: set[uuid.UUID] = set()
    frontier = [skill_id]
    while frontier:
        current = frontier.pop()
        child_ids = db.scalars(
            select(Skill.id).where(Skill.parent_skill_id == current)
        ).all()
        for child_id in child_ids:
            descendants.add(child_id)
            frontier.append(child_id)
    return descendants


def validate_new_skill(
    db: Session, domain_id: uuid.UUID, parent_id: uuid.UUID | None
) -> None:
    """Vérifie qu'une nouvelle compétence peut être créée sous `parent_id`.

    Le parent doit être **du domaine** dans lequel on crée.
    """
    if parent_id is None:
        return  # racine : profondeur 1, toujours valide

    parent = db.get(Skill, parent_id)
    if parent is None:
        raise ParentNotFound(str(parent_id))
    if parent.domain_id != domain_id:
        raise CrossDomainParent(str(parent_id))


def validate_reparent(
    db: Session, skill: Skill, new_parent_id: uuid.UUID | None
) -> None:
    """Vérifie qu'une compétence peut passer sous un parent.

    Le parent doit être **du même domaine** : déplacer une branche vers un autre
    domaine n'est pas un geste de l'app (23/09/2026). Remonter à la racine reste
    toujours possible — c'est la racine du domaine du savoir.
    """
    if new_parent_id is None:
        return

    parent = db.get(Skill, new_parent_id)
    if parent is None:
        raise ParentNotFound(str(new_parent_id))
    if parent.domain_id != skill.domain_id:
        raise CrossDomainParent(str(new_parent_id))
    if new_parent_id == skill.id or new_parent_id in _descendant_ids(db, skill.id):
        raise SkillCycle(str(new_parent_id))


def list_skills(db: Session, domain_id: uuid.UUID) -> list[Skill]:
    """Les savoirs d'un domaine ; le front reconstruit l'arbre."""
    return list(
        db.scalars(
            select(Skill)
            .where(Skill.domain_id == domain_id)
            .order_by(Skill.order, Skill.name)
        )
    )


def get_skill(db: Session, skill_id: uuid.UUID) -> Skill | None:
    return db.get(Skill, skill_id)


def create_skill(db: Session, domain_id: uuid.UUID, payload: SkillCreate) -> Skill:
    validate_new_skill(db, domain_id, payload.parent_skill_id)
    data = payload.model_dump()
    if data["order"] is None:
        # Sans rang demandé, le savoir arrive **en dernier** parmi ses frères :
        # un rang 0 le ferait partager celui de l'aîné.
        siblings = _siblings(db, domain_id, payload.parent_skill_id)
        data["order"] = max((s.order for s in siblings), default=-1) + 1
    skill = Skill(domain_id=domain_id, **data)
    db.add(skill)
    db.commit()
    db.refresh(skill)
    return skill


def update_skill(db: Session, skill: Skill, payload: SkillUpdate) -> Skill:
    """Met à jour la compétence — nom, description, statut, ordre.

    Aucune règle de nature : tout nœud est un savoir, qu'il ait des enfants ou
    non, et son statut lui est propre.
    """
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(skill, field, value)
    db.commit()
    db.refresh(skill)
    return skill


def _siblings(
    db: Session, domain_id: uuid.UUID, parent_id: uuid.UUID | None
) -> list[Skill]:
    return list(
        db.scalars(
            select(Skill)
            .where(Skill.domain_id == domain_id, Skill.parent_skill_id == parent_id)
            .order_by(Skill.order, Skill.name)
        )
    )


def _renumber(siblings: list[Skill]) -> None:
    """Un ordre dense, dans l'ordre donné : 0, 1, 2…"""
    for i, s in enumerate(siblings):
        s.order = i


def _linked_projects(db: Session, skill_ids: set[uuid.UUID]) -> list[Project]:
    rows = db.execute(
        select(project_skills.c.project_id)
        .where(project_skills.c.skill_id.in_(skill_ids))
        .distinct()
    )
    return [db.get(Project, oid) for (oid,) in rows]


def delete_skill(db: Session, skill: Skill, children: str = "delete") -> None:
    """Supprime un savoir du domaine (design #27, `prod/Savoirs`).

    Ses enfants partent avec lui (`delete`, la cascade), ou **remontent** à sa
    place, sous son parent (`lift`). Les projets qui le visaient le perdent :
    leur séquence se resserre.
    """
    parent_id = skill.parent_skill_id
    gone = {skill.id}
    if children == "lift":
        siblings = _siblings(db, skill.domain_id, parent_id)
        at = siblings.index(skill)
        kids = _siblings(db, skill.domain_id, skill.id)
        for k in kids:
            k.parent_skill_id = parent_id
        _renumber(siblings[:at] + kids + siblings[at + 1 :])
    else:
        gone |= _descendant_ids(db, skill.id)
    projects = _linked_projects(db, gone)
    db.delete(skill)
    db.flush()
    if children != "lift":
        _renumber(
            [s for s in _siblings(db, skill.domain_id, parent_id) if s.id != skill.id]
        )
    for project in projects:
        sequence_use_cases.normalize_sequence(db, project)
    db.commit()


def reparent_skill(
    db: Session,
    skill: Skill,
    new_parent_id: uuid.UUID | None,
    index: int | None = None,
) -> Skill:
    """Range un savoir sous un autre parent — ou sous le même, à un autre rang.

    Les frères d'arrivée prennent un ordre dense, le savoir à `index` (en
    dernier sans lui) ; ceux qu'il quitte se resserrent.
    """
    validate_reparent(db, skill, new_parent_id)
    old_parent = skill.parent_skill_id
    skill.parent_skill_id = new_parent_id
    db.flush()
    if old_parent != new_parent_id:
        _renumber(
            [s for s in _siblings(db, skill.domain_id, old_parent) if s.id != skill.id]
        )
    others = [
        s for s in _siblings(db, skill.domain_id, new_parent_id) if s.id != skill.id
    ]
    at = len(others) if index is None else min(index, len(others))
    _renumber(others[:at] + [skill] + others[at:])
    db.commit()
    db.refresh(skill)
    return skill


def list_all_skills(db: Session) -> list[Skill]:
    """Tous les savoirs, tous domaines confondus."""
    return list(db.scalars(select(Skill).order_by(Skill.order, Skill.name)))
