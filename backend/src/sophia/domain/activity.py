"""Invariants métier des activités (V2 — Exécution). Pur, sans framework."""

from datetime import date, datetime, timedelta


def is_upcoming(done: bool, start_at: datetime | None, today: date) -> bool:
    """Une activité **à venir** : pas faite, et datée d'aujourd'hui ou plus
    tard — ou en attente, sans date. Une activité passée et pas faite n'est
    pas à venir : elle reste au calendrier comme trace de ce qui a été raté.
    """
    if done:
        return False
    return start_at is None or start_at.date() >= today


class ActivityError(Exception):
    """Base des violations d'invariant sur une activité."""


class LinkedStepNotFound(ActivityError):
    """L'étape référencée par l'activité n'existe pas."""


class StepProjectMismatch(ActivityError):
    """L'étape d'un lien n'appartient pas au projet de ce lien."""


class DuplicateProjectLink(ActivityError):
    """Le même projet apparaît deux fois dans les liens d'une activité."""


class LinkedProjectNotFound(ActivityError):
    """Le projet référencé par l'activité n'existe pas."""


class ProjectDomainMismatch(ActivityError):
    """Le projet rattaché appartient à un autre domaine que l'activité."""


class LinkedSkillNotFound(ActivityError):
    """La compétence travaillée par l'activité n'existe pas."""


class SkillDomainMismatch(ActivityError):
    """La compétence travaillée appartient à un autre domaine que l'activité."""


class LinkedPracticeItemNotFound(ActivityError):
    """L'objet de pratique visé par l'activité n'existe pas."""


class DuplicateValueUnit(ActivityError):
    """Deux valeurs dans la même unité sur une activité : laquelle compte ?"""


class ValueUnitNotFound(ActivityError):
    """Une valeur déclarée dans une unité qui n'existe pas."""


class LinkedPlanNotFound(ActivityError):
    """Le cycle d'un acte n'existe pas."""


class PlanSkillMismatch(ActivityError):
    """Le cycle ou l'objet de pratique d'un acte n'est pas celui de son
    savoir."""


class ActKindMismatch(ActivityError):
    """Un acte de pratique vise un objet **ou** une phase (générique, #107) ;
    l'étude et l'interro, ni l'un ni l'autre."""


class GenericWithoutPlan(ActivityError):
    """Une pièce générique (Pratique, Mise en situation) est celle d'un cycle : elle
    en désigne un."""


class RecallWithoutPlan(ActivityError):
    """L'interro est celle d'un cycle : un acte d'interro en désigne un."""


class DuplicateAct(ActivityError):
    """Le même acte (savoir, ce qu'on y fait, objet) deux fois dans une
    activité."""


class FeedbackOnPracticeOnly(ActivityError):
    """Un retour (niveau, note) ne se donne qu'à un acte de pratique (#139) :
    ni l'étude ni l'interro."""


class ActNotFound(ActivityError):
    """L'acte visé n'appartient pas à cette activité."""


class LinkedAchievementNotFound(ActivityError):
    """La réalisation à lier à une séance n'existe pas."""


class AchievementProjectNotLinked(ActivityError):
    """Une séance ne prépare qu'une réalisation d'un projet pour lequel elle
    compte."""


class AchievementNotLinked(ActivityError):
    """La réalisation n'est pas liée à cette séance."""


class PostponeDone(ActivityError):
    """Une activité faite ne se reporte pas."""


class PostponeUndated(ActivityError):
    """Une activité sans date n'a pas de jour d'où se reporter."""


class NotPostponed(ActivityError):
    """Annuler un report demande une activité reportée, non faite."""


class ShiftUndated(ActivityError):
    """Une activité sans date n'a pas de créneau à décaler."""


class MergeOtherDomain(ActivityError):
    """On ne fusionne que deux séances du même domaine (et pas une avec
    elle-même)."""


class MergeSourceCarries(ActivityError):
    """La séance lâchée porte autre chose que des actes et des projets
    (faite, valeurs, relevés, notes, réalisations) : la fusion le perdrait."""


class SystemDomainActivity(ActivityError):
    """Le domaine système ne reçoit pas d'activité à la main, et les siennes
    n'en sortent pas."""


def postponed(start: datetime, end: datetime | None, days: int = 7) -> tuple:
    """Les bornes d'une activité reportée de `days` jours : même jour de la
    semaine, même heure (journée entière : même jour)."""
    shift = timedelta(days=days)
    return start + shift, end + shift if end is not None else None


def shifted(
    start: datetime,
    end: datetime | None,
    all_day: bool,
    days: int,
    minutes: int,
) -> tuple[datetime, datetime | None]:
    """Les bornes d'une activité déplacée avec d'autres (sélection multiple) :
    toutes prennent le même décalage, qui garde leurs écarts. Une journée
    entière n'a pas d'heure : elle ne bouge que par jour."""
    shift = timedelta(days=days, minutes=0 if all_day else minutes)
    return start + shift, end + shift if end is not None else None


def drops_with_its_acts(has_type: bool, acts_left: int) -> bool:
    """Une activité dont on retire, en défaisant un cycle, ses derniers actes
    disparaît-elle avec eux ? Oui si elle ne contenait plus rien et n'est pas
    l'occurrence d'une activité type : elle n'existait que pour ce cycle (une
    séance planifiée depuis lui, l'interro posée par l'app)."""
    return not has_type and acts_left == 0
