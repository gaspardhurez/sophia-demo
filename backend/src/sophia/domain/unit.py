"""Invariants métier du référentiel d'unités — pur, sans framework."""


class UnitError(Exception):
    """Base des violations d'invariant sur une unité."""


class DuplicateUnitName(UnitError):
    """Une unité porte déjà ce nom (comparaison insensible à la casse).

    Le référentiel existe précisément pour empêcher « km », « Km » et
    « kilomètres » de cohabiter : autoriser deux noms qui ne diffèrent que par
    la casse reviendrait à rouvrir la porte.
    """


class UnitReplacedByItself(UnitError):
    """Remplacer une unité par elle-même : rien ne bougerait, et elle disparaîtrait."""


def plural_of(singular: str) -> str:
    """Le pluriel par défaut d'un mot compté : « + s », sauf s'il finit déjà
    par s, x ou z (« fois », « prix », « nez » restent tels quels).

    Règle unique, pour les unités du catalogue comme pour le mot d'un Total au
    nombre (#58) : « fois » en « foiss » ne se relisait pas.
    """
    return singular if singular[-1:].lower() in ("s", "x", "z") else f"{singular}s"
