"""Route des idées centrales d'une section des notes (#173)."""

import uuid

from fastapi import APIRouter, HTTPException, status

from sophia.api.deps import CompanionDep, DbSession
from sophia.application import ideas as use_cases
from sophia.application import skills as skill_use_cases
from sophia.application.schemas.ideas import CentralIdeas, CentralIdeasRequest

router = APIRouter(tags=["companion"])


@router.post(
    "/skills/{skill_id}/central-ideas",
    response_model=CentralIdeas,
    operation_id="proposeCentralIdeas",
    responses={
        404: {"description": "Savoir introuvable."},
        422: {"description": "La section n'a pas de texte."},
        502: {"description": "La proposition n'a pas abouti (réseau, réponse)."},
        503: {"description": "Compagnon indisponible, avec le motif."},
    },
)
def propose_central_ideas(
    skill_id: uuid.UUID,
    payload: CentralIdeasRequest,
    db: DbSession,
    companion: CompanionDep,
) -> dict:
    """Les idées d'une section à savoir sans les notes, que ses questions ne
    couvrent pas encore : idée, raison, angle, extrait. Rien n'est
    enregistré."""
    skill = skill_use_cases.get_skill(db, skill_id)
    if skill is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Savoir introuvable")
    return {"ideas": use_cases.propose_ideas(skill, payload.section, companion)}
