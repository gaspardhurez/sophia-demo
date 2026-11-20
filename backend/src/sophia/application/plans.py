"""Use cases du cycle d'acquisition (V4, refondus le 01/10/2026).

Un savoir porte plusieurs cycles : des **prévus** (brouillons), **un seul en
cours**, des clos. Chaque cycle sert zéro, un ou plusieurs projets et compose
sa rampe en piochant dans la bibliothèque du savoir. Les gestes : prévoir,
préparer (ajuster), commencer, terminer, constater, abandonner, reprendre.

Le statut du savoir se **dérive** dès qu'il porte un cycle. Rien ne se clôt
tout seul : quand tout est validé, l'écran **propose** de terminer.
"""

import uuid
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from sophia.application import acts as act_use_cases
from sophia.application import sequence as sequence_use_cases
from sophia.application.schemas.activity import ActivityActSet
from sophia.application.schemas.plan import (
    PlanComplete,
    PlanCreate,
    PlanItemUpdate,
    PlanRampOrder,
    PlanResourceOrder,
    PlanResourceUpdate,
    PlanUpdate,
    ScopeRename,
)
from sophia.domain.mastery import can_carry_first_recall
from sophia.domain.plan import (
    PlanAlreadyClosed,
    PlanAlreadyOpen,
    PlanClosedProjects,
    PlanHasProjects,
    PlanInvalidBirthState,
    PlanItemAlreadyInRamp,
    PlanItemNotInRamp,
    PlanItemSkillMismatch,
    PlanNotReopenable,
    PlanNotStarted,
    PlanProjectDomainMismatch,
    PlanProjectNotFound,
    PlanRampOrderMismatch,
    PlanResourceNotInCycle,
    PlanResourceNotOfSkill,
    PlanResourceOrderMismatch,
    PlanSkillNotFound,
    PlanStudyNotOpen,
    RecallActivityNotEligible,
    RecallCurveStarted,
    RecallWithoutQuestion,
    StudyHasQuestions,
    check_period,
)
from sophia.domain.recall import due_after
from sophia.domain.scope_links import follow_scope, link_scope_parts
from sophia.infrastructure.models import (
    AcquisitionPlan,
    Activity,
    ActivityAct,
    ActKind,
    PlanItem,
    PlanResource,
    PlanState,
    PracticeItem,
    PracticeNature,
    Project,
    ProjectStatus,
    Resource,
    Skill,
    SkillStatus,
)

# Un projet « encore ouvert » au sens du cycle : ni réussi, ni raté, ni
# abandonné. C'est à lui qu'on rend un brouillon quand son cycle s'arrête.
_OPEN = {ProjectStatus.todo, ProjectStatus.in_progress}


def _load_skill(db: Session, skill_id: uuid.UUID) -> Skill:
    skill = db.get(Skill, skill_id)
    if skill is None:
        raise PlanSkillNotFound(str(skill_id))
    return skill


def _refresh(db: Session, skill: Skill) -> None:
    db.flush()
    db.refresh(skill)
    _sync_skill_status(skill)


def _sync_skill_status(skill: Skill) -> None:
    """Le statut suit les cycles — dérivé, plus déclaré.

    Un cycle en cours : « En cours ». Sinon un cycle acquis : « Acquis ».
    Sinon, des cycles existent (prévus, abandonnés) : « Non acquis » —
    préparer n'est pas s'y mettre, abandonner n'acquiert rien. Aucun cycle :
    on ne touche à rien, le statut reste celui saisi à la main.

    Ouvrir un nouveau cycle sur un savoir acquis le repasse en cours, et c'est
    voulu : on retravaille. Ce qu'un projet avait atteint ne bouge pas — sa
    condition lit **son** cycle, qui reste clos.
    """
    if skill.active_plan is not None:
        skill.status = SkillStatus.in_progress
    elif any(p.state is PlanState.completed for p in skill.plans):
        skill.status = SkillStatus.acquired
    elif skill.plans:
        skill.status = SkillStatus.not_started


def _now() -> datetime:
    return datetime.now(UTC)


def _at(day: date | None) -> datetime:
    """Une date de constat, à midi pour qu'aucun fuseau ne la fasse changer
    de jour."""
    if day is None:
        return _now()
    return datetime(day.year, day.month, day.day, 12, tzinfo=UTC)


