"""Use cases des activités types et de leurs liens aux projets (#37).

Une activité type vit au niveau du domaine ; c'est le projet qui la planifie
(`ProjectActivityType`). Ce qui a été posé au calendrier ne bouge plus seul :
changer, retirer ou supprimer ne touche que ce qui n'est pas encore posé, sauf
« Repartir de zéro », qui le dit.
"""

import uuid
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from sophia.application import planning
from sophia.application.schemas.activity_type import (
    ActivityTypeCreate,
    ActivityTypeUpdate,
    LinkSet,
)
from sophia.domain.project import (
    ActivityTypeDomainMismatch,
    StepConditionNotDeclared,
)
from sophia.infrastructure.models import (
    Activity,
    ActivityProject,
    ActivityType,
    Planning,
    Project,
    ProjectActivityType,
    ProjectActivityTypeStepOff,
)

# --- L'activité type ----------------------------------------------------------


def list_activity_types(
    db: Session, domain_id: uuid.UUID | None = None
) -> list[ActivityType]:
    stmt = select(ActivityType)
    if domain_id is not None:
        stmt = stmt.where(ActivityType.domain_id == domain_id)
    return list(db.scalars(stmt.order_by(ActivityType.created_at)))


def get_activity_type(db: Session, type_id: uuid.UUID) -> ActivityType | None:
    return db.get(ActivityType, type_id)


def create_activity_type(db: Session, payload: ActivityTypeCreate) -> ActivityType:
    activity_type = ActivityType(**payload.model_dump())
    db.add(activity_type)
    db.commit()
    if activity_type.fallback_active:
        planning.catch_up(db, activity_type.id)
    db.refresh(activity_type)
    return activity_type


def update_activity_type(
    db: Session, activity_type: ActivityType, payload: ActivityTypeUpdate
) -> ActivityType:
    """Modifie l'activité type et son repli. Un repli qu'on rallume se met au
    niveau aussitôt ; une planification changée vaut pour les jours pas encore
    posés."""
    data = payload.model_dump(exclude_unset=True)
    switched_on = data.get("fallback_active") and not activity_type.fallback_active
    levels = planning.project_levels(db)
    for key, value in data.items():
        setattr(activity_type, key, value)
    if switched_on:
        activity_type.fallback_posed_until = None
    db.commit()
    if switched_on:
        planning.catch_up(db, activity_type.id, levels)
    db.refresh(activity_type)
    return activity_type


def delete_activity_type(db: Session, activity_type: ActivityType) -> None:
    """Supprime l'activité type : retirée de tous ses liens, projets clos
    compris. Toutes ses occurrences restent, sans type (SET NULL). Les Totaux
    qui la comptaient la perdent ; celui qui ne comptait qu'elle est supprimé."""
    for link in list(activity_type.links):
        _drop_from_totals(db, link.project, activity_type.id)
    db.delete(activity_type)
    db.commit()


# --- Le lien à un projet ----------------------------------------------------


def _drop_from_totals(db: Session, project: Project, type_id: uuid.UUID) -> None:
    """Retire l'activité type du « sur » des Totaux du projet. Un Total qui
    ne comptait qu'elle est supprimé : il ne bascule jamais sur « toutes les
    activités » en silence (remplace le refus `HabitCountedByTotal`)."""
    for total in list(project.totals):
        if type_id not in total.activity_type_ids:
            continue
        total.activity_types = [t for t in total.activity_types if t.id != type_id]
        if total.counts_everything:
            db.delete(total)


def detach_link(db: Session, project: Project, link: ProjectActivityType) -> None:
    """Le lien retiré, sans valider la transaction : ses Totaux la perdent.
    Partagé par `remove_link` et par un domaine qui quitte le projet (#203)."""
    _drop_from_totals(db, project, link.activity_type_id)
    project.activity_types.remove(link)


def _check_steps(project: Project, step_ids: list[uuid.UUID]) -> None:
    own = {step.id for step in project.steps}
    if any(step_id not in own for step_id in step_ids):
        raise StepConditionNotDeclared


