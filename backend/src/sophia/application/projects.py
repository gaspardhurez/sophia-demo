"""Use cases sur les projets.

CRUD + gestion du statut (`achieved_at` posé/effacé à la bascule) et du lien aux
compétences (validation : elles doivent exister et appartenir à un des domaines
du projet). Changer les domaines d'un projet vit dans `project_domains`.
"""

import uuid
from collections.abc import Collection
from datetime import UTC, date, datetime, time

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from sophia.application import planning as planning_use_cases
from sophia.application import plans as plan_use_cases
from sophia.application import sequence as sequence_use_cases
from sophia.application import skills as skill_use_cases
from sophia.application.domains import counters_of
from sophia.application.schemas.domain import DomainCounter
from sophia.application.schemas.project import (
    AchievementCreate,
    AchievementUpdate,
    ProjectCreate,
    ProjectStepCreate,
    ProjectStepUpdate,
    ProjectUpdate,
    TotalCreate,
    TotalUpdate,
)
from sophia.domain.period import Neighbor, clip_step, place_step
from sophia.domain.project import (
    ActivityTypeDomainMismatch,
    LinkedSkillFromOtherDomain,
    LinkedSkillNotFound,
    ProjectDomainNotFound,
    SequenceMismatch,
    StepConditionNotDeclared,
    StepsReorderMismatch,
    StepTargetsExceedProject,
    TotalUnitMismatch,
    check_domain_ids,
)
from sophia.infrastructure.models import (
    Activity,
    ActivityProject,
    ActivityType,
    Domain,
    Planning,
    Project,
    ProjectAchievement,
    ProjectActivityType,
    ProjectDomain,
    ProjectStatus,
    ProjectStep,
    ProjectTotal,
    Skill,
    StepMetric,
    StepTotal,
    TotalMode,
)

# Chargement complet d'un projet pour la sérialisation (steps + compétences des
# deux niveaux), afin d'éviter le lazy-load N+1 à la réponse.
_FULL_LOAD = (
    selectinload(Project.domain_links),
    selectinload(Project.skills),
    selectinload(Project.steps).selectinload(ProjectStep.skills),
    selectinload(Project.steps)
    .selectinload(ProjectStep.activities)
    .selectinload(Activity.acts),
    # Les réalisations sont sérialisées avec le projet ET consultées par le
    # statut dérivé : sans ça, une liste de projets les rechargerait une par
    # une, deux fois.
    selectinload(Project.achievements).selectinload(ProjectAchievement.activities),
    selectinload(Project.activity_types).selectinload(
        ProjectActivityType.activity_type
    ),
    # Les Totaux et leurs tranches : sérialisés ET consultés par le statut, et
    # chacun recompte les activités du projet ou de l'étape.
    selectinload(Project.totals).selectinload(ProjectTotal.activity_types),
    selectinload(Project.activities).selectinload(Activity.values),
    selectinload(Project.activities).selectinload(Activity.acts),
    selectinload(Project.steps).selectinload(ProjectStep.totals),
)


def _resolve_skills(
    db: Session, domain_ids: Collection[uuid.UUID], skill_ids: list[uuid.UUID]
) -> list[Skill]:
    """Charge les compétences liées en validant existence et appartenance.

    Dédoublonne en préservant l'ordre. Lève une `ProjectError` si une
    compétence est introuvable ou n'est **d'aucun** des domaines du
    projet. Un parent se lie comme les autres : il n'y a plus de nature
    « catégorie » à refuser.

    Projets et étapes passent tous les deux par cette fonction ; la règle
    elle-même vit dans `skills.resolve_linkable_skill`, que les activités
    partagent depuis la V4 — ici on ne garde que le dédoublonnage, l'ordre et les
    erreurs propres au projet.
    """
    return [
        skill_use_cases.resolve_linkable_skill(
            db,
            domain_ids,
            skill_id,
            not_found=LinkedSkillNotFound,
            other_domain=LinkedSkillFromOtherDomain,
        )
        for skill_id in dict.fromkeys(skill_ids)
    ]


