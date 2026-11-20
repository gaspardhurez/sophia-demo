"""Use cases sur les activités (V2 — Exécution).

CRUD + liens aux projets : zéro, un ou plusieurs, chacun avec son étape
optionnelle, posés à la création et jamais réajustés ensuite. Invariants : un
projet lié est du **même domaine** que l'activité, et l'étape d'un lien
appartient au projet de ce lien. Même invariant de domaine sur les savoirs
de ses **actes d'apprentissage** (#82, `application/acts.py`).
"""

import uuid
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from sophia.application import acts as act_use_cases
from sophia.application import plans as plan_use_cases
from sophia.application.schemas.activity import ActivityCreate, ActivityUpdate
from sophia.domain.activity import (
    AchievementNotLinked,
    AchievementProjectNotLinked,
    ActivityError,
    DuplicateValueUnit,
    LinkedAchievementNotFound,
    MergeOtherDomain,
    MergeSourceCarries,
    NotPostponed,
    PostponeDone,
    PostponeUndated,
    ShiftUndated,
    SystemDomainActivity,
    ValueUnitNotFound,
    postponed,
    shifted,
)
from sophia.domain.planning import link_covers
from sophia.infrastructure.models import (
    Activity,
    ActivityAct,
    ActivityProject,
    ActivityType,
    ActivityValue,
    ActKind,
    Domain,
    ProjectAchievement,
    Unit,
)


class ActivityTypeDomainMismatch(ActivityError):
    """L'activité type appartient à un autre domaine que l'activité — à la
    création, ou parce qu'on change le domaine d'une activité typée."""


class DurationValueUnit(ActivityError):
    """Une valeur déclarée dans une unité de durée : la durée se lit sur
    l'activité, elle ne se déclare pas."""


def _resolve_values(db: Session, values: list[dict]) -> list[ActivityValue]:
    """Les valeurs déclarées, validées : une unité qui existe, une seule fois.

    La durée et le nombre ne passent pas par ici : ils se lisent sur
    l'activité — une unité de durée est donc refusée. Plus aucune valeur n'est
    réécrite depuis la durée (24/09/2026) — c'était le rôle de
    `_sync_time_value`, devenu sans objet.
    """
    seen: set[uuid.UUID] = set()
    resolved: list[ActivityValue] = []
    for item in values:
        unit_id = item["unit_id"]
        if unit_id in seen:
            raise DuplicateValueUnit(str(unit_id))
        unit = db.get(Unit, unit_id)
        if unit is None:
            raise ValueUnitNotFound(str(unit_id))
        if unit.seconds_per_unit:
            raise DurationValueUnit(str(unit_id))
        seen.add(unit_id)
        resolved.append(ActivityValue(unit_id=unit_id, value=item["value"]))
    return resolved


def _replace_links(activity: Activity, links: list[ActivityProject]) -> None:
    """Remplace les liens de l'activité, en gardant ceux qui restent.

    Un lien est identifié par (activité, projet) : en recréer un identique
    ferait insérer la même clé avant d'avoir supprimé l'ancienne. On met donc à
    jour l'étape des liens conservés, on retire les autres, on ajoute les neufs.
    """
    wanted = {link.project_id: link for link in links}
    for current in list(activity.project_links):
        if current.project_id in wanted:
            current.step_id = wanted.pop(current.project_id).step_id
        else:
            activity.project_links.remove(current)
    activity.project_links.extend(wanted.values())


def list_activities(
    db: Session,
    domain_id: uuid.UUID | None = None,
    step_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    skill_id: uuid.UUID | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
    recall_pending: bool = False,
) -> list[Activity]:
    """Liste filtrable : par domaine, par étape, par projet, par savoir
    travaillé (un de ses actes), par interro encore à passer (non faite, avec
    un acte d'interro), et/ou fenêtre temporelle (les activités non
    datées sont exclues dès qu'une borne est fournie). Les filtres par
    projet et par étape passent par les liens : une activité liée à deux
    projets sort sous chacun.

    Le filtre par savoir **sans bornes** est ce qui donne l'historique d'une
    compétence : une projection du calendrier, pas un objet à maintenir."""
    # Lire n'écrit plus rien (#37) : les occurrences se posent en préparant
    # (`application.planning`), jamais à la lecture d'une fenêtre.
    query = select(Activity).options(
        selectinload(Activity.domain),
        selectinload(Activity.achievements),
        selectinload(Activity.week_preparation),
    )
    if domain_id is not None:
        query = query.where(Activity.domain_id == domain_id)
    if step_id is not None:
        query = query.where(
            Activity.project_links.any(ActivityProject.step_id == step_id)
        )
    if project_id is not None:
        query = query.where(
            Activity.project_links.any(ActivityProject.project_id == project_id)
        )
    if skill_id is not None:
        query = query.where(Activity.acts.any(ActivityAct.skill_id == skill_id))
    if recall_pending:
        # Bornée à aujourd'hui par l'appelant : les interros en retard, qui
        # remontent en tête de la to-do du jour (#84).
        query = query.where(
            Activity.done.is_(False),
            Activity.acts.any(
                (ActivityAct.kind == ActKind.recall) & ActivityAct.passed_on.is_(None)
            ),
        )
    if start is not None:
        query = query.where(Activity.start_at >= start)
    if end is not None:
        query = query.where(Activity.start_at < end)
    return list(db.scalars(query.order_by(Activity.start_at)))


