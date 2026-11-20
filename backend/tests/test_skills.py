"""Tests du modèle Skill : cascade de sous-arbre + appartenance M2M aux domaines.

Note SQLAlchemy : une suppression faite par la base via ON DELETE CASCADE est
invisible pour l'ORM. D'où : on capture les `id` avant, et on `expire_all()`
après commit pour forcer les lectures à taper la base.
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from sophia.application.project_domains import delete_domain
from sophia.infrastructure.models import Domain, Skill
from tests.helpers import make_skill


def _skill_count(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(Skill))


def _tree(db: Session) -> tuple[Domain, Skill, Skill, Skill]:
    """Domaine → racine → enfant → petit-enfant (3 niveaux)."""
    domain = Domain(name="Maths")
    db.add(domain)
    db.flush()
    root = make_skill(db, domain, "Algèbre")
    child = make_skill(db, domain, "Équations", parent=root)
    grandchild = make_skill(db, domain, "Second degré", parent=child)
    db.commit()
    return domain, root, child, grandchild


def test_deleting_skill_cascades_to_subtree(db: Session) -> None:
    domain, root, _child, _grandchild = _tree(db)
    domain_id = domain.id
    assert _skill_count(db) == 3

    db.delete(root)
    db.commit()
    db.expire_all()

    # Racine supprimée → enfant et petit-enfant partent avec (cascade parent).
    assert _skill_count(db) == 0
    assert db.get(Domain, domain_id) is not None


def test_deleting_domain_removes_its_skills(db: Session) -> None:
    domain, _root, _child, _grandchild = _tree(db)
    domain_id = domain.id
    assert _skill_count(db) == 3

    delete_domain(db, domain)  # ses savoirs partent avec lui (cascade)
    db.expire_all()

    assert db.get(Domain, domain_id) is None
    assert _skill_count(db) == 0


def test_deleting_a_domain_spares_the_others(db: Session) -> None:
    """Supprimer un domaine emporte ses savoirs, et seulement les siens."""
    maths = Domain(name="Maths")
    physique = Domain(name="Physique")
    db.add_all([maths, physique])
    db.flush()
    make_skill(db, maths, "Algèbre")
    kept = make_skill(db, physique, "Mécanique")
    db.commit()
    kept_id = kept.id

    delete_domain(db, maths)
    db.expire_all()

    assert _skill_count(db) == 1
    assert db.get(Skill, kept_id) is not None


def test_deleting_intermediate_skill_keeps_ancestors(db: Session) -> None:
    _domain, root, child, grandchild = _tree(db)
    root_id, grandchild_id = root.id, grandchild.id

    db.delete(child)
    db.commit()
    db.expire_all()

    assert _skill_count(db) == 1
    assert db.get(Skill, root_id) is not None
    assert db.get(Skill, grandchild_id) is None