def list_projects(db: Session, domain_id: uuid.UUID) -> list[Project]:
    """Les projets du domaine : ceux dont il est le principal comme ceux dont
    il est secondaire (#203)."""
    return list(
        db.scalars(
            select(Project)
            .where(Project.domain_links.any(ProjectDomain.domain_id == domain_id))
            .order_by(Project.created_at)
            .options(*_FULL_LOAD)
        )
    )


def list_all_projects(db: Session) -> list[Project]:
    """Tous les projets, tous domaines confondus — pour le hub du dashboard.

    Trie par échéance (les plus proches d'abord, les sans-échéance en dernier).
    """
    return list(
        db.scalars(
            select(Project)
            .order_by(
                Project.due_at.is_(None),
                Project.due_at,
                Project.created_at,
            )
            .options(*_FULL_LOAD)
        )
    )


def get_project(db: Session, project_id: uuid.UUID) -> Project | None:
    return db.get(Project, project_id, options=_FULL_LOAD)


def domain_links(db: Session, domain_ids: list[uuid.UUID]) -> list[ProjectDomain]:
    """Les liens aux domaines, validés et numérotés dans l'ordre : le premier
    est le principal (#203)."""
    check_domain_ids(domain_ids)
    for domain_id in domain_ids:
        if db.get(Domain, domain_id) is None:
            raise ProjectDomainNotFound(str(domain_id))
    return [
        ProjectDomain(domain_id=domain_id, position=i)
        for i, domain_id in enumerate(domain_ids)
    ]


def create_project(
    db: Session, domain_id: uuid.UUID, payload: ProjectCreate
) -> Project:
    """Un projet neuf dans ce domaine, le principal, et ses domaines
    secondaires s'il en a."""
    domain_ids = [domain_id, *payload.secondary_domain_ids]
    links = domain_links(db, domain_ids)
    skills = _resolve_skills(db, domain_ids, payload.skill_ids)
    project = Project(
        **payload.model_dump(exclude={"skill_ids", "secondary_domain_ids"})
    )
    project.domain_links = links
    project.skills = skills
    if project.status == ProjectStatus.achieved:
        project.achieved_at = datetime.now(UTC)
    db.add(project)
    # Comme `PUT …/skills` : s'engager sur un savoir lui prépare un cycle.
    plan_use_cases.link_skills(db, project, [], skills)
    db.commit()
    db.refresh(project)
    return project


def project_counters(project: Project) -> list[DomainCounter]:
    """Les compteurs du projet (#194) : ceux du domaine, restreints à ses
    activités liées — les règles de comptage d'un Total. Sans ceux qu'un de
    ses Totaux porte déjà : son unité, ou les heures pour un Total à la
    durée."""
    carried = {
        total.unit_id if total.mode is TotalMode.value else None
        for total in project.totals
        if total.mode is not TotalMode.count
    }
    return [
        counter
        for counter in counters_of(project.activities)
        if (counter.unit.id if counter.unit else None) not in carried
    ]


def update_project(db: Session, project: Project, payload: ProjectUpdate) -> Project:
    data = payload.model_dump(exclude_unset=True)
    old_period = (project.start_at, project.due_at)
    # Bascule de statut : on gère achieved_at côté serveur, et la fin
    # constatée (#196) — posée par une clôture à la main, effacée à la reprise.
    if "status" in data and data["status"] != project.status:
        project.achieved_at = (
            datetime.now(UTC) if data["status"] == ProjectStatus.achieved else None
        )
        project.ended_at = (
            date.today()
            if data["status"] in (ProjectStatus.achieved, ProjectStatus.abandoned)
            else None
        )
    for field, value in data.items():
        setattr(project, field, value)
    # Les étapes suivent la période : raccourcies, ou sans dates si elle les
    # recouvre (cf. `sophia.domain.period`).
    if (project.start_at, project.due_at) != old_period:
        for step in project.steps:
            step.start_at, step.due_at = clip_step(
                step.start_at, step.due_at, project.start_at, project.due_at
            )
    db.commit()
    # Abandonner ne supprime rien (#37, modifie #32), et rien ne se réajuste :
    # ni la période, ni la réouverture ne touchent aux activités posées. La
    # planification en tient compte pour les jours qu'elle n'a pas encore posés.
    # Seul effet immédiat : un lien préservé passe sa planification au domaine.
    if "status" in data:
        planning_use_cases.hand_over(
            db, {link.activity_type_id for link in project.activity_types}
        )
    db.refresh(project)
    return project