def _check_open(plan: AcquisitionPlan) -> None:
    if plan.is_closed:
        raise PlanAlreadyClosed(str(plan.id))


# --- La rampe ---------------------------------------------------------------


def _ramp(plan: AcquisitionPlan, nature: PracticeNature) -> list[PlanItem]:
    return sorted(
        (link for link in plan.items if link.item.nature is nature),
        key=lambda link: link.rank,
    )


def _append(plan: AcquisitionPlan, item: PracticeItem) -> PlanItem:
    """Un objet pioché arrive **en fin de sa rampe** : il n'a aucune raison de
    s'intercaler au milieu d'une progression réfléchie."""
    ramp = _ramp(plan, item.nature)
    link = PlanItem(item=item, rank=ramp[-1].rank + 1 if ramp else 0)
    plan.items.append(link)
    return link


# --- Les projets d'un cycle -------------------------------------------------


def _resolve_projects(db: Session, skill: Skill, ids: list[uuid.UUID]) -> list[Project]:
    projects = []
    for project_id in dict.fromkeys(ids):
        project = db.get(Project, project_id)
        if project is None:
            raise PlanProjectNotFound(str(project_id))
        if skill.domain_id not in project.domain_ids:
            raise PlanProjectDomainMismatch(str(project_id))
        projects.append(project)
    return projects


def _project_cycle(
    skill: Skill, project: Project, exclude: AcquisitionPlan | None = None
) -> AcquisitionPlan | None:
    """Le cycle non abandonné de ce savoir pour ce projet — un au plus."""
    return next(
        (
            p
            for p in skill.plans
            if p is not exclude
            and p.state is not PlanState.abandoned
            and project in p.projects
        ),
        None,
    )


def _drop_if_empty(db: Session, plan: AcquisitionPlan) -> None:
    """Un brouillon vide que plus aucun projet n'attend disparaît : il
    n'existait que par ce lien, le perdre ne coûte rien."""
    if plan.is_empty and not plan.projects:
        plan.skill.plans.remove(plan)
        db.delete(plan)


def _give_draft(db: Session, skill: Skill, projects: list[Project]) -> None:
    """Rend un brouillon vide aux projets ouverts qui visent encore le savoir
    et n'ont plus de cycle pour lui : « savoir visé, rien de prévu »."""
    waiting = [
        o
        for o in projects
        if o.effective_status in _OPEN
        and skill.id in o.skill_ids
        and _project_cycle(skill, o) is None
    ]
    if waiting:
        skill.plans.append(AcquisitionPlan(projects=waiting))


def _set_projects(db: Session, plan: AcquisitionPlan, projects: list[Project]) -> None:
    """Rattache le cycle à ces projets, et à eux seuls.

    - Un projet qui avait déjà un cycle pour ce savoir **le quitte** pour
      celui-ci — c'est le partage. Vide, l'ancien disparaît ; préparé, il
      reste, détaché.
    - Un projet qui ne visait pas encore le savoir le vise désormais : on
      rattache un cycle à un projet parce qu'il en dépend.
    - Un projet retiré du cycle retrouve un brouillon vide, s'il vise encore
      le savoir.
    """
    skill = plan.skill
    removed = [o for o in plan.projects if o not in projects]
    for project in projects:
        other = _project_cycle(skill, project, exclude=plan)
        if other is not None:
            other.projects.remove(project)
            _drop_if_empty(db, other)
        if skill.id not in project.skill_ids:
            project.skills.append(skill)
            db.flush()
            sequence_use_cases.normalize_sequence(db, project)
    plan.projects = list(projects)
    db.flush()
    _give_draft(db, skill, removed)


# --- Lire ---------------------------------------------------------------------


def list_plans(db: Session, skill_id: uuid.UUID) -> list[AcquisitionPlan]:
    """Les cycles d'un savoir, du plus ancien au plus récent : **l'échelle de
    maîtrise**, découverte plutôt que déclarée."""
    return list(
        db.scalars(
            select(AcquisitionPlan)
            .options(
                selectinload(AcquisitionPlan.skill),
                selectinload(AcquisitionPlan.projects),
                selectinload(AcquisitionPlan.items).selectinload(PlanItem.item),
                selectinload(AcquisitionPlan.acts).selectinload(ActivityAct.activity),
            )
            .where(AcquisitionPlan.skill_id == skill_id)
            .order_by(AcquisitionPlan.created_at)
        )
    )


