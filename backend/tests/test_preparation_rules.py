"""Les règles pures du rituel de semaine (`domain/preparation.py`)."""

from dataclasses import dataclass
from datetime import date

import pytest

from sophia.domain.preparation import (
    WeekStartNotMonday,
    check_monday,
    current_step,
    in_week,
    monday_of,
    prepared_week,
    suggest_week_target,
    sundays,
    weeks_left,
)


@dataclass
class Step:
    name: str
    start_at: date | None = None
    due_at: date | None = None
    done: bool = False


TODAY = date(2026, 10, 7)  # un mercredi


def test_the_week_is_named_by_its_monday() -> None:
    assert monday_of(TODAY) == date(2026, 10, 5)
    check_monday(date(2026, 10, 5))
    with pytest.raises(WeekStartNotMonday):
        check_monday(TODAY)
    assert in_week(date(2026, 10, 11), date(2026, 10, 5))
    assert not in_week(date(2026, 10, 12), date(2026, 10, 5))
    assert not in_week(None, date(2026, 10, 5))


def test_the_ritual_falls_on_sundays_and_prepares_the_next_week() -> None:
    assert list(sundays(TODAY, date(2026, 10, 25))) == [
        date(2026, 10, 11),
        date(2026, 10, 18),
        date(2026, 10, 25),
    ]
    assert list(sundays(date(2026, 10, 11), date(2026, 10, 11))) == [date(2026, 10, 11)]
    assert prepared_week(date(2026, 10, 11)) == date(2026, 10, 12)


def test_current_step_is_the_dated_one_covering_today() -> None:
    steps = [
        Step("A", date(2026, 9, 1), date(2026, 9, 30), done=False),
        Step("B", date(2026, 10, 1), date(2026, 10, 31)),
    ]
    assert current_step(steps, TODAY).name == "B"


def test_current_step_falls_back_to_the_first_not_done_then_the_last() -> None:
    steps = [Step("A", done=True), Step("B"), Step("C")]
    assert current_step(steps, TODAY).name == "B"
    steps = [Step("A", done=True), Step("B", done=True)]
    assert current_step(steps, TODAY).name == "B"
    assert current_step([], TODAY) is None


def test_weeks_left_counts_the_coming_week() -> None:
    monday = date(2026, 10, 12)
    assert weeks_left(monday, date(2026, 10, 18)) == 1
    assert weeks_left(monday, date(2026, 10, 19)) == 2
    assert weeks_left(monday, date(2026, 12, 6)) == 8
    assert weeks_left(monday, date(2026, 10, 1)) == 1  # échéance passée


def test_suggestion_interpolates_towards_the_target_rounded_up() -> None:
    # 100 → 120 en 8 semaines : 2,5 par semaine, arrondi à l'unité vers la cible.
    assert suggest_week_target(100, 120, "up", 8) == 103
    # Une avancée plus fine que la précision saisie avance d'un pas entier.
    assert suggest_week_target(100, 102, "up", 8) == 101
    # Des décimales saisies : le pas suit.
    assert suggest_week_target(10.5, 12.5, "up", 4) == 11
    assert suggest_week_target(2.25, 2.75, "up", 5) == 2.4


def test_suggestion_respects_the_direction() -> None:
    # Un 10 km de 3000 s à 2700 s en 10 semaines : 30 s par semaine.
    assert suggest_week_target(3000, 2700, "down", 10) == 2970
    assert suggest_week_target(3000, 2990, "down", 10) == 2999


def test_suggestion_never_passes_the_target() -> None:
    assert suggest_week_target(118, 120, "up", 2) == 119
    assert suggest_week_target(119.5, 120, "up", 2) == 119.8
    assert suggest_week_target(119, 120, "up", 2) == 120


def test_last_week_suggests_the_target_itself() -> None:
    assert suggest_week_target(100, 120, "up", 1) == 120


def test_no_suggestion_without_a_measure_or_once_met() -> None:
    assert suggest_week_target(None, 120, "up", 4) is None
    assert suggest_week_target(125, 120, "up", 4) is None
    assert suggest_week_target(120, 120, "up", 4) is None
    assert suggest_week_target(2600, 2700, "down", 4) is None
