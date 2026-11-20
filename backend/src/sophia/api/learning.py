"""Endpoint de la vue d'ensemble de l'apprentissage (#152)."""

from fastapi import APIRouter

from sophia.api.deps import DbSession
from sophia.application import learning as use_cases
from sophia.application.schemas.learning import LearningOverviewRead

router = APIRouter(prefix="/learning", tags=["learning"])


@router.get(
    "/overview",
    response_model=LearningOverviewRead,
    operation_id="getLearningOverview",
)
def get_overview(db: DbSession) -> dict:
    """Ce qui est à faire, tous savoirs confondus, en six cartes — et les
    savoirs en cours, pour la colonne de gauche. Lecture seule."""
    return use_cases.overview(db)
