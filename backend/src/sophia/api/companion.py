"""Route du compagnon — l'état de ses actions, pour que l'écran grise ce qui
ne marche pas et dise pourquoi."""

from fastapi import APIRouter

from sophia.api.deps import CompanionDep, TranscriberDep
from sophia.application import companion as use_cases
from sophia.application.schemas.companion import CompanionStatus

router = APIRouter(tags=["companion"])


@router.get(
    "/companion", response_model=CompanionStatus, operation_id="getCompanionStatus"
)
def get_companion_status(
    companion: CompanionDep, transcriber: TranscriberDep
) -> CompanionStatus:
    return use_cases.companion_status(companion, transcriber)
