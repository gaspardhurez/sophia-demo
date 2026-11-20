"""Invariants des indisponibilités (#105). Pur, sans framework.

Une indisponibilité ne bloque rien : elle se montre au calendrier, sous les
activités. Les seules règles portent sur sa forme — une période qui avance, et
des créneaux bloqués qui restent dedans.
"""

from datetime import datetime, timedelta


class UnavailabilityError(Exception):
    """Base des violations d'invariant sur une indisponibilité."""


class UnavailabilityEndsBeforeStart(UnavailabilityError):
    """La fin d'une indisponibilité ou d'un créneau précède son début."""


class SlotOutsideUnavailability(UnavailabilityError):
    """Un créneau bloqué sort de la période de son indisponibilité."""


def effective_end(all_day: bool, end_at: datetime) -> datetime:
    """La fin réelle d'une période. En journées entières, `end_at` est le
    **dernier jour** à minuit (la convention des activités) : la période court
    jusqu'au lendemain minuit."""
    return end_at + timedelta(days=1) if all_day else end_at


def check_period(all_day: bool, start_at: datetime, end_at: datetime) -> None:
    """Une période avance : fin après début. En journées entières, un seul jour
    (`end_at == start_at`) est permis."""
    if effective_end(all_day, end_at) <= start_at:
        raise UnavailabilityEndsBeforeStart()


def check_slot(
    all_day: bool,
    start_at: datetime,
    end_at: datetime,
    slot_start: datetime,
    slot_end: datetime,
) -> None:
    """Un créneau bloqué avance, et tient dans la période de son
    indisponibilité.

    Changer les dates de l'indisponibilité au point d'exclure un créneau est
    refusé, plutôt que de le déplacer ou de le rogner en silence : ce qui a été
    posé ne se réajuste pas tout seul.
    """
    if slot_end <= slot_start:
        raise UnavailabilityEndsBeforeStart()
    if slot_start < start_at or slot_end > effective_end(all_day, end_at):
        raise SlotOutsideUnavailability()


def overlaps(
    all_day: bool,
    start_at: datetime,
    end_at: datetime,
    window_start: datetime,
    window_end: datetime,
) -> bool:
    """La période touche-t-elle la fenêtre `[window_start, window_end[` ?"""
    return start_at < window_end and effective_end(all_day, end_at) > window_start
