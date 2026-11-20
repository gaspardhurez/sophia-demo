"""Routes de la vérification des notes d'une ressource et des fils de ses
commentaires (#173)."""

import uuid

from fastapi import APIRouter, HTTPException, status

from sophia.api.deps import CompanionDep, DbSession, SourceReaderDep
from sophia.application import resources as resource_use_cases
from sophia.application import review as use_cases
from sophia.application.schemas.review import (
    ReviewCommentRead,
    ReviewCommentUpdate,
    ReviewReplyCreate,
    ReviewRequest,
    ReviewRun,
)
from sophia.infrastructure.models import Resource, ReviewComment

router = APIRouter(tags=["review"])


def _resource_or_404(db: DbSession, resource_id: uuid.UUID) -> Resource:
    resource = resource_use_cases.get_resource(db, resource_id)
    if resource is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ressource introuvable")
    return resource


def _comment_or_404(db: DbSession, comment_id: uuid.UUID) -> ReviewComment:
    comment = use_cases.get_comment(db, comment_id)
    if comment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Commentaire introuvable")
    return comment


@router.post(
    "/resources/{resource_id}/review",
    response_model=ReviewRun,
    operation_id="reviewResourceNotes",
)
def review_resource_notes(
    resource_id: uuid.UUID,
    payload: ReviewRequest,
    db: DbSession,
    companion: CompanionDep,
    reader: SourceReaderDep,
) -> use_cases.ReviewOutcome:
    """Vérifier les notes d'une ressource contre la ressource. Rend les
    **nouveaux** commentaires (une liste vide : rien d'important), ou
    `needs_paste` — rien n'a été vérifié, un second appel porte
    `pasted_text`. Les commentaires existants restent."""
    return use_cases.run_review(
        db,
        _resource_or_404(db, resource_id),
        companion,
        reader,
        payload.pasted_text,
    )


@router.get(
    "/resources/{resource_id}/review-comments",
    response_model=list[ReviewCommentRead],
    operation_id="listReviewComments",
)
def list_review_comments(resource_id: uuid.UUID, db: DbSession) -> list[ReviewComment]:
    """Les commentaires d'une ressource, ouverts et résolus, du plus ancien au
    plus récent, chacun avec son fil."""
    return use_cases.list_comments(_resource_or_404(db, resource_id))


@router.patch(
    "/review-comments/{comment_id}",
    response_model=ReviewCommentRead,
    operation_id="updateReviewComment",
)
def update_review_comment(
    comment_id: uuid.UUID, payload: ReviewCommentUpdate, db: DbSession
) -> ReviewComment:
    """Résoudre (`resolved` : archivé, il reste replié) ou rouvrir (`open`)."""
    return use_cases.set_status(db, _comment_or_404(db, comment_id), payload.status)


@router.delete(
    "/review-comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="deleteReviewComment",
)
def delete_review_comment(comment_id: uuid.UUID, db: DbSession) -> None:
    use_cases.delete_comment(db, _comment_or_404(db, comment_id))


@router.post(
    "/review-comments/{comment_id}/replies",
    response_model=ReviewCommentRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="replyToReviewComment",
)
def reply_to_review_comment(
    comment_id: uuid.UUID,
    payload: ReviewReplyCreate,
    db: DbSession,
    companion: CompanionDep,
    reader: SourceReaderDep,
) -> ReviewComment:
    """Ajouter une réponse de l'utilisateur ; Sophia répond dans la foulée.
    Rend le commentaire avec son fil. Si Sophia échoue (502), la réponse de
    l'utilisateur est déjà enregistrée ; indisponible (503), rien ne l'est."""
    return use_cases.reply(
        db, _comment_or_404(db, comment_id), payload.body, companion, reader
    )