def _type_links(
    db: Session, type_id: uuid.UUID | None, start_at: datetime | None
) -> list[dict]:
    """Les projets d'une activité type posée **à la main**, à sa création.

    Ceux qui la planifient et la couvrent ce jour-là (ouverts, étape allumée),
    avec l'étape du jour : ce qu'une occurrence de la planification aurait
    reçu, sans exiger que le jour soit l'un des siens. Sans date, aucun. Comme
    pour les actes, rien ne se réajuste ensuite.
    """
    if type_id is None or start_at is None:
        return []
    activity_type = db.get(ActivityType, type_id)
    if activity_type is None:
        return []
    day = start_at.date()
    links = []
    for link in activity_type.links:
        step_id = link_covers(link, day)
        if step_id is not False:
            links.append({"project_id": link.project_id, "step_id": step_id})
    return links


def get_activity(db: Session, activity_id: uuid.UUID) -> Activity | None:
    return db.get(Activity, activity_id)


def _check_type_domain(
    db: Session, domain_id: uuid.UUID, type_id: uuid.UUID | None
) -> None:
    """Une activité typée vit dans le domaine de son activité type."""
    if type_id is None:
        return
    type_domain = db.scalar(
        select(ActivityType.domain_id).where(ActivityType.id == type_id)
    )
    if type_domain is not None and type_domain != domain_id:
        raise ActivityTypeDomainMismatch(str(type_id))


def _is_system(db: Session, domain_id: uuid.UUID) -> bool:
    return bool(db.scalar(select(Domain.system).where(Domain.id == domain_id)))


def create_activity(db: Session, payload: ActivityCreate) -> Activity:
    # Le domaine système ne reçoit rien à la main : l'app y pose seule le
    # rituel de semaine.
    if _is_system(db, payload.domain_id):
        raise SystemDomainActivity(str(payload.domain_id))
    _check_type_domain(db, payload.domain_id, payload.activity_type_id)
    data = payload.model_dump(exclude={"acts"})
    links = data.pop("projects")
    acts = act_use_cases.resolve_acts(db, payload.domain_id, payload.acts)
    # Les projets viennent du geste (le projet du contexte par défaut). Sans
    # geste, une activité type reçoit les projets qui la planifient ce
    # jour-là, chaque acte ceux de son cycle (sinon ceux qui visent son
    # savoir) ; le reste n'en reçoit aucun. Posés une fois, jamais réajustés.
    if links is None:
        links = _type_links(db, payload.activity_type_id, payload.start_at)
        seen = {link["project_id"] for link in links}
        for act in acts:
            for link in act_use_cases.learning_links(
                db, act.skill_id, act.plan_id, payload.start_at
            ):
                if link["project_id"] not in seen:
                    seen.add(link["project_id"])
                    links.append(link)
    # Une séance créée qui porte l'interro d'un cycle la prend : celle qui
    # attendait ailleurs s'y déplace (comme en l'ajoutant à une séance).
    if not payload.done:
        for act in acts:
            if act.kind is ActKind.recall and act.plan_id is not None:
                act_use_cases.move_pending_recall(db, act.plan_id)
    values = data.pop("values")
    activity = Activity(**data)
    activity.project_links = act_use_cases.resolve_links(db, payload.domain_id, links)
    activity.acts = acts
    activity.values = _resolve_values(db, values)
    db.add(activity)
    db.flush()
    plan_use_cases.open_on_completion(db, activity)
    db.commit()
    db.refresh(activity)
    return activity


