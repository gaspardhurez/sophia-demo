"""Use cases des actes d'apprentissage (#82, chantier apprentissage-calendrier).

Une activité contient zéro, un ou plusieurs actes : un lien vers un savoir (et
son cycle quand il y en a un) avec ce qu'on y fait — l'étude, l'interro, un
objet de pratique, ou une phase de pratique sans objet (la pièce générique
« Pratique » / « Application », #107). Un acte s'ajoute ou se retire, c'est
tout.

- **Ajouter** un acte d'un cycle — en cours ou prévu — donne à l'activité les
  projets de ce cycle (ouverts ce jour-là). **Retirer** un acte ne retire
  rien d'autre : les projets restent, rien ne se retire seul.
- **L'interro posée par l'app** : une activité à elle seule, journée entière,
  au jour du prochain rappel du cycle ; une seule non faite à la fois.
"""

import uuid
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from sophia.application import skills as skill_use_cases
from sophia.application.schemas.activity import ActivityActFeedbackSet, ActivityActSet
from sophia.domain.activity import (
    ActKindMismatch,
    ActNotFound,
    DuplicateAct,
    DuplicateProjectLink,
    FeedbackOnPracticeOnly,
    GenericWithoutPlan,
    LinkedPlanNotFound,
    LinkedPracticeItemNotFound,
    LinkedProjectNotFound,
    LinkedSkillNotFound,
    LinkedStepNotFound,
    PlanSkillMismatch,
    ProjectDomainMismatch,
    RecallWithoutPlan,
    SkillDomainMismatch,
    StepProjectMismatch,
    drops_with_its_acts,
    is_upcoming,
)
from sophia.domain.planning import is_open
from sophia.infrastructure.models import (
    AcquisitionPlan,
    Activity,
    ActivityAct,
    ActivityProject,
    ActKind,
    PracticeItem,
    Project,
    ProjectStep,
    Skill,
)

# --- Valider -----------------------------------------------------------------


def act_key(act: ActivityAct) -> tuple:
    """Ce qui fait qu'un acte est le même : le savoir, ce qu'on y fait, l'objet
    ou la phase générique."""
    return (act.skill_id, act.kind, act.practice_item_id, act.nature)


def resolve_act(db: Session, domain_id: uuid.UUID, act: ActivityActSet) -> ActivityAct:
    """Un acte validé : un savoir du domaine de l'activité ; un cycle et un
    objet qui sont les siens ; pour la pratique un objet **ou** une phase
    (générique), ni l'un ni l'autre sinon ; un cycle pour l'interro et pour une
    pièce générique, qui sont celles d'un cycle."""
    skill_use_cases.resolve_linkable_skill(
        db,
        {domain_id},
        act.skill_id,
        not_found=LinkedSkillNotFound,
        other_domain=SkillDomainMismatch,
    )
    targets = (act.practice_item_id is not None) + (act.nature is not None)
    if targets != (1 if act.kind is ActKind.practice else 0):
        raise ActKindMismatch(str(act.skill_id))
    if act.kind is ActKind.recall and act.plan_id is None:
        raise RecallWithoutPlan(str(act.skill_id))
    if act.nature is not None and act.plan_id is None:
        raise GenericWithoutPlan(str(act.skill_id))
    if act.plan_id is not None:
        plan_skill = db.scalar(
            select(AcquisitionPlan.skill_id).where(AcquisitionPlan.id == act.plan_id)
        )
        if plan_skill is None:
            raise LinkedPlanNotFound(str(act.plan_id))
        if plan_skill != act.skill_id:
            raise PlanSkillMismatch(str(act.plan_id))
    if act.practice_item_id is not None:
        item_skill = db.scalar(
            select(PracticeItem.skill_id).where(PracticeItem.id == act.practice_item_id)
        )
        if item_skill is None:
            raise LinkedPracticeItemNotFound(str(act.practice_item_id))
        if item_skill != act.skill_id:
            raise PlanSkillMismatch(str(act.practice_item_id))
    return ActivityAct(
        skill_id=act.skill_id,
        plan_id=act.plan_id,
        kind=act.kind,
        practice_item_id=act.practice_item_id,
        nature=act.nature,
    )