def get_plan(db: Session, plan_id: uuid.UUID) -> AcquisitionPlan | None:
    return db.get(AcquisitionPlan, plan_id)


# --- Naître -------------------------------------------------------------------


def create_plan(
    db: Session, skill_id: uuid.UUID, payload: PlanCreate
) -> AcquisitionPlan:
    """Prévoir un cycle — toujours permis —, l'ouvrir d'emblée si aucun n'est
    en cours, ou le dire **déjà terminé** : clos acquis à sa période, sans
    projet (il ne remplit rien), à remplir ensuite par Ajuster."""
    skill = _load_skill(db, skill_id)
    data = payload.model_dump(exclude={"project_ids", "started_on", "finished_on"})
    if payload.state is PlanState.abandoned:
        raise PlanInvalidBirthState(str(skill_id))
    if payload.state is PlanState.active and skill.active_plan is not None:
        raise PlanAlreadyOpen(str(skill_id))
    finished = payload.state is PlanState.completed
    if finished:
        check_period(payload.started_on, payload.finished_on, date.today())
        if payload.project_ids:
            raise PlanClosedProjects(str(skill_id))
    projects = _resolve_projects(db, skill, payload.project_ids)
    plan = AcquisitionPlan(**data)
    skill.plans.append(plan)
    db.flush()
    _set_projects(db, plan, projects)
    if plan.state is PlanState.active:
        plan.opened_at = _now()
    if finished:
        # Acquis sans avoir été pratiqué dans l'app : la trace d'un constat.
        plan.observed = True
        plan.opened_at = _at(payload.started_on)
        plan.closed_at = _at(payload.finished_on)
    _refresh(db, skill)
    db.commit()
    db.refresh(plan)
    return plan


def link_skills(
    db: Session, project: Project, before: list[Skill], after: list[Skill]
) -> None:
    """Le lien projet → savoir prépare un cycle ; le défaire le reprend.

    Un savoir lié reçoit un brouillon rattaché au projet, s'il n'a pas déjà
    un cycle pour lui. Un savoir délié perd ce lien sur tous ses cycles : un
    brouillon vide disparaît, un cycle préparé, lancé ou clos reste sur le
    savoir, détaché.
    """
    added = [s for s in after if s not in before]
    removed = [s for s in before if s not in after]
    for skill in added:
        if _project_cycle(skill, project) is None:
            skill.plans.append(AcquisitionPlan(projects=[project]))
    for skill in removed:
        for plan in list(skill.plans):
            if project in plan.projects:
                plan.projects.remove(project)
                _drop_if_empty(db, plan)
    db.flush()


# --- Préparer -----------------------------------------------------------------


def update_plan(
    db: Session, plan: AcquisitionPlan, payload: PlanUpdate
) -> AcquisitionPlan:
    """Le cycle est **vivant** : nom, niveau, phases, projets, rétention
    s'ajustent. Rien ne se clôt pour autant. Clos, il se règle encore — c'est
    ainsi qu'on remplit un cycle déjà terminé —, mais ne change plus
    de projets."""
    data = payload.model_dump(exclude_unset=True)
    project_ids = data.pop("project_ids", None)
    resource_ids = data.pop("resource_ids", None)
    data.pop("scope_renames", None)
    if (
        plan.is_closed
        and project_ids is not None
        and set(project_ids) != {o.id for o in plan.projects}
    ):
        raise PlanClosedProjects(str(plan.id))
    for field, value in data.items():
        setattr(plan, field, value)
    if "scope" in data:
        _follow_scope(plan, payload.scope_renames or [])
    if project_ids is not None:
        _set_projects(db, plan, _resolve_projects(db, plan.skill, project_ids))
    if resource_ids is not None:
        _set_resources(plan, resource_ids)
    _refresh(db, plan.skill)
    db.commit()
    db.refresh(plan)
    return plan


def add_plan_item(
    db: Session, plan: AcquisitionPlan, item_id: uuid.UUID
) -> AcquisitionPlan:
    item = db.get(PracticeItem, item_id)
    if item is None or item.skill_id != plan.skill_id:
        raise PlanItemSkillMismatch(str(item_id))
    if any(link.item_id == item_id for link in plan.items):
        raise PlanItemAlreadyInRamp(str(item_id))
    _append(plan, item)
    db.commit()
    db.refresh(plan)
    return plan


