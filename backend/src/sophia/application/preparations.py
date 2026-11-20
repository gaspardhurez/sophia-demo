"""Use cases du **rituel de semaine** (#91, #92).

La préparation d'une semaine est une charnière : elle valide la semaine N et
prépare la semaine N+1 (`week_start`, son lundi). Elle ne garde que son
avancement — état, projets revus ; tout geste fait pendant le rituel écrit
des données réelles ailleurs (activités cochées ou reportées, cibles posées,
réalisations et actes liés aux séances), si bien que **relire suffit à
reprendre**.

- **Démarrer** crée la préparation si elle manque. Idempotent. Il ne pose
  rien : le calendrier **se construit au fil de la préparation**.
- **Poser un projet** : ouvrir sa semaine prochaine pose ses activités types
  jusqu'au dimanche (`prepare_until`, jamais dans le passé) — ses séances
  deviennent réelles, on peut y lier ce qu'on prévoit.
- **Valider** pose le reste de la semaine, puis clôt le rituel : son activité
  passe faite et se déplace au jour de la validation ; supprimée entre-temps,
  une autre naît, faite, ce jour-là.
- **Lire un projet** pour le rituel : sa semaine écoulée et celle qui vient,
  sur le périmètre de son étape en cours (#91).
"""

import uuid
from collections.abc import Iterable
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from sophia.application.planning import prepare_until
from sophia.application.ritual import new_ritual_activity, timed_ritual_activity
from sophia.domain.preparation import (
    RitualAlreadyPlanned,
    better,
    check_monday,
    in_week,
    steps_in_week,
    suggest_week_target,
    week_step,
    weeks_left,
)
from sophia.infrastructure.models import (
    AcquisitionPlan,
    Activity,
    ActKind,
    MetricValue,
    PlanState,
    PracticeNature,
    Project,
    ProjectMetric,
    Skill,
    WeekPreparation,
    WeekPreparationProject,
    WeekPreparationState,
)

_WEEK = timedelta(days=7)


def _now() -> datetime:
    return datetime.now(UTC)


def _local_day(moment: datetime | None) -> date | None:
    """Le jour local d'un horodatage enregistré en UTC (coches, clôtures)."""
    if moment is None:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    return moment.astimezone().date()


def _day(activity: Activity) -> date | None:
    return activity.start_at.date() if activity.start_at is not None else None


# --- La préparation -----------------------------------------------------------


def get_preparation(db: Session, week_start: date) -> WeekPreparation | None:
    return db.scalar(
        select(WeekPreparation).where(WeekPreparation.week_start == week_start)
    )


def _fallbacks_only(week_start: date):
    """Les plafonds de `prepare_until` qui ne posent que le repli (clé `None`)."""
    sunday = week_start + timedelta(days=6)
    return lambda activity_type: {None: sunday}


def start_preparation(db: Session, week_start: date) -> WeekPreparation:
    """**Démarrer** la préparation de la semaine qui commence ce lundi : la
    crée si elle manque, et pose jusqu'à son dimanche ce qui ne relève d'aucun
    projet — les replis des domaines (18/10/2026 : l'ouverture de l'app ne
    les pose plus au-delà de la semaine en cours). Les liens de projet, non :
    chaque projet pose ses séances quand on ouvre sa semaine prochaine
    (`pose_project`). La rejouer ne change rien."""
    check_monday(week_start)
    prepare_until(
        db, week_start + timedelta(days=6), ceilings=_fallbacks_only(week_start)
    )
    prep = get_preparation(db, week_start)
    if prep is None:
        prep = WeekPreparation(week_start=week_start)
        db.add(prep)
    if prep.state in (None, WeekPreparationState.todo):
        prep.state = WeekPreparationState.in_progress
        prep.started_at = _now()
    db.commit()
    db.refresh(prep)
    return prep


def plan_ritual(
    db: Session, week_start: date, start_at: datetime, end_at: datetime
) -> WeekPreparation:
    """**Planifier un créneau** pour préparer la semaine qui commence ce lundi,
    quand son rituel n'a pas d'activité (pas encore posé, posé dans le passé,
    ou supprimé). Crée la préparation si elle manque, sans la démarrer. Une
    seule activité par rituel : en avoir déjà une est refusé."""
    check_monday(week_start)
    prep = get_preparation(db, week_start)
    if prep is None:
        prep = WeekPreparation(week_start=week_start, state=WeekPreparationState.todo)
        db.add(prep)
    elif prep.activity is not None:
        raise RitualAlreadyPlanned(str(week_start))
    prep.activity = timed_ritual_activity(db, start_at, end_at)
    db.commit()
    db.refresh(prep)
    return prep


