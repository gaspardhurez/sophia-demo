"""Endpoints REST des projets.

Routes nichées sous le domaine pour lister/créer, à plat pour l'unitaire. Le
lien aux compétences a son endpoint dédié `set` (remplace l'ensemble) ; le PATCH
ne touche qu'aux champs scalaires.
"""

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.orm import Session

from sophia.api.deps import DbSession
from sophia.application import activity_types as type_use_cases
from sophia.application import domains as domain_use_cases
from sophia.application import project_domains as project_domain_use_cases
from sophia.application import projects as use_cases
from sophia.application import sequence as sequence_use_cases
from sophia.application.schemas.activity_type import LinkSet
from sophia.application.schemas.domain import DomainCounter
from sophia.application.schemas.project import (
    AchievementCreate,
    AchievementRead,
    AchievementUpdate,
    ProjectCreate,
    ProjectDomainsSet,
    ProjectDomainTies,
    ProjectRead,
    ProjectSkillsSet,
    ProjectStepCreate,
    ProjectStepUpdate,
    ProjectUpdate,
    SequenceWrite,
    StepMetricSet,
    StepSkillsSet,
    StepsReorder,
    StepTotalSet,
    TotalCreate,
    TotalUpdate,
)
from sophia.infrastructure.models import (
    Project,
    ProjectAchievement,
    ProjectStep,
    ProjectTotal,
    Unit,
)

router = APIRouter(tags=["projects"])