def _link(plan: AcquisitionPlan, item_id: uuid.UUID) -> PlanItem:
    link = next((x for x in plan.items if x.item_id == item_id), None)
    if link is None:
        raise PlanItemNotInRamp(str(item_id))
    return link


def update_plan_item(
    db: Session, plan: AcquisitionPlan, item_id: uuid.UUID, payload: PlanItemUpdate
) -> AcquisitionPlan:
    """Le verdict d'un objet dans ce cycle, sa rétention, ou son critère de
    maîtrise (#157). Valider le dernier objet ne clôt rien : l'écran propose
    de terminer."""
    link = _link(plan, item_id)
    data = payload.model_dump(exclude_unset=True)
    # Le verdict se date ; le retirer efface la date.
    if "done" in data and data["done"] is not None and data["done"] != link.done:
        link.done_at = _now() if data["done"] else None
    for field, value in data.items():
        setattr(link, field, value)
    db.commit()
    db.refresh(plan)
    return plan


def remove_plan_item(
    db: Session, plan: AcquisitionPlan, item_id: uuid.UUID
) -> AcquisitionPlan:
    """Retirer du cycle : l'objet reste dans la bibliothèque, ses séances au
    calendrier."""
    plan.items.remove(_link(plan, item_id))
    db.commit()
    db.refresh(plan)
    return plan


def reorder_plan_items(
    db: Session, plan: AcquisitionPlan, payload: PlanRampOrder
) -> AcquisitionPlan:
    """Réécrit une rampe du cycle dans l'ordre demandé — la liste entière."""
    ramp = {link.item_id: link for link in _ramp(plan, payload.nature)}
    wanted = list(payload.item_ids)
    if len(set(wanted)) != len(wanted) or set(wanted) != set(ramp):
        raise PlanRampOrderMismatch(str(plan.id))
    for rank, item_id in enumerate(wanted):
        ramp[item_id].rank = rank
    db.commit()
    db.refresh(plan)
    return plan


def _compact(plan: AcquisitionPlan) -> None:
    """Les positions des ressources du cycle, renumérotées de 0 à n-1 dans
    leur ordre actuel."""
    links = sorted(plan.resource_links, key=lambda link: link.position)
    for position, link in enumerate(links):
        link.position = position


def _set_resources(plan: AcquisitionPlan, resource_ids: list[uuid.UUID]) -> None:
    """Les ressources que le cycle étudie (la liste entière), prises dans la
    bibliothèque de son savoir.

    Celles qui restent gardent leur place et leur case « consommée » ; celles
    qui partent laissent leur place (les positions se recompactent) ; les
    nouvelles vont en fin, dans l'ordre de la liste. L'ordre de la liste ne
    réordonne pas le reste : c'est le rôle de `reorder_resources`."""
    resources = {r.id: r for r in plan.skill.resources}
    if any(rid not in resources for rid in resource_ids):
        raise PlanResourceNotOfSkill(str(plan.id))
    wanted = list(dict.fromkeys(resource_ids))
    for link in list(plan.resource_links):
        if link.resource_id not in wanted:
            remove_resource(plan, link.resource_id)
    for rid in wanted:
        add_resource(plan, resources[rid])


def add_resource(plan: AcquisitionPlan, resource: Resource) -> None:
    """Une ressource entre dans l'étude du cycle **en fin** de l'ordre de
    consommation (créée depuis un cycle, elle y entre aussi). Déjà là, rien
    ne change."""
    if any(link.resource is resource for link in plan.resource_links):
        return
    positions = [link.position for link in plan.resource_links]
    plan.resource_links.append(
        PlanResource(resource=resource, position=max(positions, default=-1) + 1)
    )


def remove_resource(plan: AcquisitionPlan, resource_id: uuid.UUID) -> None:
    """La ressource quitte l'étude du cycle ; l'ordre se recompacte."""
    plan.resource_links.remove(_resource_link(plan, resource_id))
    _compact(plan)