def update_activity(
    db: Session, activity: Activity, payload: ActivityUpdate
) -> Activity:
    data = payload.model_dump(exclude_unset=True)
    # Le domaine d'une activité typée est celui de son type : le changer est
    # refusé, comme le panneau l'empêche.
    if "domain_id" in data:
        if data["domain_id"] != activity.domain_id and (
            _is_system(db, data["domain_id"]) or _is_system(db, activity.domain_id)
        ):
            raise SystemDomainActivity(str(data["domain_id"]))
        _check_type_domain(db, data["domain_id"], activity.activity_type_id)
    # Les liens se revalident dès que la liste ou le domaine change : changer de
    # domaine avec des projets de l'ancien est refusé, pas délié en silence.
    if "projects" in data or "domain_id" in data:
        new_domain = data.get("domain_id", activity.domain_id)
        links = data.pop("projects", None)
        if links is None:
            links = [
                {"project_id": link.project_id, "step_id": link.step_id}
                for link in activity.project_links
            ]
        _replace_links(activity, act_use_cases.resolve_links(db, new_domain, links))
        # Une réalisation ne se prépare que sur une séance de son projet :
        # retirer le projet la délie, comme le panneau l'annonce.
        activity.achievements = [
            a for a in activity.achievements if a.project_id in activity.project_ids
        ]
    # Les savoirs des actes se revalident sur le nouveau domaine : on refuse,
    # plutôt que de délier en silence ce qu'on a travaillé.
    if "domain_id" in data:
        act_use_cases.check_acts_domain(db, activity, data["domain_id"])
    # Déplacer une séance déplace ce qu'on y a relevé : le squat de 118 a bien
    # été soulevé le jour où la séance a eu lieu. Sans ça, le relevé garderait
    # la date de sa saisie et la courbe raconterait une autre histoire que le
    # calendrier. La date du relevé n'est donc pas un choix indépendant tant
    # qu'une activité le porte — elle ne l'est que pour un relevé libre.
    if "values" in data:
        activity.values = _resolve_values(db, data.pop("values"))
    moved_to = (
        data["start_at"].date()
        if data.get("start_at") is not None
        and activity.start_at is not None
        and data["start_at"].date() != activity.start_at.date()
        else None
    )
    completed = data.get("done") is True and not activity.done
    for field, value in data.items():
        setattr(activity, field, value)
    if moved_to is not None:
        for measure in activity.metric_values:
            measure.measured_at = moved_to
    if completed:
        plan_use_cases.open_on_completion(db, activity)
    db.commit()
    db.refresh(activity)
    return activity


def delete_activity(db: Session, activity: Activity) -> None:
    """Supprime l'activité. Une occurrence générée ne revient pas : son jour est
    déjà derrière « posé jusqu'au » de son lien."""
    db.delete(activity)
    db.commit()


def get_activities(db: Session, ids: list[uuid.UUID]) -> list[Activity] | None:
    """Les activités de `ids` (sans doublon), ou `None` si l'une manque : un
    geste sur une sélection porte sur toute la sélection ou sur rien."""
    wanted = set(ids)
    found = list(db.scalars(select(Activity).where(Activity.id.in_(wanted))))
    return found if len(found) == len(wanted) else None


def move_activities(
    db: Session, activities: list[Activity], days: int, minutes: int
) -> list[Activity]:
    """**Déplacer une sélection** : toutes du même décalage, en une fois — un
    refus n'en déplace aucune. Une journée entière ne bouge que par jour.
    Comme pour une seule (`update_activity`), une activité qui change de jour
    emporte ses relevés ; ses liens et leurs étapes ne se réajustent pas."""
    if any(a.start_at is None for a in activities):
        raise ShiftUndated()
    for activity in activities:
        before = activity.start_at.date()
        activity.start_at, activity.end_at = shifted(
            activity.start_at, activity.end_at, activity.all_day, days, minutes
        )
        if activity.start_at.date() != before:
            for measure in activity.metric_values:
                measure.measured_at = activity.start_at.date()
    db.commit()
    for activity in activities:
        db.refresh(activity)
    return activities


def delete_activities(db: Session, activities: list[Activity]) -> None:
    """Supprimer une sélection, en une fois (cf. `delete_activity`)."""
    for activity in activities:
        db.delete(activity)
    db.commit()