def set_project_skills(
    db: Session, project: Project, skill_ids: list[uuid.UUID]
) -> Project:
    relink_skills(db, project, skill_ids)
    db.commit()
    db.refresh(project)
    return project


def relink_skills(db: Session, project: Project, skill_ids: list[uuid.UUID]) -> None:
    """Le lien aux savoirs, remplacé, sans valider la transaction : partagé
    par `PUT …/skills` et par un domaine qui quitte le projet (#203)."""
    before = list(project.skills)
    project.skills = _resolve_skills(db, project.domain_ids, skill_ids)
    # Ce qu'on retire du projet, les étapes cessent de le distribuer —
    # sinon l'union des compétences effectives le ressusciterait. Cf.
    # `Project.undistribute_skill`.
    kept = {skill.id for skill in project.skills}
    for skill in before:
        if skill.id not in kept:
            project.undistribute_skill(skill.id)
    # S'engager sur une compétence lui prépare un cycle ; s'en délier remporte le
    # brouillon vide. Le détail de la règle vit dans `plans`.
    plan_use_cases.link_skills(db, project, before, project.skills)
    # Un savoir lié naît hors séquence ; un savoir délié quitte la sienne.
    sequence_use_cases.normalize_sequence(db, project)


def _discard_posed(db: Session, project: Project) -> None:
    """Ce que les liens d'un projet ont posé et que rien n'a touché depuis.

    Une occurrence **générée** (elle a une activité type), à venir (aujourd'hui
    compris), qui ne compte que pour ce projet, et qu'on n'a pas touchée :
    ni faite, ni notée, sans valeur déclarée ni relevé. Le reste a une vie
    propre et reste au calendrier.
    """
    upcoming = db.scalars(
        select(Activity).where(
            Activity.activity_type_id.is_not(None),
            Activity.start_at >= datetime.combine(date.today(), time.min),
            Activity.done.is_(False),
            Activity.project_links.any(ActivityProject.project_id == project.id),
        )
    )
    for activity in upcoming:
        if (
            all(link.project_id == project.id for link in activity.project_links)
            and not (activity.notes or "").strip()
            and not activity.values
            and not activity.metric_values
        ):
            db.delete(activity)


def delete_project(db: Session, project: Project, discard_posed: bool = False) -> None:
    """Supprimer un projet (design #32, modifié par #37).

    Partent avec lui : ses objectifs, leurs précisions et ses étapes (cascade),
    et les **liens** de ses activités. Les activités, elles, restent toutes —
    passées comme à venir, générées comme manuelles — avec leurs autres
    projets. Activités types, savoirs, métriques, relevés et unités appartiennent au
    domaine : ils restent.

    Ses savoirs sont d'abord déliés par le chemin de `PUT …/skills` : les
    brouillons vierges que ses liens avaient préparés partent avec eux.

    `discard_posed` sert l'abandon d'une création : ce que ses liens ont posé
    au calendrier, et que rien n'a touché, part aussi (cf. `_discard_posed`).
    """
    if project.skills:
        set_project_skills(db, project, [])
    if discard_posed:
        _discard_posed(db, project)
    db.delete(project)
    db.commit()


# --- Étapes -----------------------------------------------------------------


def set_step_metric(
    db: Session, step: ProjectStep, metric_id: uuid.UUID, target: float | None
) -> StepMetric:
    """Distribue un résultat à une étape. Upsert : le reposer corrige le palier.

    Le résultat doit **déjà être visé par le projet** — une étape distribue, elle
    ne déclare pas.
    """
    if not any(link.metric_id == metric_id for link in step.project.metrics):
        raise StepConditionNotDeclared
    link = next((m for m in step.metrics if m.metric_id == metric_id), None)
    if link is None:
        link = StepMetric(step_id=step.id, metric_id=metric_id)
        db.add(link)
    link.target = target
    db.commit()
    db.refresh(step)
    return link


