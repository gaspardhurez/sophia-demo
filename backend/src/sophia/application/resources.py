"""Use cases des ressources d'un savoir (design #81, chantier module-etude §3)
et de leurs notes (#173).

Une ressource appartient au savoir ; chaque cycle choisit celles qu'il étudie
(`plans.update_plan`, `resource_ids`), dans un ordre, avec une case
« consommée » (`plans.reorder_resources`, `plans.update_plan_resource`).
"""

import uuid
from typing import Any, Protocol

from sqlalchemy.orm import Session

from sophia.application import plans as plan_use_cases
from sophia.application.schemas.resource import (
    ResourceCreate,
    ResourceNotesWrite,
    ResourceUpdate,
)
from sophia.domain.link_title import PageInfo, page_info
from sophia.domain.resource import ResourcePlanMismatch, ResourceSkillNotFound
from sophia.domain.resource_kind import (
    LinkPage,
    ResourceKind,
    kind_from_page,
    kind_from_url,
)
from sophia.infrastructure.models import (
    AcquisitionPlan,
    Resource,
    ResourceNotes,
    Skill,
)
from sophia.infrastructure.web import fetch_html


class LinkReader(Protocol):
    """Lire un lien (`infrastructure/link_reader.py`) : ce qu'il faut pour en
    déduire la sorte ; `None` s'il ne répond pas."""

    def read(self, url: str) -> LinkPage | None: ...


def resource_kind(reader: LinkReader, reference: str | None) -> ResourceKind | None:
    """La sorte d'une ressource d'après sa référence : le lien d'abord (sans
    réseau), sinon la page lue. Une référence sans lien n'en a pas (sa tuile
    est 📘 de toute façon)."""
    url = (reference or "").strip()
    if not url.lower().startswith(("http://", "https://")):
        return None
    if (kind := kind_from_url(url)) is not None:
        return kind
    page = reader.read(url)
    return kind_from_page(page) if page else None


def _load_skill(db: Session, skill_id: uuid.UUID) -> Skill:
    skill = db.get(Skill, skill_id)
    if skill is None:
        raise ResourceSkillNotFound(str(skill_id))
    return skill


def list_resources(db: Session, skill_id: uuid.UUID) -> list[Resource]:
    """La bibliothèque des ressources d'un savoir, dans l'ordre où elle s'est
    remplie."""
    return list(_load_skill(db, skill_id).resources)


def get_resource(db: Session, resource_id: uuid.UUID) -> Resource | None:
    return db.get(Resource, resource_id)


def create_resource(
    db: Session, skill_id: uuid.UUID, payload: ResourceCreate, reader: LinkReader
) -> Resource:
    """Repérer une ressource : elle entre dans la bibliothèque du savoir et,
    créée depuis un cycle, dans ce cycle."""
    skill = _load_skill(db, skill_id)
    plan = None
    if payload.plan_id is not None:
        plan = db.get(AcquisitionPlan, payload.plan_id)
        if plan is None or plan.skill_id != skill_id:
            raise ResourcePlanMismatch(str(payload.plan_id))
    resource = Resource(**payload.model_dump(exclude={"plan_id"}))
    resource.kind = resource_kind(reader, resource.reference)
    skill.resources.append(resource)
    if plan is not None:
        plan_use_cases.add_resource(plan, resource)
    db.commit()
    db.refresh(resource)
    return resource


def update_resource(
    db: Session, resource: Resource, payload: ResourceUpdate, reader: LinkReader
) -> Resource:
    """Un lien changé se relit : la sorte suit le lien."""
    before = resource.reference
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(resource, field, value)
    if resource.reference != before:
        resource.kind = resource_kind(reader, resource.reference)
    db.commit()
    db.refresh(resource)
    return resource


def delete_resource(db: Session, resource: Resource) -> None:
    """La ressource quitte la bibliothèque et tous les cycles qui l'étudiaient
    (leur ordre se recompacte) ; ses notes partent avec elle."""
    for link in list(resource.plan_links):
        plan_use_cases.remove_resource(link.plan, resource.id)
    db.delete(resource)
    db.commit()


def link_title(url: str) -> PageInfo:
    """Le titre et l'auteur de la page d'un lien, pour pré-remplir une
    ressource ; rien si la page ne répond pas."""
    html = fetch_html(url.strip())
    return page_info(html) if html else PageInfo(title=None, author=None)


def read_notes(resource: Resource) -> dict[str, Any]:
    """Les notes d'une ressource : un document nul tant qu'aucun n'a été
    écrit."""
    return {"doc": resource.notes.doc if resource.notes is not None else None}


def save_notes(
    db: Session, resource: Resource, payload: ResourceNotesWrite
) -> dict[str, Any]:
    """Remplace le document de la ressource, d'un bloc."""
    if resource.notes is None:
        resource.notes = ResourceNotes(doc=payload.doc)
    else:
        resource.notes.doc = payload.doc
    db.commit()
    db.refresh(resource)
    return read_notes(resource)
