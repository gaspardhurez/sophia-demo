"""Tests du modèle Project — au cœur, les cascades du lien M2M.

Rappel : une suppression faite par la base (ON DELETE CASCADE) est invisible pour
l'ORM. On capture les `id` avant, et on `expire_all()` après commit pour forcer
les lectures à taper la base.
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from sophia.application.project_domains import delete_domain
from sophia.infrastructure.models import (
    Domain,
    Project,
    ProjectDomain,
    Skill,
    project_skills,
)
from tests.helpers import make_skill, period_dates


def _link_count(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(project_skills))


def _setup(db: Session) -> tuple[Domain, Project, Skill]:
    """Un domaine, une compétence, un projet ; le projet lie la compétence."""
    domain = Domain(name="Cuisine")
    db.add(domain)
    db.flush()

    skill = make_skill(db, domain, "Émulsions")

    start_at, due_at = period_dates()
    project = Project(
        domain_links=[ProjectDomain(domain_id=domain.id, position=0)],
        title="Maîtriser les sauces mères",
        start_at=start_at,
        due_at=due_at,
    )
    project.skills.append(skill)
    db.add(project)
    db.commit()

    return domain, project, skill


def test_link_is_persisted(db: Session) -> None:
    _domain, project, skill = _setup(db)
    project_id = project.id

    assert _link_count(db) == 1
    db.expire_all()
    assert db.get(Project, project_id).skills[0].id == skill.id


def test_deleting_project_removes_links_keeps_skill(db: Session) -> None:
    _domain, project, skill = _setup(db)
    project_id, skill_id = project.id, skill.id

    db.delete(project)
    db.commit()
    db.expire_all()

    assert db.get(Project, project_id) is None
    assert _link_count(db) == 0
    # La compétence liée survit à la suppression du projet.
    assert db.get(Skill, skill_id) is not None


def test_deleting_skill_removes_links_keeps_project(db: Session) -> None:
    _domain, project, skill = _setup(db)
    project_id, skill_id = project.id, skill.id

    db.delete(skill)
    db.commit()
    db.expire_all()

    assert db.get(Skill, skill_id) is None
    assert _link_count(db) == 0
    # Le projet survit : il perd juste ce lien.
    survivor = db.get(Project, project_id)
    assert survivor is not None
    assert survivor.skills == []


def test_deleting_domain_cascades_projects_and_links(db: Session) -> None:
    domain, project, _skill = _setup(db)
    domain_id, project_id = domain.id, project.id

    delete_domain(db, domain)
    db.expire_all()

    assert db.get(Domain, domain_id) is None
    assert db.get(Project, project_id) is None
    assert _link_count(db) == 0
