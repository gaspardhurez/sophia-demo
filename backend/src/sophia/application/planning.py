"""La planification : ce que les activités types posent au calendrier (#37).

Remplace la génération paresseuse des habitudes. Plus rien ne s'écrit à la
lecture du calendrier : on **prépare** jusqu'à une date, explicitement (rituel,
bouton « Préparer … », première ouverture de la semaine), et chaque lien retient
jusqu'où il a posé (`posed_until`). Un jour derrière cette date n'est jamais
reposé : une occurrence supprimée ne revient pas.

Une seule fonction décide ce qu'un jour doit recevoir (`_plan_day`) : la
préparation l'écrit en base, l'aperçu (les fantômes au-delà de ce qui est posé)
le lit sans rien écrire. Les deux ne peuvent donc pas diverger.

Une occurrence reçoit ses projets et son étape **à sa création**, puis plus
rien ne la réajuste.
"""

import threading
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from sophia.application.ritual import (
    RITUAL_EMOJI,
    RITUAL_TITLE,
    pose_rituals,
    ritual_ghosts,
)
from sophia.application.system_domain import SYSTEM_DOMAIN_ID
from sophia.domain.planning import (
    fallback_rule,
    falls_on,
    hands_over,
    is_daily_case,
    is_open,
    link_poses,
)
from sophia.domain.preparation import prepared_week
from sophia.infrastructure.models import (
    Activity,
    ActivityProject,
    ActivityType,
    Planning,
    Project,
    ProjectActivityType,
)


def week_end(day: date) -> date:
    """Le dimanche de la semaine de `day`."""
    return day + timedelta(days=6 - day.weekday())


# --- Ce qu'un jour doit recevoir ----------------------------------------------


@dataclass
class Planned:
    """Une occurrence que la planification poserait ce jour-là.

    `links` : (projet, étape) pour chaque projet qui la reçoit ; vide pour
    une occurrence du repli. Sans créneau, c'est la **case du jour** — une seule
    par activité type, liée à tous les projets qui la planifient.
    """

    activity_type: ActivityType
    day: date
    start: time | None = None
    minutes: int | None = None
    links: list[tuple[uuid.UUID, uuid.UUID | None]] = field(default_factory=list)

    @property
    def all_day(self) -> bool:
        return self.start is None

    def bounds(self) -> tuple[datetime, datetime]:
        if self.start is None:
            midnight = datetime.combine(self.day, time.min)
            return midnight, midnight
        begin = datetime.combine(self.day, self.start)
        return begin, begin + timedelta(minutes=self.minutes or 0)


def _plan_day(
    activity_type: ActivityType,
    day: date,
    *,
    only_after: dict,
    up_to: dict | None = None,
) -> list[Planned]:
    """Ce que cette activité type pose ce jour-là.

    `only_after` donne, pour chaque lien (et pour le repli, clé `None`), la
    date au-delà de laquelle il pose : un jour déjà derrière n'est pas reposé.
    `up_to`, s'il est donné, le dernier jour que chacun pose : un lien ne va
    pas plus loin que son plafond.
    """

    def beyond(key) -> bool:
        return up_to is not None and day > up_to.get(key, date.min)

    planned: list[Planned] = []
    case: Planned | None = None
    for link in activity_type.links:
        after = only_after.get(link.project_id)
        if (after is not None and day <= after) or beyond(link.project_id):
            continue
        step_id = link_poses(link, day)
        if step_id is False:
            continue
        if link.has_slot:
            planned.append(
                Planned(
                    activity_type,
                    day,
                    link.slot_start,
                    link.slot_minutes,
                    [(link.project_id, step_id)],
                )
            )
            continue
        if case is None:
            case = Planned(activity_type, day)
            planned.append(case)
        case.links.append((link.project_id, step_id))

    after = only_after.get(None)
    if (after is not None and day <= after) or beyond(None):
        return planned
    carried = any(is_open(link.project, day) for link in activity_type.links)
    rule = None if carried else fallback_rule(activity_type, day)
    if rule is not None and falls_on(*rule, day) and case is None:
        planned.append(Planned(activity_type, day))
    return planned