def _domain_or_404(db: Session, domain_id: uuid.UUID) -> None:
    if domain_use_cases.get_domain(db, domain_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Domaine introuvable")


def _get_project_or_404(db: Session, project_id: uuid.UUID) -> Project:
    project = use_cases.get_project(db, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Projet introuvable")
    return project


def _get_step_or_404(db: Session, step_id: uuid.UUID) -> ProjectStep:
    step = use_cases.get_step(db, step_id)
    if step is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Étape introuvable")
    return step


@router.get(
    "/domains/{domain_id}/projects",
    response_model=list[ProjectRead],
    operation_id="listProjects",
)
def list_projects(domain_id: uuid.UUID, db: DbSession) -> list[Project]:
    _domain_or_404(db, domain_id)
    return use_cases.list_projects(db, domain_id)


@router.post(
    "/domains/{domain_id}/projects",
    response_model=ProjectRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="createProject",
)
def create_project(
    domain_id: uuid.UUID, payload: ProjectCreate, db: DbSession
) -> Project:
    _domain_or_404(db, domain_id)
    return use_cases.create_project(db, domain_id, payload)


@router.get(
    "/projects",
    response_model=list[ProjectRead],
    operation_id="listAllProjects",
)
def list_all_projects(db: DbSession) -> list[Project]:
    return use_cases.list_all_projects(db)


@router.get(
    "/projects/{project_id}",
    response_model=ProjectRead,
    operation_id="getProject",
)
def get_project(project_id: uuid.UUID, db: DbSession) -> Project:
    return _get_project_or_404(db, project_id)


@router.get(
    "/projects/{project_id}/counters",
    response_model=list[DomainCounter],
    operation_id="listProjectCounters",
)
def list_project_counters(project_id: uuid.UUID, db: DbSession) -> list[DomainCounter]:
    """Ce qui a été fait pour le projet, hors ce que ses Totaux comptent."""
    return use_cases.project_counters(_get_project_or_404(db, project_id))


@router.patch(
    "/projects/{project_id}",
    response_model=ProjectRead,
    operation_id="updateProject",
)
def update_project(
    project_id: uuid.UUID, payload: ProjectUpdate, db: DbSession
) -> Project:
    project = _get_project_or_404(db, project_id)
    # Une seule borne envoyée se compare à celle qui reste en place : le
    # schéma ne voit que le corps.
    start = payload.start_at or project.start_at
    due = payload.due_at if "due_at" in payload.model_fields_set else project.due_at
    if due is not None and start > due:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Le début doit précéder la fin"
        )
    return use_cases.update_project(db, project, payload)


@router.put(
    "/projects/{project_id}/domains",
    response_model=ProjectRead,
    operation_id="setProjectDomains",
)
def set_project_domains(
    project_id: uuid.UUID, payload: ProjectDomainsSet, db: DbSession
) -> Project:
    """Ses domaines, dans l'ordre : le premier est le principal (#203). Un
    domaine retiré délie ce qui en venait (`…/domains/{id}/ties`)."""
    project = _get_project_or_404(db, project_id)
    return project_domain_use_cases.set_project_domains(db, project, payload.domain_ids)


@router.get(
    "/projects/{project_id}/domains/{domain_id}/ties",
    response_model=ProjectDomainTies,
    operation_id="getProjectDomainTies",
)
def get_project_domain_ties(
    project_id: uuid.UUID, domain_id: uuid.UUID, db: DbSession
) -> ProjectDomainTies:
    """Ce que le projet perdrait si ce domaine le quittait — la confirmation
    l'énumère avant de le retirer."""
    project = _get_project_or_404(db, project_id)
    return project_domain_use_cases.domain_ties(db, project, domain_id)


@router.put(
    "/projects/{project_id}/skills",
    response_model=ProjectRead,
    operation_id="setProjectSkills",
)
def set_project_skills(
    project_id: uuid.UUID, payload: ProjectSkillsSet, db: DbSession
) -> Project:
    return use_cases.set_project_skills(
        db, _get_project_or_404(db, project_id), payload.skill_ids
    )


@router.delete(
    "/projects/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="deleteProject",
)
def delete_project(
    project_id: uuid.UUID, db: DbSession, discard_posed: bool = False
) -> None:
    """`discard_posed` : l'abandon d'une création retire aussi ce que ses liens
    ont posé au calendrier sans qu'on y touche. Sans lui, rien ne part."""
    use_cases.delete_project(
        db, _get_project_or_404(db, project_id), discard_posed=discard_posed
    )


# --- Étapes -----------------------------------------------------------------
# Les mutations d'étape renvoient le projet parent complet : le front tient une
# seule ressource à jour (steps + compétences effectives) sans aller-retour.


@router.post(
    "/projects/{project_id}/steps",
    response_model=ProjectRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="createProjectStep",
)
def create_step(
    project_id: uuid.UUID, payload: ProjectStepCreate, db: DbSession
) -> Project:
    project = _get_project_or_404(db, project_id)
    use_cases.create_step(db, project, payload)
    return _get_project_or_404(db, project_id)


@router.put(
    "/projects/{project_id}/steps/order",
    response_model=ProjectRead,
    operation_id="reorderProjectSteps",
)
def reorder_steps(
    project_id: uuid.UUID, payload: StepsReorder, db: DbSession
) -> Project:
    project = _get_project_or_404(db, project_id)
    use_cases.reorder_steps(db, project, payload.step_ids)
    return _get_project_or_404(db, project_id)


@router.put(
    "/projects/{project_id}/sequence",
    response_model=ProjectRead,
    operation_id="setProjectSequence",
)
def set_sequence(
    project_id: uuid.UUID, payload: SequenceWrite, db: DbSession
) -> Project:
    """La séquence d'acquisition, d'un bloc (cf. `application.sequence`)."""
    project = _get_project_or_404(db, project_id)
    sequence_use_cases.set_sequence(db, project, payload.segments)
    return _get_project_or_404(db, project_id)


@router.patch(
    "/steps/{step_id}",
    response_model=ProjectRead,
    operation_id="updateProjectStep",
)
def update_step(
    step_id: uuid.UUID, payload: ProjectStepUpdate, db: DbSession
) -> Project:
    step = _get_step_or_404(db, step_id)
    # Comme pour le projet : une seule borne envoyée se compare à l'autre,
    # restée en place.
    sent = payload.model_fields_set
    start = payload.start_at if "start_at" in sent else step.start_at
    due = payload.due_at if "due_at" in sent else step.due_at
    if start is not None and due is not None and start > due:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Le début doit précéder la fin"
        )
    use_cases.update_step(db, step, payload)
    return _get_project_or_404(db, step.project_id)


