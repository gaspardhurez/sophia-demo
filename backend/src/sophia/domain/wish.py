"""Règles des envies et engagements (#215) — fonctions pures."""

import uuid
from collections.abc import Sequence


class WishError(Exception):
    """Une liste d'envies ou d'engagements invalide."""


class DuplicateWishId(WishError):
    """La même puce figure deux fois dans la liste."""


class WishOfAnotherKind(WishError):
    """La puce appartient à l'autre liste : une envie ne devient pas un
    engagement en changeant de liste."""


class WishDomainNotFound(WishError):
    """Le domaine d'une puce n'existe pas."""


def check_list(ids: Sequence[uuid.UUID], ids_of_other_kind: set[uuid.UUID]) -> None:
    """Chaque puce une fois, et aucune prise à l'autre liste."""
    if len(set(ids)) != len(ids):
        raise DuplicateWishId
    if ids_of_other_kind.intersection(ids):
        raise WishOfAnotherKind
