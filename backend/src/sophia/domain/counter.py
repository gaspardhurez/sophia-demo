"""Les compteurs d'un domaine — pur, sans framework.

Un compteur est une **trace** de ce qui a été fait, sans attendu : il cumule
depuis toujours (le domaine n'a pas de saison) et donne aussi le total de
l'année. Ce n'est pas un objectif ; un Total de projet en est la restriction à
une période et à des activités liées, plus une cible.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class Tally:
    """Le cumul d'un compteur."""

    total: float
    # Dont l'année donnée (celle d'aujourd'hui, à l'appel).
    year_total: float
    # Le jour de la première valeur : « Depuis le 3 janv. 2025 ».
    since: date


def tally(entries: Iterable[tuple[date, float]], year: int) -> Tally | None:
    """Cumule des apports `(jour, quantité)`. Rien d'apporté : pas de
    compteur — il apparaît seul, dès la première valeur."""
    kept = [(day, amount) for day, amount in entries if amount]
    if not kept:
        return None
    return Tally(
        total=sum(amount for _, amount in kept),
        year_total=sum(amount for day, amount in kept if day.year == year),
        since=min(day for day, _ in kept),
    )
