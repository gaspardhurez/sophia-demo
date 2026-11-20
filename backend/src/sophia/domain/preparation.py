"""Le rituel de semaine (#91, #92) : les règles pures. Sans framework.

- **La charnière** : une préparation se désigne par le lundi de la semaine
  qu'elle prépare (N+1) ; elle valide la semaine d'avant (N). Son activité se
  pose le dimanche de N.
- **L'étape en cours** d'un projet, qui borne le périmètre des objectifs
  affichés pendant le rituel (#91) ; une semaine qui croise plusieurs étapes
  se lit sur celle qu'on choisit (#183).
- **La cible suggérée** d'un Résultat pour la semaine qui vient.
"""

import math
from collections.abc import Iterator, Sequence
from datetime import date, timedelta
from decimal import Decimal
from typing import Any


class PreparationError(Exception):
    """Base des refus du rituel de semaine."""


class WeekStartNotMonday(PreparationError):
    """Une semaine se désigne par son lundi."""


class RitualAlreadyPlanned(PreparationError):
    """La préparation a déjà son activité : une seule par rituel aujourd'hui."""


def monday_of(day: date) -> date:
    """Le lundi de la semaine de `day`."""
    return day - timedelta(days=day.weekday())


def check_monday(day: date) -> None:
    if day.weekday() != 0:
        raise WeekStartNotMonday(str(day))


def sundays(first: date, last: date) -> Iterator[date]:
    """Les dimanches de [first, last] — les jours où se pose le rituel."""
    day = first + timedelta(days=(6 - first.weekday()) % 7)
    while day <= last:
        yield day
        day += timedelta(days=7)


def prepared_week(sunday: date) -> date:
    """La semaine que prépare le rituel posé ce dimanche : celle qui commence
    le lendemain."""
    return sunday + timedelta(days=1)


def in_week(day: date | None, week_start: date) -> bool:
    """Ce jour tombe-t-il dans la semaine qui commence ce lundi ?"""
    return day is not None and week_start <= day < week_start + timedelta(days=7)


def current_step(steps: Sequence[Any], today: date) -> Any | None:
    """L'**étape en cours** d'un projet (ses étapes dans l'ordre) : celle
    dont la période couvre aujourd'hui ; sinon la première pas faite ; sinon
    la dernière ; sans étape, aucune.

    Même règle que l'écran (`entities/project/model/progress.ts`,
    `currentStep`) — les deux doivent bouger ensemble."""
    for step in steps:
        if step.start_at and step.due_at and step.start_at <= today <= step.due_at:
            return step
    for step in steps:
        if not step.done:
            return step
    return steps[-1] if steps else None


def steps_in_week(
    steps: Sequence[Any], week_start: date
) -> list[tuple[Any, date, date]]:
    """Les étapes **datées** dont la période croise la semaine qui commence ce
    lundi, dans l'ordre, chacune avec ses jours dans la semaine (premier,
    dernier). Une étape sans dates n'a pas de jours : elle n'y est pas."""
    last = week_start + timedelta(days=6)
    return [
        (s, max(s.start_at, week_start), min(s.due_at, last))
        for s in steps
        if s.start_at and s.due_at and s.start_at <= last and s.due_at >= week_start
    ]


def week_step(
    steps: Sequence[Any], week_start: date, today: date, chosen: Any = None
) -> Any | None:
    """L'étape qui borne le périmètre d'une semaine du rituel (#183) : celle
    choisie (`chosen`, son id) si elle croise la semaine ; sinon celle qui
    couvre son lundi ; sinon la première qui la croise ; sinon, aucune étape
    datée ne la croisant, l'étape en cours (`current_step`)."""
    spans = steps_in_week(steps, week_start)
    for step, _, _ in spans:
        if chosen is not None and step.id == chosen:
            return step
    for step, first, _ in spans:
        if first == week_start:
            return step
    if spans:
        return spans[0][0]
    return current_step(steps, today)


def better(a: float, b: float, direction: str) -> bool:
    """`a` est-il strictement meilleur que `b`, au sens de la métrique ?"""
    return a < b if direction == "down" else a > b


def weeks_left(week_start: date, deadline: date) -> int:
    """Les semaines qui restent pour tenir l'échéance, celle qui commence
    comprise ; au moins une (une échéance passée se rattrape tout de suite)."""
    if deadline < week_start:
        return 1
    return (deadline - week_start).days // 7 + 1


def _decimals(value: float) -> int:
    """La précision d'une valeur saisie (au plus trois décimales)."""
    exponent = Decimal(str(value)).normalize().as_tuple().exponent
    return min(3, -exponent) if isinstance(exponent, int) and exponent < 0 else 0


def suggest_week_target(
    current: float | None, target: float, direction: str, weeks: int
) -> float | None:
    """La cible suggérée d'un Résultat pour la semaine qui vient.

    **Interpolation linéaire** de la meilleure valeur comptée de la saison
    (`current`) vers la cible (`target`, le palier de l'étape ou celle du
    projet), répartie sur les semaines qui restent jusqu'à l'échéance
    (`weeks`, celle qui vient comprise) : on vise, cette semaine, une part
    égale de l'écart.

    - **Arrondi** au pas de l'avancée hebdomadaire (son ordre de grandeur :
      2,5 → à l'unité ; 30 → à la dizaine), jamais plus fin que la précision des
      valeurs saisies, et **vers la cible** : la suggestion progresse toujours
      d'au moins un pas, sans dépasser la cible.
    - Le **sens** de la métrique décide : un temps se vise en descendant.
    - Une seule semaine restante (ou l'échéance passée) : la cible elle-même.
    - Pas de suggestion sans relevé compté (rien d'où partir), ni quand la
      cible est déjà tenue.
    """
    if current is None:
        return None
    down = direction == "down"
    gap = target - current
    if gap == 0 or (gap > 0) == down:
        return None
    if weeks <= 1:
        return target
    step = gap / weeks
    unit = 10.0 ** math.floor(math.log10(abs(step)))
    unit = max(unit, 10.0 ** -max(_decimals(current), _decimals(target)))
    ratio = round((current + step) / unit, 9)
    if down:
        value = max(math.floor(ratio) * unit, target)
    else:
        value = min(math.ceil(ratio) * unit, target)
    return round(value, 6)