# --- Lire ce qui est posé -----------------------------------------------------


def _load_types(db: Session, type_ids: set[uuid.UUID] | None = None) -> list:
    stmt = select(ActivityType).options(
        selectinload(ActivityType.links)
        .selectinload(ProjectActivityType.project)
        .selectinload(Project.steps),
        selectinload(ActivityType.links).selectinload(ProjectActivityType.steps_off),
    )
    if type_ids is not None:
        stmt = stmt.where(ActivityType.id.in_(type_ids))
    return list(db.scalars(stmt))


def _floors(activity_type: ActivityType, today: date) -> dict:
    """Pour chaque lien, et pour le repli (clé `None`), le dernier jour déjà
    derrière lui : ce qu'il a posé, ou hier — le passé ne se pose pas."""
    yesterday = today - timedelta(days=1)
    posed = {link.project_id: link.posed_until for link in activity_type.links}
    posed[None] = activity_type.fallback_posed_until
    return {key: max(d, yesterday) if d else yesterday for key, d in posed.items()}


def level(db: Session) -> date | None:
    """Jusqu'où le calendrier est posé : la date la plus lointaine qu'un lien
    ou un repli ait atteinte. `None` si rien n'a jamais été préparé."""
    dates = [
        d for d in db.scalars(select(ProjectActivityType.posed_until)) if d is not None
    ]
    dates += [
        d
        for d in db.scalars(select(ActivityType.fallback_posed_until))
        if d is not None
    ]
    return max(dates, default=None)


# --- Poser --------------------------------------------------------------------


posing = threading.Lock()
"""Une pose à la fois (9/11/2026). « Rien n'est posé deux fois » repose sur
`posed_until`, lu au début de la pose : deux poses en parallèle le lisent
toutes deux avant que l'une l'avance, et posent chacune la semaine — à
l'ouverture de l'app, quatre `POST /planning/prepare` simultanés l'avaient
quadruplée. Les endpoints qui posent en lot le prennent **avant leur première
lecture** : la suivante voit ce que la précédente a commité."""


def _existing_case(db: Session, activity_type_id: uuid.UUID, day: date):
    """La case du jour déjà posée pour cette activité type, s'il y en a une."""
    midnight = datetime.combine(day, time.min)
    return db.scalar(
        select(Activity).where(
            Activity.activity_type_id == activity_type_id,
            Activity.all_day.is_(True),
            Activity.start_at == midnight,
        )
    )


def _write(db: Session, planned: Planned) -> None:
    activity_type = planned.activity_type
    if planned.all_day:
        existing = _existing_case(db, activity_type.id, planned.day)
        if existing is not None:
            # Une seule case par jour : un projet de plus s'y rattache.
            have = {link.project_id for link in existing.project_links}
            for project_id, step_id in planned.links:
                if project_id not in have:
                    existing.project_links.append(
                        ActivityProject(project_id=project_id, step_id=step_id)
                    )
            return
    start, end = planned.bounds()
    db.add(
        Activity(
            domain_id=activity_type.domain_id,
            activity_type_id=activity_type.id,
            title=activity_type.title,
            emoji=activity_type.emoji,
            all_day=planned.all_day,
            start_at=start,
            end_at=end,
            done=False,
            project_links=[
                ActivityProject(project_id=project_id, step_id=step_id)
                for project_id, step_id in planned.links
            ],
        )
    )


def _fallback_in_play(activity_type: ActivityType) -> bool:
    return activity_type.fallback_active or any(
        link.preserve_after for link in activity_type.links
    )