# --- Totaux -------------------------------------------------------------------


def _check_total(mode: TotalMode, unit_id: uuid.UUID | None) -> None:
    """Une unité en mode valeur, et seulement là."""
    if (mode is TotalMode.value) != (unit_id is not None):
        raise TotalUnitMismatch


def _resolve_total_types(
    db: Session, project: Project, type_ids: list[uuid.UUID]
) -> list[ActivityType]:
    """Les activités types que compte un Total — liées au projet au passage.

    Le « sur » ne propose que les activités types du projet ; une activité
    type encore absente y est liée en planification Manuelle (rien n'est
    généré) plutôt que refusée : choisir ce qu'on compte, c'est dire que ça
    compte pour le projet.
    """
    types: list[ActivityType] = []
    for type_id in dict.fromkeys(type_ids):
        activity_type = db.get(ActivityType, type_id)
        if activity_type is None or activity_type.domain_id not in project.domain_ids:
            raise ActivityTypeDomainMismatch
        linked = {link.activity_type_id for link in project.activity_types}
        if type_id not in linked:
            project.activity_types.append(
                ProjectActivityType(
                    activity_type=activity_type, planning=Planning.manual
                )
            )
        types.append(activity_type)
    return types


def get_total(db: Session, total_id: uuid.UUID) -> ProjectTotal | None:
    return db.get(ProjectTotal, total_id)


def create_total(db: Session, project: Project, payload: TotalCreate) -> ProjectTotal:
    """Déclare un Total, en fin de liste."""
    _check_total(payload.mode, payload.unit_id)
    types = _resolve_total_types(db, project, payload.activity_type_ids)
    total = ProjectTotal(
        project_id=project.id,
        mode=payload.mode,
        unit_id=payload.unit_id,
        target=payload.target,
        learning_sessions=payload.learning_sessions,
        position=1 + max((t.position for t in project.totals), default=-1),
    )
    total.activity_types = types
    db.add(total)
    db.commit()
    db.refresh(total)
    return total


def update_total(
    db: Session, total: ProjectTotal, payload: TotalUpdate
) -> ProjectTotal:
    """Modifie un Total — vérifié sur l'état résultant.

    Changer de mode ne convertit pas les tranches d'étape : ce sont des
    nombres, que l'écran montre dans la nouvelle mesure et qu'on corrige.
    """
    data = payload.model_dump(exclude_unset=True)
    mode = data.get("mode", total.mode)
    # Quitter le mode valeur retire l'unité d'office : elle n'y a plus de sens.
    unit_id = data.get("unit_id", total.unit_id if mode is TotalMode.value else None)
    _check_total(mode, unit_id)
    # Baisser la cible ne la fait pas passer sous ses tranches : même règle
    # que `set_step_total`, vue de l'autre bout.
    target = data.get("target") or total.target
    if sum(share.target for share in total.steps) > target:
        raise StepTargetsExceedProject
    if "activity_type_ids" in data:
        total.activity_types = _resolve_total_types(
            db, total.project, data["activity_type_ids"]
        )
    if data.get("learning_sessions") is not None:
        total.learning_sessions = data["learning_sessions"]
    total.mode = mode
    total.unit_id = unit_id
    if "target" in data:
        total.target = data["target"]
    # Le mot du Total (#58) : une saisie vide vaut `null`. Quitter le mode
    # « au nombre » l'efface d'office, comme l'unité quand on quitte la valeur.
    for field in ("count_name", "count_plural", "count_emoji"):
        if field in data:
            setattr(total, field, (data[field] or "").strip() or None)
    if mode is not TotalMode.count or total.count_name is None:
        total.count_name = total.count_plural = None
        if mode is not TotalMode.count:
            total.count_emoji = None
    db.commit()
    db.refresh(total)
    return total


def delete_total(db: Session, total: ProjectTotal) -> None:
    """Supprime le Total ; ses tranches d'étape partent avec lui."""
    db.delete(total)
    db.commit()