@router.put(
    "/steps/{step_id}/skills",
    response_model=ProjectRead,
    operation_id="setProjectStepSkills",
)
def set_step_skills(
    step_id: uuid.UUID, payload: StepSkillsSet, db: DbSession
) -> Project:
    step = _get_step_or_404(db, step_id)
    use_cases.set_step_skills(db, step, payload.skill_ids)
    return _get_project_or_404(db, step.project_id)


@router.delete(
    "/steps/{step_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="deleteProjectStep",
)
def delete_step(step_id: uuid.UUID, db: DbSession) -> None:
    use_cases.delete_step(db, _get_step_or_404(db, step_id))


# --- Réalisations : l'axe qualitatif du tracking ---------------------------


def _get_achievement_or_404(
    db: DbSession, achievement_id: uuid.UUID
) -> ProjectAchievement:
    achievement = use_cases.get_achievement(db, achievement_id)
    if achievement is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Réalisation introuvable")
    return achievement


@router.post(
    "/projects/{project_id}/achievements",
    response_model=AchievementRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="createAchievement",
)
def create_achievement(
    project_id: uuid.UUID, payload: AchievementCreate, db: DbSession
) -> ProjectAchievement:
    """Niché sous le projet : une réalisation n'existe que pour lui, là où un
    résultat visé pointe une métrique du domaine qui lui survit."""
    return use_cases.create_achievement(
        db, _get_project_or_404(db, project_id), payload
    )


@router.patch(
    "/achievements/{achievement_id}",
    response_model=AchievementRead,
    operation_id="updateAchievement",
)
def update_achievement(
    achievement_id: uuid.UUID, payload: AchievementUpdate, db: DbSession
) -> ProjectAchievement:
    """À plat, comme tout l'unitaire : cocher est le geste courant, et il n'a
    pas besoin de rappeler à quel projet la réalisation appartient."""
    return use_cases.update_achievement(
        db, _get_achievement_or_404(db, achievement_id), payload
    )


@router.delete(
    "/achievements/{achievement_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="deleteAchievement",
)
def delete_achievement(achievement_id: uuid.UUID, db: DbSession) -> None:
    use_cases.delete_achievement(db, _get_achievement_or_404(db, achievement_id))


# --- Activités types planifiées (#37) ---------------------------------------


@router.put(
    "/projects/{project_id}/activity-types/{activity_type_id}",
    response_model=ProjectRead,
    operation_id="setProjectActivityType",
)
def set_project_activity_type(
    project_id: uuid.UUID,
    activity_type_id: uuid.UUID,
    payload: LinkSet,
    db: DbSession,
    reset: bool = False,
) -> Project:
    """Planifie une activité type pour le projet, ou change sa planification.

    `reset` (« Repartir de zéro ») retire ce que le lien a posé à partir de
    demain et le repose ; par défaut (« Conserver l'existant »), ce qui est posé
    reste et la nouvelle planification vaut après « posé jusqu'au ».
    """
    project = _get_project_or_404(db, project_id)
    activity_type = type_use_cases.get_activity_type(db, activity_type_id)
    if activity_type is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Activité type introuvable")
    type_use_cases.set_link(db, project, activity_type, payload, reset)
    db.refresh(project)
    return project


@router.delete(
    "/projects/{project_id}/activity-types/{activity_type_id}",
    response_model=ProjectRead,
    operation_id="removeProjectActivityType",
)
def remove_project_activity_type(
    project_id: uuid.UUID,
    activity_type_id: uuid.UUID,
    db: DbSession,
    then_domain: bool = False,
) -> Project:
    """Retire l'activité type du projet : ce qui est posé reste, les Totaux
    qui ne comptaient qu'elle sont supprimés. `then_domain` (« continuer dans le
    domaine ») rallume son repli avec la planification du lien."""
    project = _get_project_or_404(db, project_id)
    if not type_use_cases.remove_link(db, project, activity_type_id, then_domain):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Activité type non planifiée")
    db.refresh(project)
    return project


