"""Routes du cycle d'acquisition (V4) — prévoir, préparer, commencer, clore,
constater ; la rampe du cycle ; ses ressources."""

import uuid

from fastapi import APIRouter, HTTPException, status

from sophia.api.deps import DbSession
from sophia.application import plans as use_cases
from sophia.application.schemas.plan import (
    PlanComplete,
    PlanCreate,
    PlanItemAdd,
    PlanItemUpdate,
    PlanRampOrder,
    PlanRead,
    PlanResourceOrder,
    PlanResourceUpdate,
    PlanStart,
    PlanUpdate,
    RecallLaunch,
)
from sophia.infrastructure.models import AcquisitionPlan

router = APIRouter(tags=["plans"])


def _get_plan_or_404(db: DbSession, plan_id: uuid.UUID) -> AcquisitionPlan:
    plan = use_cases.get_plan(db, plan_id)
    if plan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan introuvable")
    return plan


@router.get(
    "/skills/{skill_id}/plans",
    response_model=list[PlanRead],
    operation_id="listPlans",
)
def list_plans(skill_id: uuid.UUID, db: DbSession) -> list[AcquisitionPlan]:
    return use_cases.list_plans(db, skill_id)


@router.post(
    "/skills/{skill_id}/plans",
    response_model=PlanRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="createPlan",
)
def create_plan(
    skill_id: uuid.UUID, payload: PlanCreate, db: DbSession
) -> AcquisitionPlan:
    return use_cases.create_plan(db, skill_id, payload)


@router.post(
    "/skills/{skill_id}/plans/start",
    response_model=PlanRead,
    operation_id="startSkill",
)
def start_skill(
    skill_id: uuid.UUID, db: DbSession, payload: PlanStart | None = None
) -> AcquisitionPlan:
    """Commencer un savoir : le cycle du projet donné, sinon le dernier
    prévu, sinon un cycle qui naît ouvert."""
    project_id = payload.project_id if payload else None
    return use_cases.start_skill(db, skill_id, project_id)


@router.patch("/plans/{plan_id}", response_model=PlanRead, operation_id="updatePlan")
def update_plan(
    plan_id: uuid.UUID, payload: PlanUpdate, db: DbSession
) -> AcquisitionPlan:
    return use_cases.update_plan(db, _get_plan_or_404(db, plan_id), payload)


@router.post("/plans/{plan_id}/open", response_model=PlanRead, operation_id="openPlan")
def open_plan(plan_id: uuid.UUID, db: DbSession) -> AcquisitionPlan:
    return use_cases.open_plan(db, _get_plan_or_404(db, plan_id))


@router.post(
    "/plans/{plan_id}/complete", response_model=PlanRead, operation_id="completePlan"
)
def complete_plan(
    plan_id: uuid.UUID, db: DbSession, payload: PlanComplete | None = None
) -> AcquisitionPlan:
    return use_cases.complete_plan(db, _get_plan_or_404(db, plan_id), payload)


@router.post(
    "/plans/{plan_id}/abandon", response_model=PlanRead, operation_id="abandonPlan"
)
def abandon_plan(plan_id: uuid.UUID, db: DbSession) -> AcquisitionPlan:
    return use_cases.abandon_plan(db, _get_plan_or_404(db, plan_id))


@router.post(
    "/plans/{plan_id}/reopen", response_model=PlanRead, operation_id="reopenPlan"
)
def reopen_plan(plan_id: uuid.UUID, db: DbSession) -> AcquisitionPlan:
    return use_cases.reopen_plan(db, _get_plan_or_404(db, plan_id))


@router.post(
    "/plans/{plan_id}/unstart", response_model=PlanRead, operation_id="unstartPlan"
)
def unstart_plan(plan_id: uuid.UUID, db: DbSession) -> AcquisitionPlan:
    """Annuler le démarrage : le cycle en cours redevient prévu."""
    return use_cases.unstart_plan(db, _get_plan_or_404(db, plan_id))


