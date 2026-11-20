"""La vue d'ensemble de l'apprentissage (#152) : ce qui est à faire, tous
savoirs confondus : les séances du jour et des 7 suivants, puis quatre cartes
(#155).

Lecture seule. Les règles et leurs seuils sont dans `domain/learning.py` ; ici
on lit le calendrier, les cycles et les projets, et on range. Rien n'est
stocké : la vue se recalcule à chaque lecture, comme l'historique d'un savoir.
"""

from collections import defaultdict
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from sophia.application.schemas.learning import OverviewGroup, OverviewKind
from sophia.domain import learning as rules
from sophia.domain.recall import is_due
from sophia.infrastructure.models import (
    AcquisitionPlan,
    Activity,
    ActivityAct,
    ActKind,
    PlanState,
    PracticeNature,
    Project,
    ProjectStatus,
    Skill,
    SkillStatus,
)

# Les phases d'un cycle dans l'ordre, et ce qui les active.
_PHASES = (
    ("study", "study"),
    (PracticeNature.isolated.value, "isolated"),
    (PracticeNature.situation.value, "situation"),
)


def _day(at: datetime | None) -> date | None:
    return at.date() if at is not None else None


def _act_phase(act: ActivityAct) -> str | None:
    """La phase qu'un acte sert : l'étude, ou la nature de sa pratique."""
    if act.kind is ActKind.study:
        return "study"
    if act.kind is ActKind.practice and act.phase is not None:
        return act.phase.value
    return None


def _learning(activity: Activity) -> bool:
    """Une séance d'apprentissage hors interro : l'interro due a sa propre
    ligne, la séance qui ne porte qu'elle ne se compte pas deux fois."""
    return any(act.kind is not ActKind.recall for act in activity.acts)


def _phases(plan: AcquisitionPlan) -> list[tuple[str, bool]]:
    """Les phases actives du cycle, chacune avec « complète » : maîtrisée
    (#157)."""
    phases: list[tuple[str, bool]] = []
    for key, flag in _PHASES:
        if not getattr(plan, flag):
            continue
        if key == "study":
            phases.append((key, plan.study_mastered))
            continue
        links = [x for x in plan.items if x.item.nature.value == key]
        phases.append((key, bool(links) and all(x.mastered for x in links)))
    return phases