def _resource_link(plan: AcquisitionPlan, resource_id: uuid.UUID) -> PlanResource:
    link = next((x for x in plan.resource_links if x.resource_id == resource_id), None)
    if link is None:
        raise PlanResourceNotInCycle(str(resource_id))
    return link


def reorder_resources(
    db: Session, plan: AcquisitionPlan, payload: PlanResourceOrder
) -> AcquisitionPlan:
    """Réécrit l'ordre de consommation du cycle — la liste entière."""
    links = {link.resource_id: link for link in plan.resource_links}
    wanted = list(payload.resource_ids)
    if len(set(wanted)) != len(wanted) or set(wanted) != set(links):
        raise PlanResourceOrderMismatch(str(plan.id))
    for position, resource_id in enumerate(wanted):
        links[resource_id].position = position
    db.commit()
    db.refresh(plan)
    return plan


def _follow_scope(plan: AcquisitionPlan, renames: list[ScopeRename]) -> None:
    """Le périmètre vient d'être réécrit : les liens des ressources le
    suivent (`domain/scope_links.follow_scope`) — renommés, ou retirés pour
    une partie qui n'est plus retenue."""
    mapping = {r.from_: r.to for r in renames}
    for link in plan.resource_links:
        if link.scope_parts:
            link.scope_parts = follow_scope(link.scope_parts, plan.scope, mapping)


def update_plan_resource(
    db: Session,
    plan: AcquisitionPlan,
    resource_id: uuid.UUID,
    payload: PlanResourceUpdate,
) -> AcquisitionPlan:
    """Cocher « consommée » la date ; décocher l'efface. Recocher une
    ressource déjà consommée garde sa date. La position ne bouge pas : la
    mettre en bas est l'affaire de l'écran.

    Les parties du périmètre liées (30/10) : la liste entière, des parties
    retenues du périmètre courant — un bord ou une partie inconnue est
    refusé."""
    link = _resource_link(plan, resource_id)
    if payload.scope_parts is not None:
        link.scope_parts = link_scope_parts(payload.scope_parts, plan.scope)
    if payload.consumed is False:
        link.consumed_at = None
    elif payload.consumed and link.consumed_at is None:
        link.consumed_at = _now()
    db.commit()
    db.refresh(plan)
    return plan


# --- L'étude ------------------------------------------------------------------


def launch_recall(
    db: Session, plan: AcquisitionPlan, activity_id: uuid.UUID | None
) -> AcquisitionPlan:
    """« Lancer le test » (#157), sur le cycle en cours : la courbe de
    l'interro démarre — rien ne la lance seul. Elle ne se lance qu'une fois
    (ensuite, « Recommencer »), et seulement si le savoir a au moins une
    question complète.

    Sans séance, le premier test est posé demain au calendrier, en journée
    entière (#82). Avec une séance — non faite, du domaine du savoir, de J+1 à
    J+3 —, c'est elle qui le porte : la courbe part de son jour, et aucune
    activité Interro séparée ne naît.
    """
    if plan.state is not PlanState.active:
        raise PlanStudyNotOpen(str(plan.id))
    if plan.recall_stage is not None:
        raise RecallCurveStarted(str(plan.id))
    if not plan.question_count:
        raise RecallWithoutQuestion(str(plan.id))
    today = date.today()
    carrier = None
    if activity_id is not None:
        carrier = db.get(Activity, activity_id)
        if (
            carrier is None
            or carrier.domain_id != plan.skill.domain_id
            or carrier.done
            or carrier.start_at is None
            or not can_carry_first_recall(carrier.start_at.date(), today)
        ):
            raise RecallActivityNotEligible(str(activity_id))
    plan.recall_stage = 0
    plan.recall_launched_at = _now()
    if carrier is None:
        plan.recall_next_due_at = due_after(today, 0)
        act_use_cases.place_recall_activity(db, plan)
    else:
        plan.recall_next_due_at = carrier.start_at.date()
        act_use_cases.attach_act(
            db,
            carrier,
            ActivityActSet(
                skill_id=plan.skill_id, kind=ActKind.recall, plan_id=plan.id
            ),
        )
    _refresh(db, plan.skill)
    db.commit()
    db.refresh(plan)
    return plan


