"""Endpoints REST des activités (V2 — Exécution).

Création à plat (le domaine est dans le corps, avec les projets liés et leur
étape, et les actes d'apprentissage, tous optionnels). Liste filtrable par
domaine, projet, étape, savoir et/ou fenêtre temporelle. Les actes d'une
activité existante s'ajoutent et se retirent un à un (#82). Une sélection se
déplace et se supprime en une fois (`/activities/move`, `/activities/delete`).
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, status

from sophia.api.deps import DbSession
from sophia.application import activities as use_cases
from sophia.application import acts as act_use_cases
from sophia.application import domains as domain_use_cases
from sophia.application.schemas.activity import (
    ActivitiesDeleteSet,
    ActivitiesMoveSet,
    ActivityAchievementSet,
    ActivityActFeedbackSet,
    ActivityActSet,
    ActivityCreate,
    ActivityMergeSet,
    ActivityRead,
    ActivityUpdate,
)
from sophia.domain.activity import AchievementNotLinked, ActNotFound
from sophia.infrastructure.models import Activity

router = APIRouter(tags=["activities"])

# Refus propres à ce use case → 422, avec leur message (les autres erreurs
# d'activité passent par le gestionnaire commun de `main.py`).
_REFUSALS: dict[type[Exception], str] = {
    use_cases.ActivityTypeDomainMismatch: (
        "L'activité type doit appartenir au même domaine que l'activité."
    ),
    use_cases.DurationValueUnit: (
        "Une durée ne se déclare pas : elle se lit sur l'activité."
    ),
}


def _refused(exc: Exception) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, _REFUSALS[type(exc)])


def _get_activity_or_404(db: DbSession, activity_id: uuid.UUID) -> Activity:
    activity = use_cases.get_activity(db, activity_id)
    if activity is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Activité introuvable")
    return activity


@router.get(
    "/activities",
    response_model=list[ActivityRead],
    operation_id="listActivities",
)
def list_activities(
    db: DbSession,
    domain_id: uuid.UUID | None = None,
    step_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    skill_id: uuid.UUID | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
    recall_pending: bool = False,
) -> list[Activity]:
    return use_cases.list_activities(
        db, domain_id, step_id, project_id, skill_id, start, end, recall_pending
    )


@router.post(
    "/activities",
    response_model=ActivityRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="createActivity",
)
def create_activity(payload: ActivityCreate, db: DbSession) -> Activity:
    if domain_use_cases.get_domain(db, payload.domain_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Domaine introuvable")
    try:
        return use_cases.create_activity(db, payload)
    except (use_cases.ActivityTypeDomainMismatch, use_cases.DurationValueUnit) as exc:
        raise _refused(exc) from exc


def _get_activities_or_404(db: DbSession, ids: list[uuid.UUID]) -> list[Activity]:
    activities = use_cases.get_activities(db, ids)
    if activities is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Activité introuvable")
    return activities


@router.post(
    "/activities/move",
    response_model=list[ActivityRead],
    operation_id="moveActivities",
)
def move_activities(payload: ActivitiesMoveSet, db: DbSession) -> list[Activity]:
    """Déplacer une sélection du même décalage, toutes ou aucune ; une journée
    entière ne bouge que par jour, les relevés suivent la date."""
    activities = _get_activities_or_404(db, payload.ids)
    return use_cases.move_activities(db, activities, payload.days, payload.minutes)


@router.post(
    "/activities/delete",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="deleteActivities",
)
def delete_activities(payload: ActivitiesDeleteSet, db: DbSession) -> None:
    """Supprimer une sélection, toutes ou aucune."""
    use_cases.delete_activities(db, _get_activities_or_404(db, payload.ids))


@router.get(
    "/activities/{activity_id}",
    response_model=ActivityRead,
    operation_id="getActivity",
)
def get_activity(activity_id: uuid.UUID, db: DbSession) -> Activity:
    return _get_activity_or_404(db, activity_id)


@router.patch(
    "/activities/{activity_id}",
    response_model=ActivityRead,
    operation_id="updateActivity",
)
def update_activity(
    activity_id: uuid.UUID, payload: ActivityUpdate, db: DbSession
) -> Activity:
    if (
        payload.domain_id is not None
        and domain_use_cases.get_domain(db, payload.domain_id) is None
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Domaine introuvable")
    activity = _get_activity_or_404(db, activity_id)
    try:
        return use_cases.update_activity(db, activity, payload)
    except (use_cases.ActivityTypeDomainMismatch, use_cases.DurationValueUnit) as exc:
        raise _refused(exc) from exc


@router.delete(
    "/activities/{activity_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="deleteActivity",
)
def delete_activity(activity_id: uuid.UUID, db: DbSession) -> None:
    use_cases.delete_activity(db, _get_activity_or_404(db, activity_id))


@router.post(
    "/activities/{activity_id}/acts",
    response_model=ActivityRead,
    operation_id="addActivityAct",
)
def add_activity_act(
    activity_id: uuid.UUID, payload: ActivityActSet, db: DbSession
) -> Activity:
    """Ajouter un acte d'apprentissage ; celui d'un cycle apporte les projets
    du cycle."""
    return act_use_cases.add_act(db, _get_activity_or_404(db, activity_id), payload)


@router.delete(
    "/activities/{activity_id}/acts/{act_id}",
    response_model=ActivityRead,
    operation_id="removeActivityAct",
)
def remove_activity_act(
    activity_id: uuid.UUID, act_id: uuid.UUID, db: DbSession
) -> Activity:
    """Retirer un acte de l'activité ; ses projets restent."""
    activity = _get_activity_or_404(db, activity_id)
    try:
        return act_use_cases.remove_act(db, activity, act_id)
    except ActNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Acte introuvable") from exc