def pose_project(db: Session, week_start: date, project: Project) -> None:
    """**Poser un projet** pour la semaine qui commence ce lundi : ses
    activités types jusqu'au dimanche, par la règle de « Préparer » (jamais
    dans le passé, un jour déjà posé ne l'est pas deux fois). La pose se fait
    par activité type : une activité type partagée pose aussi pour les autres
    projets qui la planifient. Idempotent."""
    check_monday(week_start)
    type_ids = {link.activity_type_id for link in project.activity_types}
    if type_ids:
        prepare_until(db, week_start + timedelta(days=6), type_ids)


def set_reviewed(
    db: Session, prep: WeekPreparation, project: Project, reviewed: bool
) -> WeekPreparation:
    """Marquer (ou démarquer) un projet comme revu. Idempotent."""
    existing = next((r for r in prep.reviewed if r.project_id == project.id), None)
    if reviewed and existing is None:
        prep.reviewed.append(
            WeekPreparationProject(project_id=project.id, reviewed_at=_now())
        )
    elif not reviewed and existing is not None:
        prep.reviewed.remove(existing)
    db.commit()
    db.refresh(prep)
    return prep


def _move_to(activity: Activity, day: date) -> None:
    """Déplace l'activité à ce jour, en gardant son heure (journée entière :
    le jour seul) ; ses relevés suivent, comme pour tout déplacement."""
    if activity.start_at is None:
        midnight = datetime.combine(day, time.min)
        activity.all_day = True
        activity.start_at = activity.end_at = midnight
        return
    shift = day - activity.start_at.date()
    activity.start_at += shift
    if activity.end_at is not None:
        activity.end_at += shift
    for measure in activity.metric_values:
        measure.measured_at = day


def validate_preparation(db: Session, week_start: date) -> WeekPreparation:
    """**Valider la préparation**. Démarrée au besoin ; déjà validée, rien ne
    bouge. Son activité passe faite et se déplace au jour de la validation —
    elle reste celle de sa charnière, une semaine peut donc en porter deux ;
    supprimée, une autre naît, faite, ce jour-là."""
    prep = get_preparation(db, week_start)
    if prep is None or prep.state is WeekPreparationState.todo:
        prep = start_preparation(db, week_start)
    if prep.state is WeekPreparationState.validated:
        return prep
    # Ce qu'aucun projet n'a posé en route (projets non ouverts, replis
    # des domaines, rituel suivant) : la semaine préparée est complète.
    prepare_until(db, week_start + timedelta(days=6))
    db.refresh(prep)
    today = date.today()
    if prep.activity is None:
        prep.activity = new_ritual_activity(db, today, done=True)
    else:
        _move_to(prep.activity, today)
        prep.activity.done = True
    prep.state = WeekPreparationState.validated
    prep.validated_at = _now()
    db.commit()
    db.refresh(prep)
    return prep


# --- Un projet pendant le rituel -------------------------------------------


def _pick(values: Iterable[MetricValue], direction: str) -> MetricValue | None:
    values = list(values)
    if not values:
        return None
    pick = min if direction == "down" else max
    return pick(values, key=lambda v: v.value)


def _season(link: ProjectMetric) -> list[MetricValue]:
    """Les relevés comptés de la saison du projet — la fenêtre du
    Résultat."""
    project = link.project
    return [
        v
        for v in link.metric.counted_values
        if project.start_at <= v.measured_at
        and (project.end_at is None or v.measured_at <= project.end_at)
    ]


def _project_plan(skill: Skill, project: Project) -> AcquisitionPlan | None:
    """Le cycle non abandonné de ce savoir pour ce projet."""
    return next(
        (
            p
            for p in skill.plans
            if p.state is not PlanState.abandoned and project in p.projects
        ),
        None,
    )


def _scope(project: Project, step):
    """Le périmètre des objectifs (#91), **objectif par objectif** : un Total
    confié à l'étape en cours se lit dans sa tranche (cible et séances de
    l'étape), un Total distribué à aucune étape dans celui du projet, un
    Total distribué à d'autres étapes seulement n'en fait pas partie ; un
    Résultat prend le palier de l'étape s'il en a un, sinon la cible du
    projet. Les réalisations sont celles que porte l'étape (toutes sans
    étape en cours). Rend l'étape, les Totaux (Total, cible, activités qu'il
    compte), les Résultats (lien, cible, échéance) et les réalisations."""
    slices = {st.total_id: st for st in step.totals} if step else {}
    paliers = (
        {sm.metric_id: sm for sm in step.metrics if sm.target is not None}
        if step
        else {}
    )
    distributed = {st.total_id for s in project.steps for st in s.totals}
    totals = [
        (t, slices[t.id].target, step.activities)
        if t.id in slices
        else (t, t.target, project.activities)
        for t in project.totals
        if t.id in slices or t.id not in distributed
    ]
    results = [
        (link, paliers[link.metric_id].target, step.due_at or project.due_at)
        if link.metric_id in paliers
        else (link, link.target, project.due_at)
        for link in project.metrics
    ]
    achievements = (
        sorted(step.achievements, key=lambda a: a.created_at)
        if step
        else list(project.achievements)
    )
    return totals, results, achievements