def validate_study(db: Session, plan: AcquisitionPlan) -> AcquisitionPlan:
    """« Valider l'étude » (#157), à la main, sur le cycle en cours — pour une
    étude **sans questions** : avec des questions, elle se maîtrise par
    l'interro. Valider deux fois garde la première date."""
    if plan.state is not PlanState.active:
        raise PlanStudyNotOpen(str(plan.id))
    if plan.question_count:
        raise StudyHasQuestions(str(plan.id))
    if plan.study_validated_at is None:
        plan.study_validated_at = _now()
    _refresh(db, plan.skill)
    db.commit()
    db.refresh(plan)
    return plan


# --- Commencer ----------------------------------------------------------------


def open_plan(db: Session, plan: AcquisitionPlan) -> AcquisitionPlan:
    """Commencer : le cycle prévu devient le cycle en cours, daté
    d'aujourd'hui. Refusé si un autre est déjà en cours — l'écran propose de
    le partager ou de le clore."""
    _check_open(plan)
    if plan.state is PlanState.draft:
        active = plan.skill.active_plan
        if active is not None:
            raise PlanAlreadyOpen(str(plan.skill_id))
        plan.state = PlanState.active
        plan.opened_at = _now()
    _refresh(db, plan.skill)
    db.commit()
    db.refresh(plan)
    return plan


def start_skill(
    db: Session, skill_id: uuid.UUID, project_id: uuid.UUID | None = None
) -> AcquisitionPlan:
    """Commencer un savoir, depuis un projet (sa carte de départ) ou le hub.

    Pour un projet : son cycle s'ouvre — ou naît ouvert, rattaché à lui.
    Déjà en cours, il est rendu tel quel. Sans projet : le dernier cycle
    prévu s'ouvre, ou un cycle naît ouvert. Un autre cycle en cours : refus.
    """
    skill = _load_skill(db, skill_id)
    if project_id is not None:
        (project,) = _resolve_projects(db, skill, [project_id])
        plan = _project_cycle(skill, project)
        if plan is not None and plan.state is not PlanState.draft:
            return plan
        if plan is None:
            if skill.active_plan is not None:
                raise PlanAlreadyOpen(str(skill_id))
            return create_plan(
                db,
                skill_id,
                PlanCreate(state=PlanState.active, project_ids=[project_id]),
            )
        return open_plan(db, plan)
    drafts = [p for p in skill.plans if p.state is PlanState.draft]
    if skill.active_plan is not None:
        raise PlanAlreadyOpen(str(skill_id))
    if drafts:
        return open_plan(db, drafts[-1])
    return create_plan(db, skill_id, PlanCreate(state=PlanState.active))


def open_on_completion(db: Session, activity: Activity) -> None:
    """La **première complétion** ouvre un cycle prévu (#107, points 5 et 10).

    Planifier n'ouvre rien : un acte posé sur un savoir pas démarré vise son
    cycle prévu. Cocher la séance qui le porte ouvre ce cycle, daté du jour de
    la séance — comme « Démarrer ». Rien ne s'ouvre si un autre cycle du savoir
    est déjà en cours ; décocher ne referme rien.

    N'enregistre pas : l'appelant valide, avec la coche."""
    if not activity.done:
        return
    day = activity.start_at.date() if activity.start_at is not None else None
    for act in activity.acts:
        plan = act.plan
        if plan is None or plan.state is not PlanState.draft:
            continue
        if plan.skill.active_plan is not None:
            continue
        plan.state = PlanState.active
        plan.opened_at = _at(day)
        _refresh(db, plan.skill)


# --- Clore --------------------------------------------------------------------


def complete_plan(
    db: Session, plan: AcquisitionPlan, payload: PlanComplete | None = None
) -> AcquisitionPlan:
    """Terminer : le cycle se ferme acquis, et la rétention prend le relais
    avec ce qu'on a choisi de garder.

    Permis même si tout n'est pas validé : la satisfaction **oriente**, elle
    ne tranche pas — celui qui apprend juge. L'interro gardée en rétention
    continue sa courbe — la même : une courbe terminée ne reprend pas ;
    sinon, elle s'arrête là (#80).
    """
    _check_open(plan)
    if payload is not None and payload.retention_item_ids is not None:
        kept = set(payload.retention_item_ids)
        for link in plan.items:
            link.in_retention = link.item_id in kept
    if payload is not None and payload.recall_in_retention is not None:
        plan.recall_in_retention = payload.recall_in_retention
    if not plan.recall_in_retention:
        # La courbe s'arrête : l'interro posée et pas encore passée part avec.
        plan.recall_next_due_at = None
        act_use_cases.withdraw_recall_activity(db, plan)
    plan.state = PlanState.completed
    plan.closed_at = _now()
    if plan.opened_at is None:
        plan.opened_at = plan.closed_at
    _refresh(db, plan.skill)
    db.commit()
    db.refresh(plan)
    return plan


