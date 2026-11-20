"""L'**activité du rituel** de semaine (#92) : ce que « Préparer » pose chaque
dimanche, dans le domaine système.

Chaque dimanche préparé reçoit une activité « Préparer la semaine », en journée
entière, rattachée à la préparation de la semaine qui commence le lendemain
(`WeekPreparation`, créée avec elle). **La ligne de préparation tient lieu de
« posé jusqu'au »** : une semaine qui a sa ligne a eu son rituel posé, il ne se
repose jamais — supprimée ou déplacée, l'activité ne revient pas. Jamais dans
le passé, comme le reste de la préparation.

Les fantômes (`ritual_ghosts`) lisent la même règle sans rien écrire.

Une seule activité par rituel aujourd'hui, sans créneau : le créneau perso et
plusieurs activités par rituel viendront plus tard.
"""

from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from sophia.application.system_domain import system_domain
from sophia.domain.preparation import prepared_week, sundays
from sophia.infrastructure.models import Activity, WeekPreparation

RITUAL_TITLE = "Préparer la semaine"
RITUAL_EMOJI = "🗓️"


def _prepared_weeks(db: Session, weeks: list[date]) -> set[date]:
    """Parmi ces semaines, celles qui ont déjà leur ligne de préparation."""
    if not weeks:
        return set()
    return set(
        db.scalars(
            select(WeekPreparation.week_start).where(
                WeekPreparation.week_start.in_(weeks)
            )
        )
    )


def new_ritual_activity(db: Session, day: date, *, done: bool = False) -> Activity:
    """Une activité du rituel, journée entière, ce jour-là. N'enregistre pas."""
    midnight = datetime.combine(day, time.min)
    activity = Activity(
        domain_id=system_domain(db).id,
        title=RITUAL_TITLE,
        emoji=RITUAL_EMOJI,
        all_day=True,
        start_at=midnight,
        end_at=midnight,
        done=done,
    )
    db.add(activity)
    return activity


def timed_ritual_activity(
    db: Session, start_at: datetime, end_at: datetime
) -> Activity:
    """Une activité du rituel sur un créneau choisi. N'enregistre pas."""
    activity = Activity(
        domain_id=system_domain(db).id,
        title=RITUAL_TITLE,
        emoji=RITUAL_EMOJI,
        all_day=False,
        start_at=start_at,
        end_at=end_at,
        done=False,
    )
    db.add(activity)
    return activity


def pose_rituals(db: Session, today: date, until: date) -> None:
    """Pose le rituel de chaque dimanche de [aujourd'hui, until] qui ne l'a
    pas encore eu. N'enregistre pas : la préparation valide le tout."""
    days = list(sundays(today, until))
    posed = _prepared_weeks(db, [prepared_week(d) for d in days])
    for day in days:
        if prepared_week(day) in posed:
            continue
        db.add(
            WeekPreparation(
                week_start=prepared_week(day), activity=new_ritual_activity(db, day)
            )
        )
    db.flush()


def ritual_ghosts(db: Session, start: date, end: date, today: date) -> list[date]:
    """Les dimanches de [start, end[ où « Préparer » poserait le rituel — à
    partir d'aujourd'hui, sans ligne de préparation. N'écrit rien."""
    days = list(sundays(max(start, today), end - timedelta(days=1)))
    posed = _prepared_weeks(db, [prepared_week(d) for d in days])
    return [d for d in days if prepared_week(d) not in posed]
