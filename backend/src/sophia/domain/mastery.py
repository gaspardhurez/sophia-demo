"""La maîtrise d'un cycle, phase par phase (#157, chantier maitrise-par-phase).
Pur, sans framework.

Un cycle est satisfait quand toutes ses phases activées sont **maîtrisées**,
chacune selon un critère explicite :

- **l'étude**, quand son interro a atteint le **seuil** du cycle (un nombre de
  tests de la courbe : 3, J+15, par défaut) — ou, sans questions, quand elle a
  été validée à la main ;
- **une pièce** de Pratique ou de Mise en situation, quand elle a rempli **son
  critère** (tant de passes faites, au total dans le cycle, au niveau ou plus :
  3 passes à 5/5 par défaut), ou qu'elle a été déclarée réussie à la main.

Tout est calculé : changer le seuil ou le critère a un effet immédiat.
"""

from collections.abc import Hashable, Iterable
from datetime import date

#: Le seuil de l'étude par défaut : trois tests de l'interro (J+1, J+7, J+15).
DEFAULT_RECALL_TARGET = 3

#: Le critère d'une pièce par défaut : 3 passes à 5/5.
DEFAULT_CRITERION_PASSES = 3
DEFAULT_CRITERION_LEVEL = 5

#: « Lancer le test » sur une séance : elle porte le premier test, de J+1 à
#: J+3 inclus.
LAUNCH_WINDOW_DAYS = (1, 3)


def study_mastered(
    validated: bool, recall_stage: int | None, recall_target: int
) -> bool:
    """L'étude est maîtrisée : validée à la main (sans questions), ou son
    interro a passé `recall_target` tests. Une courbe terminée a passé tous
    les seuils."""
    if validated:
        return True
    return recall_stage is not None and recall_stage >= recall_target


def passes_at_level(passes: Iterable[tuple[Hashable, int | None]], level: int) -> int:
    """Les passes au niveau `level` ou plus, comptées une fois par séance :
    `passes` donne, pour chaque acte fait sur la pièce, la séance qui le porte
    et son niveau (nul sans retour)."""
    return len({key for key, lvl in passes if lvl is not None and lvl >= level})


def piece_mastered(done: bool, at_level: int, criterion_passes: int) -> bool:
    """Une pièce est maîtrisée : déclarée réussie à la main, ou son critère
    est rempli (au total dans le cycle, pas forcément d'affilée)."""
    return done or at_level >= criterion_passes


def can_carry_first_recall(day: date, today: date) -> bool:
    """Une séance de ce jour peut-elle porter le premier test de l'interro ?
    De J+1 à J+3 inclus."""
    low, high = LAUNCH_WINDOW_DAYS
    return low <= (day - today).days <= high