def abandon_plan(db: Session, plan: AcquisitionPlan) -> AcquisitionPlan:
    """Arrêter en route, sans rien acter. Le cycle garde ses projets — pour
    savoir à qui il revient si on le reprend — et chacun, encore ouvert,
    retrouve un brouillon vide. La courbe de l'interro s'arrête."""
    _check_open(plan)
    plan.state = PlanState.abandoned
    plan.recall_next_due_at = None
    act_use_cases.withdraw_recall_activity(db, plan)
    plan.closed_at = _now()
    db.flush()
    _give_draft(db, plan.skill, list(plan.projects))
    _refresh(db, plan.skill)
    db.commit()
    db.refresh(plan)
    return plan


def reopen_plan(db: Session, plan: AcquisitionPlan) -> AcquisitionPlan:
    """Rouvrir un cycle clos — abandonné ou acquis —, là où on l'avait laissé,
    avec ses réussites. Acquis, il ne remplit plus ses projets tant qu'il
    n'est pas terminé à nouveau (la condition lit l'état).

    Il retrouve ses projets : le brouillon vide qu'ils avaient reçu
    disparaît ; un cycle qu'on y a préparé ou lancé entre-temps garde
    le projet, et le cycle rouvert s'en détache.
    """
    if not plan.is_closed:
        raise PlanNotReopenable(str(plan.id))
    skill = plan.skill
    if skill.active_plan is not None:
        raise PlanAlreadyOpen(str(plan.skill_id))
    for project in list(plan.projects):
        other = _project_cycle(skill, project, exclude=plan)
        if other is None:
            continue
        if other.is_empty:
            other.projects.remove(project)
            _drop_if_empty(db, other)
        else:
            plan.projects.remove(project)
    plan.state = PlanState.active
    plan.closed_at = None
    if plan.opened_at is None:
        plan.opened_at = _now()
    _refresh(db, skill)
    db.commit()
    db.refresh(plan)
    return plan


def unstart_plan(db: Session, plan: AcquisitionPlan) -> AcquisitionPlan:
    """Annuler le démarrage : le cycle en cours redevient prévu. Ses réussites
    sont effacées (verdicts, étude validée, courbe de l'interro et son
    lancement) ; ses actes
    suivent `release_plan_acts` (faits ou passés, gardés sans cycle ; à venir
    et interro non passée, retirés). Une passation de l'interro en cours part
    avec la courbe ; les passations terminées restent, comme les séances
    faites. Phases, exercices, nom, niveau visé et projets sont gardés."""
    if plan.state is not PlanState.active:
        raise PlanNotStarted(str(plan.id))
    for link in plan.items:
        link.done = False
        link.done_at = None
    for session in [s for s in plan.recall_sessions if not s.is_finished]:
        plan.recall_sessions.remove(session)
    plan.recall_restarts.clear()
    plan.recall_launched_at = None
    plan.study_validated_at = None
    plan.recall_stage = None
    plan.recall_next_due_at = None
    plan.state = PlanState.draft
    plan.opened_at = None
    plan.retention_next_due_at = None
    act_use_cases.release_plan_acts(db, plan)
    _refresh(db, plan.skill)
    db.commit()
    db.refresh(plan)
    return plan


def delete_plan(db: Session, plan: AcquisitionPlan) -> None:
    """Supprimer un cycle, quel que soit son état, s'il ne sert aucun projet
    (on modifie le cycle d'un projet, on ne le supprime pas). Il disparaît de
    l'historique ; ses actes suivent la même règle qu'à l'annulation du
    démarrage."""
    if plan.projects:
        raise PlanHasProjects(str(plan.id))
    act_use_cases.release_plan_acts(db, plan)
    skill = plan.skill
    skill.plans.remove(plan)
    db.delete(plan)
    _refresh(db, skill)
    db.commit()