def _spans(project: Project, week_start: date) -> list[dict]:
    """Les étapes datées qui croisent la semaine, avec leurs jours dedans."""
    return [
        {"step_id": s.id, "title": s.title, "first_day": first, "last_day": last}
        for s, first, last in steps_in_week(project.steps, week_start)
    ]


def _past_totals(totals: list, past: date, week_start: date) -> list[dict]:
    rows = []
    for total, target, activities in totals:
        until_end = [
            a for a in activities if a.start_at is None or _day(a) < week_start
        ]
        in_past = [a for a in activities if in_week(_day(a), past)]
        rows.append(
            {
                "total_id": total.id,
                "target": target,
                "progress": total.done_in(until_end),
                "gain": total.done_in(in_past),
            }
        )
    return rows


def _metric_head(link: ProjectMetric, target: float) -> dict:
    metric = link.metric
    return {
        "metric_id": metric.id,
        "name": metric.name,
        "emoji": metric.emoji,
        "unit": metric.unit,
        "direction": metric.direction,
        "target": target,
    }


def _past_results(results: list, past: date, week_start: date) -> list[dict]:
    rows = []
    for link, target, _deadline in results:
        direction = link.metric.direction
        season = _season(link)
        week_best = _pick(
            (v for v in season if in_week(v.measured_at, past)), direction
        )
        before = _pick((v for v in season if v.measured_at < past), direction)
        best = _pick((v for v in season if v.measured_at < week_start), direction)
        delta = (
            week_best.value - before.value
            if week_best is not None
            and before is not None
            and better(week_best.value, before.value, direction)
            else None
        )
        rows.append(
            {
                **_metric_head(link, target),
                "week_best": week_best,
                "best_before": before,
                "best": best,
                "delta": delta,
                "is_met": best is not None
                and not better(target, best.value, direction),
            }
        )
    return rows


def _learning(project: Project, step, past: date) -> list[dict]:
    """Les savoirs du projet, dans l'ordre de la séquence, avec ce que la
    semaine écoulée leur a apporté."""
    skills = {s.id: s for s in project.skills}
    for s in project.steps:
        skills.update({x.id: x for x in s.skills})
    in_step = {x.id for x in step.skills} if step is not None else None
    rows = []
    for entry in project.learning:
        skill = skills[entry["skill_id"]]
        plan = _project_plan(skill, project)
        items = []
        acquired = False
        pieces = _pieces(plan, past)
        if plan is not None:
            acquired = plan.state is PlanState.completed and in_week(
                _local_day(plan.closed_at), past
            )
            for link in plan.items:
                passes = [
                    _day(act.activity)
                    for act in plan.acts
                    if act.practice_item_id == link.item_id
                    and act.activity.done
                    and act.activity.start_at is not None
                ]
                started = in_week(min(passes), past) if passes else False
                # Une séance compte une fois, même si elle vise l'objet deux fois.
                week_sessions = len(
                    {
                        act.activity_id
                        for act in plan.acts
                        if act.practice_item_id == link.item_id
                        and act.activity.done
                        and in_week(_day(act.activity), past)
                    }
                )
                in_progress = bool(passes) and not link.done
                completed = link.done and in_week(_local_day(link.done_at), past)
                if started or in_progress or completed:
                    items.append(
                        {
                            "item_id": link.item_id,
                            "title": link.item.title,
                            "emoji": link.item.emoji,
                            "nature": link.item.nature,
                            "started_this_week": started,
                            "in_progress": in_progress,
                            "completed_this_week": completed,
                            "sessions_this_week": week_sessions,
                            "last_level": _last_level(
                                plan,
                                past,
                                lambda a, i=link.item_id: a.practice_item_id == i,
                            ),
                            "criterion_passes": link.criterion_passes,
                            "criterion_level": link.criterion_level,
                            "criterion_reached": (
                                link.criterion_passes
                                if link.mastered
                                else min(link.criterion_passes, link.passes_at_level)
                            ),
                        }
                    )
        rows.append(
            {
                **entry,
                "in_scope": in_step is None or skill.id in in_step,
                "plan_id": plan.id if plan is not None else None,
                "acquired_this_week": acquired,
                **pieces,
                "items": items,
            }
        )
    return rows


def _last_level(plan: AcquisitionPlan | None, past: date, match) -> int | None:
    """Le niveau du dernier retour de la semaine (#139) parmi les actes faits
    qui répondent à `match` : celui de la séance la plus tardive qui en porte
    un."""
    if plan is None:
        return None
    rated = [
        act
        for act in plan.acts
        if match(act)
        and act.level is not None
        and act.activity.done
        and act.activity.start_at is not None
        and in_week(_day(act.activity), past)
    ]
    if not rated:
        return None
    return max(rated, key=lambda a: (a.activity.start_at, a.created_at)).level