def resolve_acts(
    db: Session, domain_id: uuid.UUID, acts: list[ActivityActSet]
) -> list[ActivityAct]:
    """Les actes d'une activité, validés, chacun une seule fois."""
    resolved: list[ActivityAct] = []
    for act in acts:
        new = resolve_act(db, domain_id, act)
        if any(act_key(x) == act_key(new) for x in resolved):
            raise DuplicateAct(str(act.skill_id))
        resolved.append(new)
    return resolved


def check_acts_domain(db: Session, activity: Activity, domain_id: uuid.UUID) -> None:
    """Changer le domaine d'une activité qui porte des actes : leurs savoirs
    doivent en être. Refusé sinon, plutôt que de les délier en silence."""
    for act in activity.acts:
        skill_use_cases.resolve_linkable_skill(
            db,
            {domain_id},
            act.skill_id,
            not_found=LinkedSkillNotFound,
            other_domain=SkillDomainMismatch,
        )


# --- Les projets qu'un acte apporte -------------------------------------------


def learning_links(
    db: Session,
    skill_id: uuid.UUID,
    plan_id: uuid.UUID | None,
    start_at: datetime | None,
) -> list[dict]:
    """Les projets qu'apporte un acte (#37, §3 ; #82).

    D'un cycle : les projets **de ce cycle**. Sans cycle : ceux qui visent
    directement son savoir (pas ses enfants). Seulement ceux ouverts le jour de
    l'activité, chacun avec l'étape qui porte ce savoir dans sa séquence (sinon
    aucune). Une activité sans date n'en reçoit aucun : rien ne dit si
    le projet sera ouvert. Ensuite, rien ne se réajuste.
    """
    if start_at is None:
        return []
    day = start_at.date()
    if plan_id is not None:
        plan = db.get(AcquisitionPlan, plan_id)
        projects = list(plan.projects) if plan is not None else []
    else:
        projects = list(
            db.scalars(select(Project).where(Project.skills.any(Skill.id == skill_id)))
        )
    links = []
    for project in projects:
        if not is_open(project, day):
            continue
        step = next(
            (s for s in project.steps if any(k.id == skill_id for k in s.skills)),
            None,
        )
        links.append({"project_id": project.id, "step_id": step.id if step else None})
    return links


def resolve_links(
    db: Session, domain_id: uuid.UUID, links: list[dict]
) -> list[ActivityProject]:
    """Les liens aux projets, validés : un projet qui existe, dont le
    domaine de l'activité est un des domaines (#203), une seule fois ; une
    étape qui appartient au projet de son lien."""
    seen: set[uuid.UUID] = set()
    resolved: list[ActivityProject] = []
    for link in links:
        project_id, step_id = link["project_id"], link.get("step_id")
        if project_id in seen:
            raise DuplicateProjectLink(str(project_id))
        seen.add(project_id)
        project = db.get(Project, project_id)
        if project is None:
            raise LinkedProjectNotFound(str(project_id))
        if domain_id not in project.domain_ids:
            raise ProjectDomainMismatch(str(project_id))
        if step_id is not None:
            step_project = db.scalar(
                select(ProjectStep.project_id).where(ProjectStep.id == step_id)
            )
            if step_project is None:
                raise LinkedStepNotFound(str(step_id))
            if step_project != project_id:
                raise StepProjectMismatch(str(step_id))
        resolved.append(ActivityProject(project_id=project_id, step_id=step_id))
    return resolved


def _add_cycle_projects(db: Session, activity: Activity, act: ActivityAct) -> None:
    """Un acte d'un cycle donne à l'activité les projets du cycle, sans
    toucher à ceux qu'elle a déjà (leur étape reste)."""
    if act.plan_id is None:
        return
    linked = {link.project_id for link in activity.project_links}
    fresh = [
        link
        for link in learning_links(db, act.skill_id, act.plan_id, activity.start_at)
        if link["project_id"] not in linked
    ]
    activity.project_links.extend(resolve_links(db, activity.domain_id, fresh))


# --- Ajouter, retirer -----------------------------------------------------------


def add_act(db: Session, activity: Activity, payload: ActivityActSet) -> Activity:
    """Ajouter un acte à une activité ; ceux d'un cycle apportent ses
    projets (`attach_act`)."""
    attach_act(db, activity, payload)
    db.commit()
    db.refresh(activity)
    return activity


