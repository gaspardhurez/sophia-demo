"""Les domaines d'un projet (#203).

Un projet a un ou plusieurs domaines, dans l'ordre : le premier est le
**principal** — sa couleur, et le projet part avec lui. Les savoirs, les
activités types, les métriques et les activités qu'il lie peuvent venir de
chacun. Quand un domaine le quitte — retiré du projet, ou supprimé alors qu'il
n'était que secondaire —, ce qui en venait se délie (`domain_ties` le dit
avant) ; le projet, lui, reste.

Vit à part de `projects` et de `domains` : il s'appuie sur les deux.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from sophia.application import activity_types as type_use_cases
from sophia.application import projects as project_use_cases
from sophia.application.schemas.domain import DomainUsage, UnlinkedProject
from sophia.application.schemas.project import NamedRef, ProjectDomainTies
from sophia.domain.domain import SystemDomainLocked
from sophia.infrastructure.models import (
    Activity,
    ActivityProject,
    ActivityType,
    Domain,
    Metric,
    Project,
    ProjectDomain,
    Skill,
)


def _projects_of(db: Session, domain: Domain) -> list[Project]:
    return list(
        db.scalars(
            select(Project).where(
                Project.domain_links.any(ProjectDomain.domain_id == domain.id)
            )
        )
    )


def _activity_links(
    db: Session, project: Project, domain_id: uuid.UUID
) -> list[ActivityProject]:
    """Les liens au projet des activités de ce domaine."""
    return list(
        db.scalars(
            select(ActivityProject)
            .join(Activity)
            .where(
                ActivityProject.project_id == project.id,
                Activity.domain_id == domain_id,
            )
        )
    )


def domain_ties(
    db: Session, project: Project, domain_id: uuid.UUID
) -> ProjectDomainTies:
    """Ce que le projet perdrait si ce domaine le quittait."""
    return ProjectDomainTies(
        skills=[
            NamedRef(id=s.id, title=s.name)
            for s in project.skills
            if s.domain_id == domain_id
        ],
        activity_types=[
            NamedRef(id=link.activity_type.id, title=link.activity_type.title)
            for link in project.activity_types
            if link.activity_type.domain_id == domain_id
        ],
        results=[
            NamedRef(id=link.metric.id, title=link.metric.name)
            for link in project.metrics
            if link.metric.domain_id == domain_id
        ],
        activities=len(_activity_links(db, project, domain_id)),
    )


def _detach(db: Session, project: Project, domain_id: uuid.UUID) -> None:
    """Délie du projet ce qui vient de ce domaine, sans valider la
    transaction. Chaque lien part par le chemin de son retrait à l'unité :
    un savoir quitte les étapes, la séquence et ses cycles pour ce projet ;
    une activité type, les Totaux qui la comptaient ; un Résultat, les
    étapes qui le distribuaient. Les objets eux-mêmes restent au domaine."""
    project_use_cases.relink_skills(
        db, project, [s.id for s in project.skills if s.domain_id != domain_id]
    )
    for link in list(project.activity_types):
        if link.activity_type.domain_id == domain_id:
            type_use_cases.detach_link(db, project, link)
    for link in list(project.metrics):
        if link.metric.domain_id == domain_id:
            project.metrics.remove(link)
            project.undistribute_metric(link.metric_id)
    for link in _activity_links(db, project, domain_id):
        db.delete(link)


def set_project_domains(
    db: Session, project: Project, domain_ids: list[uuid.UUID]
) -> Project:
    """Les domaines du projet, remplacés dans l'ordre : le premier devient le
    principal (réordonner ne perd rien). Un domaine retiré délie ce qui en
    venait — la confirmation l'a énuméré avant (`domain_ties`)."""
    links = project_use_cases.domain_links(db, domain_ids)
    for domain_id in set(project.domain_ids) - set(domain_ids):
        _detach(db, project, domain_id)
    # Les liens qui restent gardent leur ligne : seule la position change.
    kept = {link.domain_id: link for link in project.domain_links}
    project.domain_links = [kept.get(link.domain_id, link) for link in links]
    for position, link in enumerate(project.domain_links):
        link.position = position
    db.commit()
    db.refresh(project)
    return project


def domain_usage(db: Session, domain: Domain) -> DomainUsage:
    """Ce que la suppression du domaine emporterait (CASCADE), compté, et
    les projets qu'elle délierait (#203)."""

    def count(model: type) -> int:
        return (
            db.scalar(
                select(func.count())
                .select_from(model)
                .where(model.domain_id == domain.id)
            )
            or 0
        )

    projects = _projects_of(db, domain)
    return DomainUsage(
        skills=count(Skill),
        projects=sum(p.principal_domain_id == domain.id for p in projects),
        activities=count(Activity),
        activity_types=count(ActivityType),
        metrics=count(Metric),
        unlinked=[
            UnlinkedProject(
                id=p.id,
                title=p.title,
                remaining_domain_ids=[d for d in p.domain_ids if d != domain.id],
                loses=domain_ties(db, p, domain.id),
            )
            for p in projects
            if p.principal_domain_id != domain.id
        ],
    )


def delete_domain(db: Session, domain: Domain) -> None:
    """Supprime le domaine : ses savoirs, activités, activités types et
    métriques partent avec lui (cascade), comme les projets dont il est le
    principal. Ceux dont il n'est que secondaire sont déliés (#203) : ils
    perdent ce qui venait de lui et restent dans leurs autres domaines."""
    if domain.system:
        raise SystemDomainLocked
    for project in _projects_of(db, domain):
        if project.principal_domain_id == domain.id:
            project_use_cases.delete_project(db, project)
            continue
        _detach(db, project, domain.id)
        project.domain_links = [
            link for link in project.domain_links if link.domain_id != domain.id
        ]
        for position, link in enumerate(project.domain_links):
            link.position = position
    # Les déliements d'abord : la cascade du domaine ne doit pas les devancer.
    db.flush()
    db.delete(domain)
    db.commit()
