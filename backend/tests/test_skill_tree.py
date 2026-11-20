"""Tests de la logique d'arbre : anti-cycle, appartenance, profondeur libre.

Arbre global (parent canonique). La création exige un parent **membre du
domaine** ; le reparent est global (pas de contrainte de domaine, auto-extension
d'appartenance).
"""

import uuid

import pytest
from sqlalchemy.orm import Session

from sophia.application.skills import (
    reparent_skill,
    validate_new_skill,
    validate_reparent,
)
from sophia.domain.skill import (
    CrossDomainParent,
    ParentNotFound,
    SkillCycle,
)
from sophia.infrastructure.models import Domain
from tests.helpers import make_skill as _skill


def _domain(db: Session, name: str = "Maths") -> Domain:
    domain = Domain(name=name)
    db.add(domain)
    db.flush()
    return domain


# --- Création : appartenance & profondeur ---


def test_create_root_ok(db: Session) -> None:
    domain = _domain(db)
    validate_new_skill(db, domain.id, parent_id=None)  # profondeur 1, ne lève pas


def test_create_at_any_depth(db: Session) -> None:
    """**Plus de plafond.** Il valait 3 et c'était une limite de produit, tombée
    au premier domaine large : ranger l'informatique demande un niveau de
    tiroirs avant d'arriver aux sujets, et « DSA › Graphes › BFS » consommait
    déjà les trois. Ce qui garde l'arbre lisible est le test de la feuille, pas
    un compteur.
    """
    domain = _domain(db)
    parent = _skill(db, domain, "CS")
    for nom in ("DSA", "Graphes", "Parcours", "BFS"):
        validate_new_skill(db, domain.id, parent_id=parent.id)  # ne lève jamais
        parent = _skill(db, domain, nom, parent=parent)


def test_create_unknown_parent_rejected(db: Session) -> None:
    domain = _domain(db)

    with pytest.raises(ParentNotFound):
        validate_new_skill(db, domain.id, parent_id=uuid.uuid4())


def test_create_parent_from_other_domain_rejected(db: Session) -> None:
    maths = _domain(db, "Maths")
    physique = _domain(db, "Physique")
    parent = _skill(db, physique, "Mécanique")

    with pytest.raises(CrossDomainParent):
        validate_new_skill(db, maths.id, parent_id=parent.id)


# --- Reparent ---


def test_reparent_leaf_at_any_depth(db: Session) -> None:
    domain = _domain(db)
    parent = _skill(db, domain, "Algèbre")
    for nom in ("Équations", "Second degré"):
        parent = _skill(db, domain, nom, parent=parent)
    leaf = _skill(db, domain, "Nombres")

    validate_reparent(db, leaf, new_parent_id=parent.id)  # ne lève pas


def test_reparent_branch_at_any_depth(db: Session) -> None:
    """Déplacer une branche entière ne se heurte plus à sa hauteur."""
    domain = _domain(db)
    cible = _skill(db, domain, "Équations", parent=_skill(db, domain, "Algèbre"))
    branche = _skill(db, domain, "Géométrie")
    _skill(db, domain, "Triangles", parent=branche)

    validate_reparent(db, branche, new_parent_id=cible.id)  # ne lève pas


def test_reparent_branch_to_root_ok(db: Session) -> None:
    domain = _domain(db)
    branch = _skill(db, domain, "Géométrie")
    _skill(db, domain, "Triangles", parent=branch)  # hauteur 2, rentre à la racine

    validate_reparent(db, branch, new_parent_id=None)


# --- Reparent : cycles ---


def test_reparent_under_self_rejected(db: Session) -> None:
    domain = _domain(db)
    skill = _skill(db, domain, "Algèbre")

    with pytest.raises(SkillCycle):
        validate_reparent(db, skill, new_parent_id=skill.id)


def test_reparent_under_descendant_rejected(db: Session) -> None:
    domain = _domain(db)
    root = _skill(db, domain, "Algèbre")
    child = _skill(db, domain, "Équations", parent=root)

    with pytest.raises(SkillCycle):
        validate_reparent(db, root, new_parent_id=child.id)


# --- Reparent cross-domaine : refusé (un savoir, un domaine — 23/09/2026) ---


def test_reparent_across_domains_rejected(db: Session) -> None:
    """Changer une branche de domaine n'est pas un geste de l'app."""
    maths = _domain(db, "Maths")
    physique = _domain(db, "Physique")
    parent = _skill(db, physique, "Mécanique")
    moved = _skill(db, maths, "Vecteurs")
    db.commit()

    with pytest.raises(CrossDomainParent):
        reparent_skill(db, moved, parent.id)

    db.refresh(moved)
    assert moved.parent_skill_id is None
    assert moved.domain_id == maths.id