def set_step_total(
    db: Session, step: ProjectStep, total_id: uuid.UUID, target: float
) -> StepTotal:
    """Confie à l'étape une tranche d'un Total. Upsert : la reposer la corrige.

    Le Total doit être celui du projet de l'étape — une étape distribue,
    elle ne déclare pas. Et la somme des tranches ne dépasse pas sa cible : en
    dessous c'est normal (une étape sans tranche porte quand même des activités
    qui comptent), au-dessus ce serait promettre plus que la cible entière.
    """
    total = next((t for t in step.project.totals if t.id == total_id), None)
    if total is None:
        raise StepConditionNotDeclared
    others = sum(share.target for share in total.steps if share.step_id != step.id)
    if others + target > total.target:
        raise StepTargetsExceedProject
    share = next((s for s in step.totals if s.total_id == total_id), None)
    if share is None:
        share = StepTotal(step_id=step.id, total_id=total_id)
        db.add(share)
    share.target = target
    db.commit()
    db.refresh(step)
    return share


def unset_step_total(db: Session, step: ProjectStep, total_id: uuid.UUID) -> bool:
    """Retire la tranche. Le Total reste une condition du projet : c'est sa
    place dans le plan qu'on défait."""
    share = next((s for s in step.totals if s.total_id == total_id), None)
    if share is None:
        return False
    db.delete(share)
    db.commit()
    return True


def unset_step_metric(db: Session, step: ProjectStep, metric_id: uuid.UUID) -> bool:
    """Retire la distribution. Le résultat reste visé par le projet : c'est sa
    place dans le plan qu'on défait, pas la condition."""
    link = next((m for m in step.metrics if m.metric_id == metric_id), None)
    if link is None:
        return False
    db.delete(link)
    db.commit()
    return True


def get_achievement(
    db: Session, achievement_id: uuid.UUID
) -> ProjectAchievement | None:
    return db.get(ProjectAchievement, achievement_id)


def create_achievement(
    db: Session, project: Project, payload: AchievementCreate
) -> ProjectAchievement:
    """Déclare une réalisation. Elle naît **non faite** : on décrit ce qu'on
    s'engage à accomplir, on ne constate pas."""
    achievement = ProjectAchievement(
        project_id=project.id,
        title=payload.title,
        emoji=payload.emoji,
    )
    db.add(achievement)
    db.commit()
    db.refresh(achievement)
    return achievement


def update_achievement(
    db: Session, achievement: ProjectAchievement, payload: AchievementUpdate
) -> ProjectAchievement:
    """Renomme, ou coche. La coche est le geste courant — et le seul qui change
    le statut du projet, sans qu'il y ait rien de plus à écrire."""
    data = payload.model_dump(exclude_unset=True)
    # Distribuer, c'est désigner une étape DE CE PROJET : une réalisation ne
    # peut pas atterrir dans le plan d'un autre.
    if data.get("step_id") is not None and not any(
        step.id == data["step_id"] for step in achievement.project.steps
    ):
        raise StepConditionNotDeclared
    # La coche date la réalisation ; la décoche l'efface.
    if "done" in data and data["done"] != achievement.done:
        achievement.done_at = datetime.now(UTC) if data["done"] else None
    for field, value in data.items():
        setattr(achievement, field, value)
    db.commit()
    db.refresh(achievement)
    return achievement


def delete_achievement(db: Session, achievement: ProjectAchievement) -> None:
    db.delete(achievement)
    db.commit()


def get_step(db: Session, step_id: uuid.UUID) -> ProjectStep | None:
    return db.get(ProjectStep, step_id)


def _check_step_skills(
    project: Project, skills: list[Skill], step: ProjectStep | None = None
) -> None:
    """Une étape ne distribue que des compétences déjà visées par le projet,
    et qu'aucune **autre** étape ne porte.

    Un savoir n'a qu'une place dans la séquence (design #27) : l'étape est une
    coupe, pas une seconde saisie. `set_sequence` le tenait déjà ; cette route-ci
    laissait passer un savoir déjà rangé ailleurs, et la séquence le comptait
    alors deux fois.
    """
    declared = {skill.id for skill in project.skills}
    if any(skill.id not in declared for skill in skills):
        raise StepConditionNotDeclared
    elsewhere = {
        skill.id
        for other in project.steps
        if other is not step
        for skill in other.skills
    }
    if any(skill.id in elsewhere for skill in skills):
        raise SequenceMismatch(str(project.id))