def overview(db: Session, today: date | None = None) -> dict:
    today = today or date.today()
    skills = list(
        db.scalars(
            select(Skill).options(
                selectinload(Skill.plans).selectinload(AcquisitionPlan.items),
                selectinload(Skill.plans).selectinload(AcquisitionPlan.acts),
            )
        )
    )
    by_id = {s.id: s for s in skills}
    activities = list(
        db.scalars(
            select(Activity)
            .where(Activity.acts.any(), Activity.start_at.is_not(None))
            .options(
                selectinload(Activity.acts),
                selectinload(Activity.domain),
                selectinload(Activity.achievements),
                selectinload(Activity.week_preparation),
            )
            .order_by(Activity.start_at)
        )
    )

    # Le calendrier d'un savoir : ses séances faites, et celles à venir.
    done_on: dict = defaultdict(list)
    upcoming: dict = defaultdict(list)
    for a in activities:
        day = _day(a.start_at)
        for skill_id in {act.skill_id for act in a.acts}:
            if a.done:
                done_on[skill_id].append(a.start_at)
            elif day >= today:
                upcoming[skill_id].append(a.start_at)

    groups: dict[OverviewGroup, list[dict]] = {g: [] for g in OverviewGroup}
    today_rows: list[dict] = []
    upcoming_rows: list[dict] = []

    def line(kind: OverviewKind, skill: Skill, **fields) -> dict:
        return {"kind": kind, "skill_id": skill.id, "skill_name": skill.name, **fields}

    def add(group: OverviewGroup, kind: OverviewKind, skill: Skill, **fields):
        groups[group].append(line(kind, skill, **fields))

    # --- Rattraper : les interros **en retard** (jour dû passé). Celle du jour
    # est sa séance posée au calendrier : elle est dans « Aujourd'hui » (#155).
    recall_due: set = set()
    for skill in skills:
        for plan in skill.plans:
            if is_due(plan.recall_next_due_at, today):
                recall_due.add(skill.id)
            if plan.recall_next_due_at and plan.recall_next_due_at < today:
                add(
                    OverviewGroup.catch_up,
                    OverviewKind.recall,
                    skill,
                    plan_id=plan.id,
                    emoji="🧠",
                    since=plan.recall_next_due_at,
                )

    # --- Les séances : passées non faites (Rattraper), du jour, des 7 jours
    # suivants. Le premier savoir qu'elles travaillent les range — une pièce
    # avant l'interro.
    week_end = today + timedelta(days=7)
    for a in activities:
        day = _day(a.start_at)
        acts = sorted(a.acts, key=lambda act: act.kind is ActKind.recall)
        skill = by_id[acts[0].skill_id]
        if day < today:
            # L'interro passée a sa propre ligne : la séance qui ne porte
            # qu'elle ne se compte pas deux fois.
            if not a.done and _learning(a):
                add(
                    OverviewGroup.catch_up,
                    OverviewKind.missed,
                    skill,
                    activity=a,
                    title=a.title,
                )
        elif day == today:
            today_rows.append(
                line(OverviewKind.session, skill, activity=a, title=a.title)
            )
        elif day <= week_end:
            upcoming_rows.append(
                line(OverviewKind.session, skill, activity=a, title=a.title)
            )

    # Rattraper : le plus ancien d'abord.
    groups[OverviewGroup.catch_up].sort(
        key=lambda i: i.get("since") or _day(i["activity"].start_at)
    )

    # --- Les savoirs en cours : avancer, planifier.
    in_progress = sorted(
        (s for s in skills if s.status is SkillStatus.in_progress),
        key=lambda s: s.name.casefold(),
    )
    for skill in in_progress:
        last = max(done_on[skill.id], default=None)
        plan = skill.active_plan
        satisfied = plan is not None and plan.is_satisfied
        if plan is not None:
            passage = rules.phase_to_plan(_phases(plan))
            if passage is not None:
                previous, current = passage
                posed = any(
                    _act_phase(act) == current
                    and not act.activity.done
                    and _day(act.activity.start_at) is not None
                    and _day(act.activity.start_at) >= today
                    for act in plan.acts
                )
                if not posed:
                    add(
                        OverviewGroup.advance,
                        OverviewKind.next_phase,
                        skill,
                        plan_id=plan.id,
                        phase=current,
                        previous_phase=previous,
                    )
            # L'interro pas lancée (#157) : on a étudié (une séance d'étude
            # faite), il y a des questions, et rien ne la lance seul.
            if (
                plan.study
                and plan.study_sessions > 0
                and plan.question_count > 0
                and plan.recall_stage is None
                and plan.study_validated_at is None
            ):
                add(
                    OverviewGroup.advance,
                    OverviewKind.start_recall,
                    skill,
                    plan_id=plan.id,
                    emoji="🧠",
                )
            if satisfied:
                add(OverviewGroup.advance, OverviewKind.close, skill, plan_id=plan.id)

        current = _current_phase(plan)
        if not satisfied and rules.unplanned(
            [_day(at) for at in upcoming[skill.id]], today
        ):
            add(
                OverviewGroup.plan,
                OverviewKind.unplanned,
                skill,
                plan_id=plan.id if plan else None,
                phase=current,
                since=_day(last),
            )

    # --- Commencer : pour chaque projet en cours, le **prochain** savoir de
    # sa séquence (hors séquence ensuite, par nom) — pas encore commencé, pas
    # acquis. Un seul par projet : chaque savoir d'un projet a un cycle
    # prévu d'office, les lister tous ferait un mur.
    seen: set = set()
    projects = db.scalars(select(Project).order_by(Project.start_at))
    for project in projects:
        if project.effective_status is not ProjectStatus.in_progress:
            continue
        for row in project.learning:
            skill = by_id.get(row["skill_id"])
            if (
                skill is None
                or skill.id in seen
                or row["level"] >= 4
                or skill.active_plan is not None
            ):
                continue
            drafts = [p for p in skill.plans if p.state is PlanState.draft]
            # Le cycle prévu pour ce projet, sinon un autre cycle prévu.
            planned = next(
                (p for p in drafts if project in p.projects),
                drafts[-1] if drafts else None,
            )
            if planned is None and skill.has_cycle:
                continue
            seen.add(skill.id)
            add(
                OverviewGroup.start,
                OverviewKind.start,
                skill,
                plan_id=planned.id if planned else None,
                project_id=project.id,
                project_name=project.title,
            )
            break

    return {
        "today": today_rows,
        "upcoming": upcoming_rows,
        "groups": [{"group": g, "items": items} for g, items in groups.items()],
        "skills": [
            {
                "skill_id": s.id,
                "next_at": min(upcoming[s.id], default=None),
                "last_done_at": max(done_on[s.id], default=None),
                "recall_due": s.id in recall_due,
            }
            for s in in_progress
        ],
    }


def _current_phase(plan: AcquisitionPlan | None) -> str | None:
    """La phase en cours du cycle : la première active pas complète."""
    if plan is None:
        return None
    return next((key for key, complete in _phases(plan) if not complete), None)