def _pieces(plan: AcquisitionPlan | None, past: date) -> dict:
    """Les pièces du cycle travaillées dans la semaine, hors objets de la rampe
    (eux ont leurs lignes) : l'étude, l'interro, la pratique et l'application
    génériques (#108). Une séance compte une fois par pièce, faite et datée
    dans la semaine."""

    def sessions(match) -> int:
        if plan is None:
            return 0
        return len(
            {
                act.activity_id
                for act in plan.acts
                if match(act)
                and act.activity.done
                and in_week(_day(act.activity), past)
            }
        )

    def generic(nature: PracticeNature):
        return lambda a: (
            a.kind is ActKind.practice
            and a.practice_item_id is None
            and a.nature is nature
        )

    return {
        "study_sessions": sessions(lambda a: a.kind is ActKind.study),
        "recalls_this_week": 0
        if plan is None
        else sum(
            1
            for s in plan.recall_sessions
            if s.finished_at is not None and in_week(_local_day(s.finished_at), past)
        ),
        "practice_sessions": sessions(generic(PracticeNature.isolated)),
        "practice_last_level": _last_level(
            plan, past, generic(PracticeNature.isolated)
        ),
        "application_sessions": sessions(generic(PracticeNature.situation)),
        "application_last_level": _last_level(
            plan, past, generic(PracticeNature.situation)
        ),
    }


def _week_activities(project: Project, week: date) -> list[Activity]:
    return sorted(
        (a for a in project.activities if in_week(_day(a), week)),
        key=lambda a: a.start_at,
    )


def _next_results(results: list, week_start: date) -> list[dict]:
    rows = []
    for link, target, deadline in results:
        current = link.best_in_period
        targets = sorted(
            (
                v
                for v in link.metric.values
                if not v.counts
                and v.activity is not None
                and in_week(_day(v.activity), week_start)
            ),
            key=lambda v: (v.measured_at, v.created_at),
        )
        rows.append(
            {
                **_metric_head(link, target),
                "deadline": deadline,
                "current": current,
                # Sans échéance (projet sans fin, #196) : rien à répartir.
                "suggestion": suggest_week_target(
                    current.value if current is not None else None,
                    target,
                    link.metric.direction,
                    weeks_left(week_start, deadline),
                )
                if deadline is not None
                else None,
                "targets": targets,
            }
        )
    return rows


def project_week(
    db: Session,
    week_start: date,
    project: Project,
    past_step_id: uuid.UUID | None = None,
    next_step_id: uuid.UUID | None = None,
) -> dict:
    """Un projet pendant le rituel de la semaine qui commence ce lundi : la
    semaine écoulée (N) et celle qui vient (N+1), chacune sur le périmètre de
    son étape — celle choisie si elle croise la semaine, sinon celle qui
    couvre son lundi (`week_step`, #183). N'écrit rien."""
    check_monday(week_start)
    past = week_start - _WEEK
    today = date.today()
    step = week_step(project.steps, past, today, past_step_id)
    next_step = week_step(project.steps, week_start, today, next_step_id)
    totals, results, achievements = _scope(project, step)
    _, next_results, next_achievements = _scope(project, next_step)
    past_activities = _week_activities(project, past)
    next_activities = _week_activities(project, week_start)
    skill_ids = set(project.skill_ids)
    return {
        "project_id": project.id,
        "past": {
            "week_start": past,
            "step_id": step.id if step is not None else None,
            "steps": _spans(project, past),
            "totals": _past_totals(totals, past, week_start),
            "results": _past_results(results, past, week_start),
            "achievements": [
                a
                for a in achievements
                if a.done and in_week(_local_day(a.done_at), past)
            ],
            "learning": _learning(project, step, past),
            "done_activities": [a for a in past_activities if a.done],
            "missed_activities": [a for a in past_activities if not a.done],
        },
        "next": {
            "week_start": week_start,
            "step_id": next_step.id if next_step is not None else None,
            "steps": _spans(project, week_start),
            # Les savoirs de l'étape (nul : ceux du projet).
            "skill_ids": (
                [s.id for s in next_step.skills] if next_step is not None else None
            ),
            "results": _next_results(next_results, week_start),
            "achievements": [
                a
                for a in next_achievements
                if any(in_week(_day(x), week_start) for x in a.activities)
            ],
            "acts": [
                {"activity_id": activity.id, "act": act}
                for activity in next_activities
                for act in activity.acts
                if act.skill_id in skill_ids
            ],
            "activities": next_activities,
        },
    }


def get_project(db: Session, project_id: uuid.UUID) -> Project | None:
    return db.get(Project, project_id)
