"""Schémas de la vérification des notes d'une ressource et de ses fils (#173)."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from sophia.domain.review import (
    PasteReason,
    ReplyAuthor,
    ReviewAnchor,
    ReviewKind,
    ReviewStatus,
)


class ReviewRequest(BaseModel):
    """Lancer une vérification. `pasted_text` : le passage collé quand la
    source n'a pas pu être lue (second appel, après `needs_paste`)."""

    pasted_text: str | None = None


class ReviewReplyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    author: ReplyAuthor
    body: str
    created_at: datetime


class ReviewCommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    resource_id: uuid.UUID
    kind: ReviewKind
    #: `passage` : `quote` est à surligner ; `insertion` : l'oubli s'insère
    #: après `quote`.
    anchor: ReviewAnchor
    #: L'extrait des notes, tel qu'il y figurait à la vérification (dans un
    #: seul bloc).
    quote: str
    message: str
    where_to_look: str | None
    status: ReviewStatus
    resolved_at: datetime | None
    #: Les commentaires d'une même vérification partagent ce `run_id`.
    run_id: uuid.UUID
    created_at: datetime
    #: Le fil, du plus ancien au plus récent.
    replies: list[ReviewReplyRead]


class ReviewRun(BaseModel):
    """Le résultat d'une vérification : les **nouveaux** commentaires (une
    liste vide : « Rien d'important ne manque. »), ou la demande de coller la
    source."""

    #: La source n'a pas pu être lue, ou elle est trop longue même restreinte
    #: à sa partie : rien n'a été vérifié, on demande de coller le passage.
    needs_paste: bool
    paste_reason: PasteReason | None
    comments: list[ReviewCommentRead]


class ReviewCommentUpdate(BaseModel):
    """Résoudre (archiver) ou rouvrir un commentaire."""

    status: ReviewStatus


class ReviewReplyCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