@router.put(
    "/activities/{activity_id}/acts/{act_id}/feedback",
    response_model=ActivityRead,
    operation_id="setActivityActFeedback",
)
def set_activity_act_feedback(
    activity_id: uuid.UUID,
    act_id: uuid.UUID,
    payload: ActivityActFeedbackSet,
    db: DbSession,
) -> Activity:
    """Donner le retour d'une passe (#139) : niveau 1–5 et note ; un niveau nul
    l'efface."""
    activity = _get_activity_or_404(db, activity_id)
    try:
        return act_use_cases.set_act_feedback(db, activity, act_id, payload)
    except ActNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Acte introuvable") from exc


@router.post(
    "/activities/{activity_id}/postpone",
    response_model=ActivityRead,
    operation_id="postponeActivity",
)
def postpone_activity(activity_id: uuid.UUID, db: DbSession) -> Activity:
    """Reporter une activité non faite d'une semaine (même jour, même heure) ;
    elle garde ses liens, ses actes, ses réalisations, et ses cibles la
    suivent."""
    return use_cases.postpone_activity(db, _get_activity_or_404(db, activity_id))


@router.post(
    "/activities/{activity_id}/unpostpone",
    response_model=ActivityRead,
    operation_id="unpostponeActivity",
)
def unpostpone_activity(activity_id: uuid.UUID, db: DbSession) -> Activity:
    """Annuler un report : l'activité revient une semaine plus tôt, avec ses
    cibles ; à son jour d'origine, elle n'est plus « reportée »."""
    return use_cases.unpostpone_activity(db, _get_activity_or_404(db, activity_id))


@router.post(
    "/activities/{activity_id}/merge",
    response_model=ActivityRead,
    operation_id="mergeActivity",
)
def merge_activity(
    activity_id: uuid.UUID, payload: ActivityMergeSet, db: DbSession
) -> Activity:
    """Fusionner une séance dans celle-ci : ses actes et ses projets y
    passent, elle est supprimée. Même domaine ; refusé si elle porte autre
    chose (cochée, valeurs, relevés, notes, réalisations)."""
    target = _get_activity_or_404(db, activity_id)
    source = _get_activity_or_404(db, payload.source_id)
    return use_cases.merge_activities(db, target, source)


@router.post(
    "/activities/{activity_id}/achievements",
    response_model=ActivityRead,
    operation_id="linkActivityAchievement",
)
def link_activity_achievement(
    activity_id: uuid.UUID, payload: ActivityAchievementSet, db: DbSession
) -> Activity:
    """Lier une réalisation à la séance qui la prépare — d'un projet pour
    lequel la séance compte. Idempotent ; ne coche rien."""
    return use_cases.link_achievement(
        db, _get_activity_or_404(db, activity_id), payload.achievement_id
    )


@router.delete(
    "/activities/{activity_id}/achievements/{achievement_id}",
    response_model=ActivityRead,
    operation_id="unlinkActivityAchievement",
)
def unlink_activity_achievement(
    activity_id: uuid.UUID, achievement_id: uuid.UUID, db: DbSession
) -> Activity:
    """Délier une réalisation de la séance ; la réalisation reste."""
    activity = _get_activity_or_404(db, activity_id)
    try:
        return use_cases.unlink_achievement(db, activity, achievement_id)
    except AchievementNotLinked as exc:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "Réalisation non liée à cette séance"
        ) from exc