# --- Totaux -------------------------------------------------------------------


def _get_total_or_404(db: Session, total_id: uuid.UUID) -> ProjectTotal:
    total = use_cases.get_total(db, total_id)
    if total is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Total introuvable")
    return total


def _refuse_duration_unit(db: Session, unit_id: uuid.UUID | None) -> None:
    """Une unité de durée ne compte pas un Total en valeur : une durée se lit
    au calendrier (Total en durée). L'écran l'exclut du menu ; l'API aussi."""
    unit = db.get(Unit, unit_id) if unit_id is not None else None
    if unit is not None and unit.seconds_per_unit:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Une unité de durée ne compte pas un Total en valeur : une durée se "
            "compte en heures (Total en durée).",
        )


@router.post(
    "/projects/{project_id}/totals",
    response_model=ProjectRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="createTotal",
)
def create_total(project_id: uuid.UUID, payload: TotalCreate, db: DbSession) -> Project:
    project = _get_project_or_404(db, project_id)
    _refuse_duration_unit(db, payload.unit_id)
    use_cases.create_total(db, project, payload)
    db.refresh(project)
    return project


@router.patch(
    "/totals/{total_id}",
    response_model=ProjectRead,
    operation_id="updateTotal",
)
def update_total(total_id: uuid.UUID, payload: TotalUpdate, db: DbSession) -> Project:
    total = _get_total_or_404(db, total_id)
    _refuse_duration_unit(db, payload.unit_id)
    total = use_cases.update_total(db, total, payload)
    return total.project


@router.delete(
    "/totals/{total_id}",
    response_model=ProjectRead,
    operation_id="deleteTotal",
)
def delete_total(total_id: uuid.UUID, db: DbSession) -> Project:
    total = _get_total_or_404(db, total_id)
    project = total.project
    use_cases.delete_total(db, total)
    db.refresh(project)
    return project


@router.put(
    "/steps/{step_id}/totals",
    response_model=ProjectRead,
    operation_id="setStepTotal",
)
def set_step_total(step_id: uuid.UUID, payload: StepTotalSet, db: DbSession) -> Project:
    """Pose ou corrige la tranche d'un Total sur une étape (upsert)."""
    step = _get_step_or_404(db, step_id)
    use_cases.set_step_total(db, step, payload.total_id, payload.target)
    return step.project


@router.delete(
    "/steps/{step_id}/totals/{total_id}",
    response_model=ProjectRead,
    operation_id="unsetStepTotal",
)
def unset_step_total(step_id: uuid.UUID, total_id: uuid.UUID, db: DbSession) -> Project:
    """Retire la tranche — le Total reste une condition du projet."""
    step = _get_step_or_404(db, step_id)
    if not use_cases.unset_step_total(db, step, total_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tranche introuvable")
    return step.project


# --- Distribution d'un résultat à une étape --------------------------------


@router.put(
    "/steps/{step_id}/metrics",
    response_model=ProjectRead,
    operation_id="setStepMetric",
)
def set_step_metric(
    step_id: uuid.UUID, payload: StepMetricSet, db: DbSession
) -> Project:
    """Pose ou corrige le palier d'un résultat sur une étape.

    `PUT` parce que c'est un upsert : distribuer deux fois le même résultat
    corrige son palier, ça ne le duplique pas — même geste que le résultat visé
    au niveau du projet.
    """
    step = _get_step_or_404(db, step_id)
    use_cases.set_step_metric(db, step, payload.metric_id, payload.target)
    return step.project


@router.delete(
    "/steps/{step_id}/metrics/{metric_id}",
    response_model=ProjectRead,
    operation_id="unsetStepMetric",
)
def unset_step_metric(
    step_id: uuid.UUID, metric_id: uuid.UUID, db: DbSession
) -> Project:
    """Retire la distribution — le résultat reste visé par le projet."""
    step = _get_step_or_404(db, step_id)
    if not use_cases.unset_step_metric(db, step, metric_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Résultat non distribué")
    return step.project