def postpone_activity(db: Session, activity: Activity) -> Activity:
    """**Reporter** une activité non faite d'une semaine : même jour de la
    semaine, même heure (journée entière : même jour).

    Elle garde tout ce qu'elle porte : ses projets et leurs étapes (liens
    explicites, jamais réajustés — même si le nouveau jour tombe dans une
    autre étape), ses actes, ses réalisations, ses valeurs. Ses relevés — des
    cibles, puisqu'elle n'est pas faite — se décalent avec elle. Elle retient
    le jour d'où elle part (`postponed_from`, le premier s'il y a eu plusieurs
    reports) pour que l'écran la dise « reportée »."""
    if activity.done:
        raise PostponeDone(str(activity.id))
    if activity.start_at is None:
        raise PostponeUndated(str(activity.id))
    if activity.postponed_from is None:
        activity.postponed_from = activity.start_at.date()
    activity.start_at, activity.end_at = postponed(activity.start_at, activity.end_at)
    for measure in activity.metric_values:
        measure.measured_at += timedelta(days=7)
    db.commit()
    db.refresh(activity)
    return activity


def unpostpone_activity(db: Session, activity: Activity) -> Activity:
    """**Annuler un report** : l'activité revient une semaine plus tôt, avec
    ses cibles. Revenue à son jour d'origine, elle n'est plus « reportée ».
    Refusé si elle n'est pas reportée, ou faite entre-temps."""
    if activity.postponed_from is None or activity.done or activity.start_at is None:
        raise NotPostponed(str(activity.id))
    activity.start_at, activity.end_at = postponed(
        activity.start_at, activity.end_at, days=-7
    )
    for measure in activity.metric_values:
        measure.measured_at -= timedelta(days=7)
    if activity.start_at.date() <= activity.postponed_from:
        activity.postponed_from = None
    db.commit()
    db.refresh(activity)
    return activity


def merge_activities(db: Session, target: Activity, source: Activity) -> Activity:
    """**Fusionner** `source` dans `target` (déposer une séance sur une autre,
    au calendrier) : ses actes d'apprentissage passent dans `target` (un acte
    qu'elle porte déjà n'est pas doublé), les projets qu'elle sert et que
    `target` ne sert pas aussi (avec leur étape) ; puis `source` est supprimée.

    Seulement deux séances distinctes du même domaine, hors domaine système ;
    refusé si `source` porte autre chose — cochée, valeurs, relevés, notes,
    réalisations — : la fusion le perdrait en silence."""
    if (
        target.id == source.id
        or target.domain_id != source.domain_id
        or _is_system(db, target.domain_id)
    ):
        raise MergeOtherDomain(str(source.id))
    if (
        source.done
        or source.values
        or source.metric_values
        or (source.notes or "").strip()
        or source.achievements
    ):
        raise MergeSourceCarries(str(source.id))
    taken = {act_use_cases.act_key(act) for act in target.acts}
    for act in list(source.acts):
        if act_use_cases.act_key(act) in taken:
            continue
        taken.add(act_use_cases.act_key(act))
        source.acts.remove(act)
        target.acts.append(act)
    served = set(target.project_ids)
    for link in source.project_links:
        if link.project_id not in served:
            served.add(link.project_id)
            target.project_links.append(
                ActivityProject(project_id=link.project_id, step_id=link.step_id)
            )
    db.delete(source)
    db.commit()
    db.refresh(target)
    return target


def link_achievement(
    db: Session, activity: Activity, achievement_id: uuid.UUID
) -> Activity:
    """Lier une **réalisation** à la séance qui la prépare (#92). Une
    réalisation d'un projet pour lequel la séance compte seulement ; lier
    deux fois ne change rien. Lier ne coche rien."""
    achievement = db.get(ProjectAchievement, achievement_id)
    if achievement is None:
        raise LinkedAchievementNotFound(str(achievement_id))
    if achievement.project_id not in activity.project_ids:
        raise AchievementProjectNotLinked(str(achievement_id))
    if achievement not in activity.achievements:
        activity.achievements.append(achievement)
    db.commit()
    db.refresh(activity)
    return activity


def unlink_achievement(
    db: Session, activity: Activity, achievement_id: uuid.UUID
) -> Activity:
    """Délier une réalisation de la séance ; la réalisation reste."""
    achievement = next(
        (a for a in activity.achievements if a.id == achievement_id), None
    )
    if achievement is None:
        raise AchievementNotLinked(str(achievement_id))
    activity.achievements.remove(achievement)
    db.commit()
    db.refresh(activity)
    return activity
