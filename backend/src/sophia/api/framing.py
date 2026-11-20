"""Routes de « Cadrer l'étude » (#175) : les propositions du compagnon pour
l'intention, le périmètre et les ressources d'un cycle. Rien n'est écrit."""

import uuid

from fastapi import APIRouter, HTTPException, status

from sophia.api.deps import CompanionDep, DbSession
from sophia.application import framing as use_cases
from sophia.application import plans as plan_use_cases
from sophia.application.schemas.framing import (
    IntentionReply,
    IntentionRequest,
    ResourceProposals,
    ResourcesRequest,
    ScopeProposal,
    ScopeRequest,
)
from sophia.domain.framing import IntentionTurn
from sophia.infrastructure.models import AcquisitionPlan

router = APIRouter(tags=["companion"])

_RESPONSES: dict[int | str, dict] = {
    404: {"description": "Cycle introuvable."},
    502: {"description": "La proposition n'a pas abouti (réseau, réponse)."},
    503: {"description": "Compagnon indisponible, avec le motif."},
}


def _plan_or_404(db: DbSession, plan_id: uuid.UUID) -> AcquisitionPlan:
    plan = plan_use_cases.get_plan(db, plan_id)
    if plan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan introuvable")
    return plan


@router.post(
    "/plans/{plan_id}/framing/intention",
    response_model=IntentionReply,
    operation_id="frameIntention",
    responses=_RESPONSES,
)
def frame_intention(
    plan_id: uuid.UUID,
    payload: IntentionRequest,
    db: DbSession,
    companion: CompanionDep,
) -> IntentionTurn:
    """Le tour suivant du chat de l'intention : sans échange, la question
    d'ouverture et ses réponses proposées ; ensuite l'intention reformulée et
    la question suivante, ou `done`. Rien n'est enregistré."""
    plan = _plan_or_404(db, plan_id)
    return use_cases.intention_turn(
        plan,
        [(t.question, t.answer) for t in payload.turns],
        payload.intention,
        companion,
    )


@router.post(
    "/plans/{plan_id}/framing/scope",
    response_model=ScopeProposal,
    operation_id="frameScope",
    responses=_RESPONSES,
)
def frame_scope(
    plan_id: uuid.UUID, payload: ScopeRequest, db: DbSession, companion: CompanionDep
) -> dict:
    """Les parties possibles du savoir, dans ou hors de ce cycle. Rien n'est
    enregistré."""
    plan = _plan_or_404(db, plan_id)
    return {"tags": use_cases.propose_scope(plan, payload.intention, companion)}


@router.post(
    "/plans/{plan_id}/framing/resources",
    response_model=ResourceProposals,
    operation_id="frameResources",
    responses=_RESPONSES,
)
def frame_resources(
    plan_id: uuid.UUID,
    payload: ResourcesRequest,
    db: DbSession,
    companion: CompanionDep,
) -> dict:
    """Des ressources trouvées par une recherche web, liens tirés des seuls
    résultats ; une liste vide : rien de solide. Rien n'est enregistré."""
    plan = _plan_or_404(db, plan_id)
    return {
        "resources": use_cases.search_resources(
            plan, payload.preferences, payload.exclude, companion
        )
    }