def attach_act(db: Session, activity: Activity, payload: ActivityActSet) -> ActivityAct:
    """Le cœur d'`add_act` : l'acte validé rejoint l'activité, avec les
    projets de son cycle.

    L'interro d'un cycle s'y **déplace** : une seule interro non faite par
    cycle (« passée pendant une session, elle s'y rattache »). Celle qui
    attendait ailleurs — l'interro posée par l'app — perd son acte, et son
    activité part si elle n'existait que pour lui.

    N'enregistre pas : l'appelant valide."""
    act = resolve_act(db, activity.domain_id, payload)
    if any(act_key(x) == act_key(act) for x in activity.acts):
        raise DuplicateAct(str(payload.skill_id))
    if act.kind is ActKind.recall and act.plan_id is not None and not activity.done:
        move_pending_recall(db, act.plan_id, keep=activity)
    activity.acts.append(act)
    _add_cycle_projects(db, activity, act)
    db.flush()
    return act


def remove_act(db: Session, activity: Activity, act_id: uuid.UUID) -> Activity:
    """Retirer un acte de l'activité. Rien d'autre ne bouge : ni ses
    projets, ni l'activité, ni une autre activité."""
    act = next((x for x in activity.acts if x.id == act_id), None)
    if act is None:
        raise ActNotFound(str(act_id))
    activity.acts.remove(act)
    db.commit()
    db.refresh(activity)
    return activity


def set_act_feedback(
    db: Session, activity: Activity, act_id: uuid.UUID, payload: ActivityActFeedbackSet
) -> Activity:
    """Donner (ou effacer) le retour d'un acte de pratique (#139). Il ne
    touche ni au verdict de l'objet ni à la coche de l'activité : aucun lien
    automatique pour l'instant. Le niveau et la note sont indépendants : l'un
    peut aller sans l'autre ; les deux vides effacent le retour."""
    act = next((x for x in activity.acts if x.id == act_id), None)
    if act is None:
        raise ActNotFound(str(act_id))
    if act.kind is not ActKind.practice:
        raise FeedbackOnPracticeOnly(str(act_id))
    act.level = payload.level
    note = (payload.feedback or "").strip()
    act.feedback = note or None
    db.commit()
    db.refresh(activity)
    return activity


# --- Ce que deviennent les actes d'un cycle -------------------------------------


def _drop(db: Session, act: ActivityAct) -> None:
    """Retire l'acte ; l'activité part avec lui si elle n'existait que pour ce
    cycle (`drops_with_its_acts`)."""
    activity = act.activity
    activity.acts.remove(act)
    if drops_with_its_acts(activity.activity_type_id is not None, len(activity.acts)):
        db.delete(activity)


def move_pending_recall(
    db: Session, plan_id: uuid.UUID, keep: Activity | None = None
) -> None:
    """Une seule interro non faite par cycle : celle qui attendait ailleurs
    (hors `keep`) perd son acte, et son activité part si elle n'existait que
    pour lui. Sert quand une séance — existante ou qu'on crée — prend
    l'interro : elle s'y **déplace**. N'enregistre pas."""
    plan = db.get(AcquisitionPlan, plan_id)
    if plan is None:
        return
    for pending in _pending_recalls(plan):
        if pending.activity is not keep:
            _drop(db, pending)
    db.flush()
    db.expire(plan, ["acts"])


def _pending_recalls(plan: AcquisitionPlan) -> list[ActivityAct]:
    """Les interros du cycle encore à passer : ses actes d'interro non passés,
    dans des activités non faites (cocher l'activité à la main vaut passée)."""
    return [
        a
        for a in plan.acts
        if a.kind is ActKind.recall and a.passed_on is None and not a.activity.done
    ]


def withdraw_recall_activity(db: Session, plan: AcquisitionPlan) -> None:
    """Retire l'interro posée non faite du cycle (sa courbe se met en pause, ou
    s'efface) : l'acte, et l'activité s'il n'y avait qu'elle."""
    for act in _pending_recalls(plan):
        _drop(db, act)
    db.flush()
    db.expire(plan, ["acts"])


def release_plan_acts(db: Session, plan: AcquisitionPlan) -> None:
    """Ce que deviennent les actes d'un cycle qu'on défait (annuler le
    démarrage, supprimer) : dans une activité faite ou passée, ils restent,
    sans cycle ; dans une activité à venir — et pour l'interro non passée,
    quelle que soit sa date —, ils sont retirés, et l'activité avec eux si elle
    n'existait que pour ce cycle."""
    today = date.today()
    for act in list(plan.acts):
        activity = act.activity
        pending_recall = (
            act.kind is ActKind.recall and act.passed_on is None and not activity.done
        )
        if pending_recall or is_upcoming(activity.done, activity.start_at, today):
            _drop(db, act)
        else:
            act.plan_id = None
    db.flush()
    db.expire(plan, ["acts"])


