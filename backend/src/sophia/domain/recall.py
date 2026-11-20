"""La courbe de l'interro d'un cycle (chantier module-etude §2, §6 ; #78, #81).
Pur, sans framework.

L'interro porte sur toutes les questions complètes du savoir. Sa courbe
vit sur le cycle : un **rang** (l'intervalle à venir dans J+1, J+7, J+15, J+30,
J+90) et la **date** du prochain rappel. « Lancer le test » la démarre, par
un geste explicite (#157) ; son cran dit si l'étude est maîtrisée
(`domain/mastery.py`). Le seul geste manuel ensuite est **Recommencer**
(retour à J+1). Une interro n'a **qu'une courbe**, pendant le cycle comme en
rétention : J+90 réussi la **termine** (`FINISHED`), et il ne se passe plus
rien (décidé par l'utilisateur, 07/10/2026 ; plus de pause ni de « Rouvrir
l'étude »).

**La passation** (#80 ; refondue le 07/10/2026, chantier
interro-reapprentissage) mesure et fait apprendre. Une question ratée est
corrigée sur-le-champ, puis **retourne en fin de file** et se repose en
entier, après un **délai** (`RETRY_DELAY`) — que l'ouverture des notes du
savoir relance pour toutes les questions qui restent. Une question en liste
est sue quand tous ses éléments le sont (`list_known`). Il n'y a plus de
verdict : la passation se termine quand chaque question a été sue une fois,
et la courbe avance alors d'un rang (`next_stage`), l'intervalle compté
depuis ce jour-là — le jour réel ; après J+90, la courbe est terminée.
"""

from datetime import date, timedelta
from enum import StrEnum

#: Les intervalles de la courbe, en jours.
INTERVALS = (1, 7, 15, 30, 90)

#: Le rang d'une courbe terminée : J+90 a été réussi, plus d'interro.
FINISHED = len(INTERVALS)


#: Le délai avant de repasser une question ratée, ou après avoir rouvert les
#: notes : on ne doit pas restituer ce qu'on vient de relire. Pas un optimum
#: mesuré (cf. chantier : rien n'a été testé au-delà de six minutes).
RETRY_DELAY = timedelta(minutes=10)


class RecallVerdict(StrEnum):
    """Le verdict d'une passation, lu du score — **plus écrit** depuis le
    07/10/2026 : seules les passations d'avant le portent, dans
    l'historique."""

    passed = "passed"
    partial = "partial"
    failed = "failed"


def interval(stage: int) -> int:
    """L'intervalle du rang donné, en jours."""
    return INTERVALS[min(max(stage, 0), len(INTERVALS) - 1)]


def due_after(today: date, stage: int) -> date:
    """La date du prochain rappel, comptée depuis aujourd'hui."""
    return today + timedelta(days=interval(stage))


def is_due(next_due_on: date | None, today: date) -> bool:
    """L'interro est-elle due : sa date de rappel est aujourd'hui ou passée
    (en retard) ? Sans date — courbe pas lancée, terminée ou arrêtée —, non.
    Même règle que le front (`recallDue`, `entities/plan/model/progress.ts`).
    Depuis #138, une **nouvelle** passation ne s'ouvre qu'à ce moment-là."""
    return next_due_on is not None and next_due_on <= today


def list_known(point_ids: list[str], known_ids: list[str]) -> bool:
    """Une question en liste est sue quand chacun de ses éléments a été
    donné. Un id coché qui n'est pas un élément ne compte pas."""
    return set(point_ids) <= set(known_ids)


def next_stage(stage: int) -> int:
    """Le rang qui suit une interro terminée : un cran de plus. Après J+90,
    `FINISHED` : la courbe est terminée."""
    return min(stage + 1, FINISHED)


def is_finished(stage: int | None) -> bool:
    """La courbe est-elle terminée (J+90 réussi) ?"""
    return stage is not None and stage >= FINISHED
