"""Tests purs des liens d'une ressource au périmètre de son cycle (30/10)."""

import pytest

from sophia.domain.framing import ScopeTag, parse_scope, scope_parts
from sophia.domain.plan import PlanScopePartUnknown
from sophia.domain.scope_links import follow_scope, link_scope_parts

SCOPE = "Le geste\nLa préparation\nLes erreurs\nHors de ce cycle : Le smash"


def test_scope_parts_are_the_retained_parts_in_order():
    assert scope_parts(SCOPE) == ["Le geste", "La préparation", "Les erreurs"]
    assert scope_parts(None) == []


def test_parse_scope_reads_the_old_one_line_scope_like_the_front():
    # Phase 1 : tout sur une ligne, séparé par « · » ; un doublon ne compte
    # qu'une fois (`parseScope` côté front).
    assert parse_scope("Le geste · L'usage\nLe geste\nHors de ce cycle : a · b") == [
        ScopeTag("Le geste", True),
        ScopeTag("L'usage", True),
        ScopeTag("a", False),
        ScopeTag("b", False),
    ]


def test_link_keeps_scope_order_without_duplicates():
    assert link_scope_parts(["Les erreurs", "Le geste", "Le geste"], SCOPE) == [
        "Le geste",
        "Les erreurs",
    ]
    assert link_scope_parts([], SCOPE) == []


@pytest.mark.parametrize("label", ["Le smash", "Inconnue", "le geste"])
def test_link_refuses_an_edge_or_an_unknown_part(label: str):
    with pytest.raises(PlanScopePartUnknown):
        link_scope_parts([label], SCOPE)


def test_link_refuses_everything_without_scope():
    with pytest.raises(PlanScopePartUnknown):
        link_scope_parts(["Le geste"], None)


def test_follow_applies_renames_then_keeps_retained_parts():
    new = "Le geste complet\nLa préparation\nHors de ce cycle : Les erreurs"
    linked = ["Le geste", "Les erreurs"]

    assert follow_scope(linked, new, {"Le geste": "Le geste complet"}) == [
        "Le geste complet"
    ]


def test_follow_drops_an_undeclared_rename_and_an_emptied_scope():
    assert follow_scope(["Le geste"], "Le geste précis", {}) == []
    assert follow_scope(["Le geste"], None, {}) == []


def test_follow_renames_together_not_in_chain():
    # a → b et b → a : un échange, pas une chaîne.
    scope = "a\nb"
    assert follow_scope(["a"], scope, {"a": "b", "b": "a"}) == ["b"]


def test_follow_merges_two_parts_renamed_into_one():
    assert follow_scope(["a", "b"], "c", {"a": "c", "b": "c"}) == ["c"]