def place_recall_activity(db: Session, plan: AcquisitionPlan) -> Activity | None:
    """Pose l'interro du cycle au calendrier, au jour de son prochain rappel.

    Une activité à elle seule, journée entière, « Interro · *savoir* », avec
    les projets du cycle et un acte d'interro. L'app ne pose d'elle-même que
    ce dont elle seule connaît la date. Une seule à la fois : si une activité
    non faite porte déjà l'interro du cycle, rien n'est posé et c'est elle qui
    est rendue. Sans prochain rappel (pas de courbe en marche), rien.

    N'enregistre pas : l'appelant valide (`db.commit()`), avec le reste de son
    geste — « Lancer le test » aujourd'hui, la fin d'une passation demain.
    """
    due = plan.recall_next_due_at
    if due is None:
        return None
    pending = _pending_recalls(plan)
    if pending:
        return pending[0].activity
    return _new_recall_activity(db, plan, due)


def take_recall_activity(db: Session, plan: AcquisitionPlan, day: date) -> Activity:
    """L'interro du cycle vient d'être passée : son acte posé (le seul en
    attente) se marque passé ce jour-là ; aucun posé, une activité Interro naît
    ce jour-là, faite (#78, point 6). La passation s'accroche ainsi au
    calendrier, quelle que soit la date prévue.

    L'activité qui la porte ne se coche que si elle ne contient **que**
    l'interro (20/10/2026) : une séance qui porte aussi d'autres actes n'est
    pas finie avec la passation, et ne bouge pas. Celle qui n'est qu'une
    interro garde son créneau le jour même ; un autre jour, elle va au jour de
    la passation, en journée entière.

    N'enregistre pas : l'appelant valide."""
    pending = _pending_recalls(plan)
    if pending:
        act = pending[0]
        act.passed_on = day
        activity = act.activity
        if all(x.kind is ActKind.recall for x in activity.acts):
            if activity.start_at is None or activity.start_at.date() != day:
                at = datetime(day.year, day.month, day.day)
                activity.all_day = True
                activity.start_at = at
                activity.end_at = at
            activity.done = True
    else:
        activity = _new_recall_activity(db, plan, day)
        activity.acts[0].passed_on = day
        activity.done = True
    db.flush()
    db.expire(plan, ["acts"])
    return activity


def _new_recall_activity(db: Session, plan: AcquisitionPlan, due: date) -> Activity:
    """Une activité Interro, journée entière, au jour donné."""
    skill = plan.skill
    day = datetime(due.year, due.month, due.day)
    activity = Activity(
        domain_id=skill.domain_id,
        title=f"Interro · {skill.name}"[:200],
        emoji="🧠",
        all_day=True,
        start_at=day,
        end_at=day,
    )
    activity.acts = [ActivityAct(skill_id=skill.id, plan=plan, kind=ActKind.recall)]
    activity.project_links = resolve_links(
        db, skill.domain_id, learning_links(db, skill.id, plan.id, day)
    )
    db.add(activity)
    db.flush()
    return activity


def new_study_activity(
    db: Session, plan: AcquisitionPlan, due: date, title: str
) -> Activity:
    """Une séance d'étude du savoir, journée entière, au jour donné — la
    révision qu'on pose depuis l'interro (#103). Elle sert le cycle s'il n'est
    pas clos, avec ses projets du jour.

    N'enregistre pas : l'appelant valide."""
    skill = plan.skill
    serves = None if plan.is_closed else plan
    day = datetime(due.year, due.month, due.day)
    activity = Activity(
        domain_id=skill.domain_id,
        title=title[:200],
        all_day=True,
        start_at=day,
        end_at=day,
    )
    activity.acts = [ActivityAct(skill_id=skill.id, plan=serves, kind=ActKind.study)]
    activity.project_links = resolve_links(
        db,
        skill.domain_id,
        learning_links(db, skill.id, serves.id if serves else None, day),
    )
    db.add(activity)
    db.flush()
    return activity


def move_activity_to(activity: Activity, due: date) -> None:
    """Une activité journée entière, déplacée au jour donné."""
    day = datetime(due.year, due.month, due.day)
    activity.all_day = True
    activity.start_at = day
    activity.end_at = day
