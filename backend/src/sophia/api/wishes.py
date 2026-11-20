"""Routes des envies et engagements de la colonne du calendrier (#215)."""

from fastapi import APIRouter

from sophia.api.deps import DbSession
from sophia.application import wishes as use_cases
from sophia.application.schemas.wish import WishListWrite, WishRead
from sophia.infrastructure.models import Wish, WishKind

router = APIRouter(tags=["wishes"])


@router.get("/wishes", response_model=list[WishRead], operation_id="listWishes")
def list_wishes(db: DbSession) -> list[Wish]:
    """Les envies, puis les engagements, chacune dans son ordre."""
    return use_cases.list_wishes(db)


@router.put(
    "/wishes/{kind}", response_model=list[WishRead], operation_id="replaceWishes"
)
def replace_wishes(kind: WishKind, payload: WishListWrite, db: DbSession) -> list[Wish]:
    """`PUT` : la liste entière d'un genre, dans l'ordre. Ce qui n'y est plus
    est supprimé."""
    return use_cases.replace_wishes(db, kind, payload)