@router.post(
    "/plans/{plan_id}/recall/launch",
    response_model=PlanRead,
    operation_id="launchRecall",
)
def launch_recall(
    plan_id: uuid.UUID, body: RecallLaunch, db: DbSession
) -> AcquisitionPlan:
    """« Lancer le test » (#157) : la courbe de l'interro démarre — demain, ou
    au jour de la séance choisie, qui porte alors le premier test."""
    return use_cases.launch_recall(db, _get_plan_or_404(db, plan_id), body.activity_id)


@router.post(
    "/plans/{plan_id}/study/validate",
    response_model=PlanRead,
    operation_id="validateStudy",
)
def validate_study(plan_id: uuid.UUID, db: DbSession) -> AcquisitionPlan:
    """« Valider l'étude » (#157), à la main — seulement sans questions."""
    return use_cases.validate_study(db, _get_plan_or_404(db, plan_id))


@router.delete(
    "/plans/{plan_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="deletePlan",
)
def delete_plan(plan_id: uuid.UUID, db: DbSession) -> None:
    use_cases.delete_plan(db, _get_plan_or_404(db, plan_id))


# --- La rampe d'un cycle ---


@router.post(
    "/plans/{plan_id}/items", response_model=PlanRead, operation_id="addPlanItem"
)
def add_plan_item(
    plan_id: uuid.UUID, payload: PlanItemAdd, db: DbSession
) -> AcquisitionPlan:
    return use_cases.add_plan_item(db, _get_plan_or_404(db, plan_id), payload.item_id)


@router.patch(
    "/plans/{plan_id}/items/{item_id}",
    response_model=PlanRead,
    operation_id="updatePlanItem",
)
def update_plan_item(
    plan_id: uuid.UUID, item_id: uuid.UUID, payload: PlanItemUpdate, db: DbSession
) -> AcquisitionPlan:
    return use_cases.update_plan_item(
        db, _get_plan_or_404(db, plan_id), item_id, payload
    )


@router.delete(
    "/plans/{plan_id}/items/{item_id}",
    response_model=PlanRead,
    operation_id="removePlanItem",
)
def remove_plan_item(
    plan_id: uuid.UUID, item_id: uuid.UUID, db: DbSession
) -> AcquisitionPlan:
    return use_cases.remove_plan_item(db, _get_plan_or_404(db, plan_id), item_id)


@router.put(
    "/plans/{plan_id}/items/order",
    response_model=PlanRead,
    operation_id="reorderPlanItems",
)
def reorder_plan_items(
    plan_id: uuid.UUID, payload: PlanRampOrder, db: DbSession
) -> AcquisitionPlan:
    return use_cases.reorder_plan_items(db, _get_plan_or_404(db, plan_id), payload)


# --- Les ressources d'un cycle (#173) ---
# Les ajouter et les retirer passe par `PATCH /plans/{plan_id}` (`resource_ids`).


@router.put(
    "/plans/{plan_id}/resources/order",
    response_model=PlanRead,
    operation_id="reorderPlanResources",
)
def reorder_plan_resources(
    plan_id: uuid.UUID, payload: PlanResourceOrder, db: DbSession
) -> AcquisitionPlan:
    """L'ordre de consommation : toutes les ressources du cycle, dans l'ordre."""
    return use_cases.reorder_resources(db, _get_plan_or_404(db, plan_id), payload)


@router.patch(
    "/plans/{plan_id}/resources/{resource_id}",
    response_model=PlanRead,
    operation_id="updatePlanResource",
)
def update_plan_resource(
    plan_id: uuid.UUID,
    resource_id: uuid.UUID,
    payload: PlanResourceUpdate,
    db: DbSession,
) -> AcquisitionPlan:
    """Cocher ou décocher « consommée », ou la lier aux parties du périmètre
    du cycle qu'elle couvre (la liste entière, des parties retenues)."""
    return use_cases.update_plan_resource(
        db, _get_plan_or_404(db, plan_id), resource_id, payload
    )