def _hand_over(activity_type: ActivityType, today: date) -> None:
    """« Préserver après le projet » (10/11/2026) : le projet clos, le
    domaine reprend la planification du lien — le repli s'allume avec ses
    jours, et repart d'où en sont le lien et la continuation qu'il a déjà
    posée. Un repli déjà allumé garde les siens. Le lien a passé la main : sa
    préservation retombe, et le repli se règle désormais sur la page du
    domaine."""
    for link in activity_type.links:
        if not hands_over(link, today):
            continue
        if not activity_type.fallback_active:
            activity_type.fallback_active = True
            activity_type.fallback_planning = link.planning
            activity_type.fallback_weekdays = list(link.weekdays)
            posed = [
                d
                for d in (activity_type.fallback_posed_until, link.posed_until)
                if d is not None
            ]
            activity_type.fallback_posed_until = max(posed, default=None)
        link.preserve_after = False


def hand_over(db: Session, type_ids: set[uuid.UUID]) -> None:
    """Passe au domaine les liens préservés de ces activités types dont
    le projet vient de se clore — à l'abandon, sans attendre la préparation."""
    today = date.today()
    for activity_type in _load_types(db, type_ids):
        _hand_over(activity_type, today)
    db.commit()


def _ceiling(up_to: dict | None, until: date, key) -> date:
    return until if up_to is None else up_to.get(key, date.min)


def prepare_until(
    db: Session,
    until: date,
    type_ids: set[uuid.UUID] | None = None,
    ceilings: Callable[[ActivityType], dict] | None = None,
) -> None:
    """Pose tout ce qui doit l'être jusqu'à `until` inclus, puis avance les
    dates « posé jusqu'au ». Jamais dans le passé : on part d'aujourd'hui.

    `ceilings`, s'il est donné, fixe pour chaque activité type le plafond de
    chaque lien (et du repli, clé `None`), au plus `until` : le rattrapage
    met un lien au niveau de **son** projet, pas de tout le calendrier.

    Idempotent : ce qui est derrière la date d'un lien n'est pas reposé.
    """
    today = date.today()
    for activity_type in _load_types(db, type_ids):
        # Une clôture sans geste (échéance, réussite constatée) passe la main
        # ici, avant de lire où en est le repli.
        _hand_over(activity_type, today)
        floor = _floors(activity_type, today)
        up_to = (
            {k: min(d, until) for k, d in ceilings(activity_type).items()}
            if ceilings is not None
            else None
        )

        day = min(floor.values()) + timedelta(days=1)
        while day <= until:
            for planned in _plan_day(activity_type, day, only_after=floor, up_to=up_to):
                _write(db, planned)
            db.flush()
            day += timedelta(days=1)
        for link in activity_type.links:
            top = _ceiling(up_to, until, link.project_id)
            if link.planning is not Planning.manual and (
                link.posed_until is None or link.posed_until < top
            ):
                link.posed_until = top
        top = _ceiling(up_to, until, None)
        if _fallback_in_play(activity_type) and (
            activity_type.fallback_posed_until is None
            or activity_type.fallback_posed_until < top
        ):
            activity_type.fallback_posed_until = top
    # Le rituel de semaine, chaque dimanche (#92) : sa ligne de préparation
    # tient lieu de « posé jusqu'au ».
    pose_rituals(db, today, until)
    db.commit()


def prepare_current_week(db: Session) -> date:
    """La semaine en cours : ce que fait l'ouverture de l'app. Jusqu'à son
    dimanche seulement — jamais jusqu'au niveau : la semaine suivante se pose
    projet par projet, dans la préparation (18/10/2026 : une préparation
    d'un projet tirait sinon tout le calendrier au rechargement)."""
    until = week_end(date.today())
    prepare_until(db, until)
    return until


def project_levels(db: Session) -> dict:
    """Jusqu'où chaque projet est posé : la plus lointaine des dates « posé
    jusqu'au » de ses liens."""
    levels: dict = {}
    for project_id, posed in db.execute(
        select(ProjectActivityType.project_id, ProjectActivityType.posed_until)
    ):
        if posed is not None:
            levels[project_id] = max(posed, levels.get(project_id, posed))
    return levels


