"""Schémas Pydantic des envies et engagements (#215)."""

import uuid

from pydantic import BaseModel, ConfigDict, Field

from sophia.infrastructure.models import WishKind


class WishItem(BaseModel):
    """Une puce telle que le client l'écrit : son id, son texte, son domaine."""

    model_config = ConfigDict(extra="forbid")

    id: uuid.UUID
    text: str = Field(min_length=1, max_length=2000)
    domain_id: uuid.UUID | None = None


class WishListWrite(BaseModel):
    """La liste entière d'un genre, dans l'ordre."""

    model_config = ConfigDict(extra="forbid")

    items: list[WishItem]


class WishRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: WishKind
    text: str
    domain_id: uuid.UUID | None
    position: int