def _place_step(step: ProjectStep, project: Project, others: list[ProjectStep]) -> None:
    """Une plage posée ne bloque rien : les voisines se replient, la période
    du projet s'élargit si besoin (cf. `sophia.domain.period`). Sans ses
    deux dates, l'étape ne se lit pas comme une plage : rien ne bouge."""
    if step.start_at is None or step.due_at is None:
        return
    changed, project.start_at, project.due_at = place_step(
        step.order,
        step.start_at,
        step.due_at,
        [Neighbor(s, s.order, s.start_at, s.due_at) for s in others],
        project.start_at,
        project.due_at,
    )
    for other, (start, due) in changed.items():
        other.start_at, other.due_at = start, due


def create_step(
    db: Session, project: Project, payload: ProjectStepCreate
) -> ProjectStep:
    """Ajoute une étape en fin de liste. Les compétences liées, si fournies,
    doivent être membres du domaine du projet."""
    skills = _resolve_skills(db, project.domain_ids, payload.skill_ids)
    _check_step_skills(project, skills)
    next_order = 1 + max((step.order for step in project.steps), default=0)
    # La première étape découpe une séquence qui existait à plat : elle la
    # reprend entière, rangs compris. Les suivantes naissent vides.
    if not project.steps:
        ranked = sequence_use_cases.ranked_skills(db, project)
        skills = ranked + [s for s in skills if s not in ranked]
    step = ProjectStep(
        project_id=project.id,
        title=payload.title,
        description=payload.description,
        order=next_order,
        start_at=payload.start_at,
        due_at=payload.due_at,
    )
    # Née avec une plage, elle se pose comme une plage déplacée : mêmes
    # voisines repliées, même période élargie.
    _place_step(step, project, list(project.steps))
    step.skills = skills
    db.add(step)
    sequence_use_cases.normalize_sequence(db, project)
    db.commit()
    db.refresh(step)
    return step


def update_step(
    db: Session, step: ProjectStep, payload: ProjectStepUpdate
) -> ProjectStep:
    data = payload.model_dump(exclude_unset=True)
    # `done` (API) → coche manuelle stockée ; `done` du modèle est dérivé.
    if "done" in data:
        step.done_manual = data.pop("done")
    dates_moved = "start_at" in data or "due_at" in data
    for field, value in data.items():
        setattr(step, field, value)
    if dates_moved:
        project = step.project
        _place_step(step, project, [s for s in project.steps if s.id != step.id])
    db.commit()
    db.refresh(step)
    return step


def set_step_skills(
    db: Session, step: ProjectStep, skill_ids: list[uuid.UUID]
) -> ProjectStep:
    skills = _resolve_skills(db, step.project.domain_ids, skill_ids)
    _check_step_skills(step.project, skills, step)
    step.skills = skills
    sequence_use_cases.normalize_sequence(db, step.project)
    db.commit()
    db.refresh(step)
    return step


def delete_step(db: Session, step: ProjectStep) -> None:
    project = step.project
    db.delete(step)
    # Parmi d'autres étapes, ses savoirs repassent hors séquence ; la dernière
    # supprimée rend sa séquence à plat.
    sequence_use_cases.normalize_sequence(db, project)
    db.commit()


def reorder_steps(db: Session, project: Project, step_ids: list[uuid.UUID]) -> Project:
    """Réordonne les étapes selon `step_ids` (permutation complète attendue).

    Assigne `order` = position (1-indexé). Lève `StepsReorderMismatch` si la liste
    ne correspond pas exactement, en ids, aux étapes du projet.
    """
    steps_by_id = {step.id: step for step in project.steps}
    if set(step_ids) != set(steps_by_id) or len(step_ids) != len(steps_by_id):
        raise StepsReorderMismatch(str(project.id))
    for position, step_id in enumerate(step_ids, start=1):
        steps_by_id[step_id].order = position
    # Les coupes changent d'ordre : les rangs suivent.
    sequence_use_cases.normalize_sequence(db, project)
    db.commit()
    db.refresh(project)
    return project