def catch_up(
    db: Session, activity_type_id: uuid.UUID, levels: dict | None = None
) -> None:
    """Met une activité type au niveau — un lien neuf, un repli qu'on
    rallume, une planification repartie de zéro. Chaque lien va jusqu'au
    niveau de **son projet** (ce que sa préparation a posé), au moins la
    semaine en cours ; le repli, jusqu'à la semaine en cours. Jamais au niveau
    de tout le calendrier : préparer un projet ne pose pas les autres
    (18/10/2026).

    Les niveaux se lisent **avant** de toucher au lien (`project_levels`) :
    retirer ou remettre à zéro le seul lien posé abaisserait sinon le niveau
    qu'il doit rattraper.
    """
    levels = levels if levels is not None else project_levels(db)
    floor = week_end(date.today())

    def ceilings(activity_type: ActivityType) -> dict:
        tops: dict = {
            link.project_id: max(floor, levels.get(link.project_id, floor))
            for link in activity_type.links
        }
        tops[None] = max(floor, activity_type.fallback_posed_until or floor)
        return tops

    until = max([floor, *levels.values()])
    prepare_until(db, until, {activity_type_id}, ceilings)


# --- Voir au-delà : les fantômes ----------------------------------------------


@dataclass
class GhostLink:
    project_id: uuid.UUID
    step_id: uuid.UUID | None


@dataclass
class Ghost:
    # Nul pour le rituel de semaine, qui n'a pas d'activité type.
    activity_type_id: uuid.UUID | None
    domain_id: uuid.UUID
    title: str
    emoji: str | None
    all_day: bool
    start_at: datetime
    end_at: datetime
    # Les projets qu'elle recevrait, chacun avec son étape : même forme que
    # les liens d'une activité, pour que le prévisionnel les lise pareil.
    projects: list[GhostLink]
    # Case du jour quotidienne : sa rangée « quotidien » (cf. `is_daily_case`).
    daily: bool
    # Le rituel de semaine (#92) : le lundi de la semaine qu'il préparerait.
    ritual_week_start: date | None = None


def preview(db: Session, start: date, end: date) -> list[Ghost]:
    """Ce que la planification poserait sur [start, end[ au-delà de ce qui est
    déjà posé — sans rien écrire. Les fantômes du calendrier."""
    today = date.today()
    ghosts: list[Ghost] = []
    for activity_type in _load_types(db):
        floor = _floors(activity_type, today)
        day = max(start, today)
        while day < end:
            for planned in _plan_day(activity_type, day, only_after=floor):
                begin, finish = planned.bounds()
                ghosts.append(
                    Ghost(
                        activity_type_id=activity_type.id,
                        domain_id=activity_type.domain_id,
                        title=activity_type.title,
                        emoji=activity_type.emoji,
                        all_day=planned.all_day,
                        start_at=begin,
                        end_at=finish,
                        projects=[
                            GhostLink(oid, step_id) for oid, step_id in planned.links
                        ],
                        daily=planned.all_day
                        and is_daily_case(
                            activity_type,
                            {oid for oid, _ in planned.links},
                            day,
                        ),
                    )
                )
            day += timedelta(days=1)
    for sunday in ritual_ghosts(db, start, end, today):
        midnight = datetime.combine(sunday, time.min)
        ghosts.append(
            Ghost(
                activity_type_id=None,
                domain_id=SYSTEM_DOMAIN_ID,
                title=RITUAL_TITLE,
                emoji=RITUAL_EMOJI,
                all_day=True,
                start_at=midnight,
                end_at=midnight,
                projects=[],
                daily=False,
                ritual_week_start=prepared_week(sunday),
            )
        )
    return ghosts