def _remove_posed(db: Session, link: ProjectActivityType, from_day: date) -> None:
    """« Repartir de zéro » : ce que ce lien a posé à partir de `from_day`
    quitte le projet, quel que soit son contenu (objectif : la date seule).
    Une occurrence qui garde d'autres projets reste pour eux ; sinon elle
    est supprimée."""
    for activity in db.scalars(
        select(Activity).where(
            Activity.activity_type_id == link.activity_type_id,
            Activity.start_at >= datetime.combine(from_day, time.min),
            Activity.project_links.any(ActivityProject.project_id == link.project_id),
        )
    ):
        activity.project_links = [
            other
            for other in activity.project_links
            if other.project_id != link.project_id
        ]
        if not activity.project_links:
            db.delete(activity)


def set_link(
    db: Session,
    project: Project,
    activity_type: ActivityType,
    payload: LinkSet,
    reset: bool = False,
) -> ProjectActivityType:
    """Planifie l'activité type pour le projet, ou change sa planification.

    - Lien neuf : il se met aussitôt au niveau des autres.
    - Changement, « Conserver l'existant » (défaut) : ce qui est posé reste, la
      nouvelle planification vaut après « posé jusqu'au ».
    - « Repartir de zéro » : ce qui est posé à partir de demain est retiré,
      puis reposé aussitôt avec la nouvelle planification.

    Les créneaux d'apprentissage absents du corps restent ceux du lien ; dans
    tous les cas, ils sont ramenés aux jours de la nouvelle récurrence.
    """
    if activity_type.domain_id not in project.domain_ids:
        raise ActivityTypeDomainMismatch
    _check_steps(project, payload.off_step_ids)
    levels = planning.project_levels(db)
    link = next(
        (
            link
            for link in project.activity_types
            if link.activity_type_id == activity_type.id
        ),
        None,
    )
    if link is None:
        link = ProjectActivityType(activity_type=activity_type)
        project.activity_types.append(link)
    data = payload.model_dump()
    off_step_ids = data.pop("off_step_ids")
    for key, value in data.items():
        setattr(link, key, value)
    # Une étape éteinte est identifiée par sa clé : on garde celles qui restent
    # plutôt que de recréer la même clé avant d'avoir supprimé l'ancienne.
    wanted = set(off_step_ids)
    for off in list(link.steps_off):
        if off.step_id not in wanted:
            link.steps_off.remove(off)
    have = {off.step_id for off in link.steps_off}
    link.steps_off.extend(
        ProjectActivityTypeStepOff(step_id=step_id)
        for step_id in dict.fromkeys(off_step_ids)
        if step_id not in have
    )
    if reset and link.posed_until is not None:
        tomorrow = date.today() + timedelta(days=1)
        _remove_posed(db, link, tomorrow)
        link.posed_until = tomorrow - timedelta(days=1)
    if link.planning is Planning.manual:
        link.posed_until = None
    db.commit()
    if link.planning is not Planning.manual:
        planning.catch_up(db, activity_type.id, levels)
    db.refresh(link)
    return link


def remove_link(
    db: Session,
    project: Project,
    activity_type_id: uuid.UUID,
    then_domain: bool = False,
) -> bool:
    """Retire l'activité type du projet. Ce qui a été posé reste, avec son
    lien (§0) ; le lien cesse de poser. Ses Totaux la perdent (et disparaissent
    s'ils ne comptaient qu'elle). « Continuer dans le domaine » rallume le repli
    avec la planification du lien, au lendemain de ce que le lien a posé : les
    jours déjà posés gardent leur occurrence (bloc ou case du jour), le repli
    n'en ajoute pas une seconde."""
    link = next(
        (
            link
            for link in project.activity_types
            if link.activity_type_id == activity_type_id
        ),
        None,
    )
    if link is None:
        return False
    levels = planning.project_levels(db)
    activity_type = link.activity_type
    if then_domain and link.planning is not Planning.manual:
        activity_type.fallback_active = True
        activity_type.fallback_planning = link.planning
        activity_type.fallback_weekdays = list(link.weekdays)
        activity_type.fallback_posed_until = link.posed_until
    detach_link(db, project, link)
    db.commit()
    if then_domain:
        planning.catch_up(db, activity_type_id, levels)
    return True
