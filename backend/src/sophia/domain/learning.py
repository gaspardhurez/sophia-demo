"""La vue d'ensemble de l'apprentissage (#152) : les règles pures. Sans
framework.

Chaque règle dit d'une chose qu'elle est **à faire** : une suggestion, jamais
un geste automatique. Le seuil est provisoire (décision du 25/10/2026) —
l'usage l'ajustera, c'est pourquoi il vit ici. Les suggestions tirées des
retours (pièce sue, pièce qui coince) et le savoir à l'arrêt sont retirés
depuis #155.
"""

from collections.abc import Sequence
from datetime import date, timedelta

#: À planifier : un savoir en cours sans séance dans ce nombre de jours.
UNPLANNED_HORIZON = timedelta(days=7)


def unplanned(upcoming: Sequence[date], today: date) -> bool:
    """Aucune séance à venir dans `UNPLANNED_HORIZON` (aujourd'hui compris)."""
    end = today + UNPLANNED_HORIZON
    return not any(today <= day < end for day in upcoming)


def phase_to_plan(phases: Sequence[tuple[str, bool]]) -> tuple[str, str] | None:
    """Les phases actives d'un cycle, dans l'ordre, chacune avec « complète » :
    la phase précédente et la **phase en cours** (la première pas complète),
    quand une phase complète la précède. Sans phase en cours (tout est fait)
    ou sans phase avant elle, rien : il n'y a pas de passage à préparer."""
    for index, (key, complete) in enumerate(phases):
        if not complete:
            return (phases[index - 1][0], key) if index > 0 else None
    return None
