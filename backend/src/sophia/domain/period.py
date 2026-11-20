"""Les étapes dans la période de leur projet (design #27, 24/09/2026).

Déplacer une borne du projet ne se bloque sur aucune étape : l'étape
qu'elle chevauche est **raccourcie** jusqu'à la nouvelle borne, celle qu'elle
recouvre entièrement **perd ses dates** (« Sans dates »). Seul blocage : un
début après la fin, que le sélecteur empêche de choisir.

Une étape sans ses deux dates n'est pas touchée : elle ne se lit pas comme
une plage.
"""

from dataclasses import dataclass
from datetime import date, timedelta


def clip_step(
    start: date | None,
    due: date | None,
    period_start: date | None,
    period_due: date | None,
) -> tuple[date | None, date | None]:
    """La plage d'une étape une fois la période du projet posée."""
    if start is None or due is None:
        return start, due
    if period_start is not None and start < period_start:
        if due < period_start:
            return None, None
        start = period_start
    if period_due is not None and due > period_due:
        if start > period_due:
            return None, None
        due = period_due
    return start, due


@dataclass(frozen=True)
class Neighbor:
    """Une autre étape du projet, telle que la pose d'une plage la voit."""

    key: object
    order: int
    start: date | None
    due: date | None


def place_step(
    order: int,
    start: date,
    due: date,
    others: list[Neighbor],
    period_start: date | None,
    period_due: date | None,
) -> tuple[dict[object, tuple[date | None, date | None]], date | None, date | None]:
    """Ce que la pose d'une plage sur une étape fait autour d'elle.

    Aucune date d'étape n'est bloquée : la voisine d'avant qu'elle chevauche
    finit la veille, celle d'après commence le lendemain ; recouverte, elle
    perd ses dates. Hors de la période, c'est la borne du projet qui se
    décale. Rend les voisines changées et la période qui en résulte.
    """
    changed: dict[object, tuple[date | None, date | None]] = {}
    for n in others:
        if n.start is None or n.due is None or start > n.due or due < n.start:
            continue
        if n.order < order:
            end = start - timedelta(days=1)
            changed[n.key] = (None, None) if end < n.start else (n.start, end)
        else:
            begin = due + timedelta(days=1)
            changed[n.key] = (None, None) if begin > n.due else (begin, n.due)
    if period_start is not None and start < period_start:
        period_start = start
    if period_due is not None and due > period_due:
        period_due = due
    return changed, period_start, period_due
