"""Use cases de la vérification des notes d'une ressource et de ses fils (#173).

« Vérifier les notes » relit les notes d'une ressource contre la ressource :
le serveur va chercher la source sur le moment (`SourceReader`, sans rien en
garder), la confie au compagnon (`Companion.review_notes`), applique les
garde-fous (`domain.review.keep_findings`) et garde les commentaires retenus.
« Vérifier à nouveau » ajoute sans effacer : les commentaires existants,
résolus compris, partent avec la demande pour éviter les redites.

Si la source ne se lit pas (pas de lien, page payante, réseau, pas de
sous-titres) ou qu'elle est trop longue même restreinte à la partie de la
ressource, rien n'est vérifié : la réponse dit `needs_paste`, et un second
appel porte le passage collé. Jamais de troncature silencieuse.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol

from sqlalchemy.orm import Session

from sophia.application.companion import (
    Companion,
    CompanionUnavailable,
    ExistingComment,
    ReplyContext,
    ReplyLine,
    ReviewContext,
)
from sophia.domain.review import (
    MAX_SOURCE_CHARS,
    Finding,
    PasteReason,
    ReplyAuthor,
    ReviewEmptyReply,
    ReviewKind,
    ReviewNothingToReview,
    ReviewPastedTooLong,
    ReviewStatus,
    keep_findings,
    notes_text,
)
from sophia.infrastructure.models import (
    AcquisitionPlan,
    PlanState,
    Resource,
    ReviewComment,
    ReviewReply,
)

# --- Le port de la source ------------------------------------------------------


@dataclass(frozen=True)
class SourceText:
    """La source lue : `web` (texte principal d'une page) ou `youtube`
    (sous-titres horodatés, restreints à la partie quand elle donne des
    horodatages)."""

    kind: str
    text: str


@dataclass(frozen=True)
class SourceMissing:
    """La source n'a pas pu être lue, et pourquoi."""

    reason: PasteReason


class SourceReader(Protocol):
    def read(
        self, reference: str | None, part: str | None
    ) -> SourceText | SourceMissing:
        """La source d'une ressource, d'après sa référence et sa partie. Ne
        lève pas : tout échec rend `SourceMissing`."""
        ...


# --- Ce qui sert aux deux usages ---------------------------------------------


@dataclass(frozen=True)
class ReviewOutcome:
    needs_paste: bool
    paste_reason: PasteReason | None
    comments: list[ReviewComment]


def _require(companion: Companion) -> None:
    """Refuser avant de lire la source ou d'écrire quoi que ce soit."""
    availability = companion.availability()
    if not availability.available:
        raise CompanionUnavailable(availability.reason or "Compagnon indisponible.")


def _plan_of(resource: Resource) -> AcquisitionPlan | None:
    """Le cycle dont la ressource fait l'étude : celui en cours s'il y en a
    un, sinon le plus récent."""
    plans = [link.plan for link in resource.plan_links]
    active = [p for p in plans if p.state is PlanState.active]
    if active:
        return active[0]
    return max(plans, key=lambda p: p.created_at, default=None)


def _notes_doc(resource: Resource):
    return resource.notes.doc if resource.notes is not None else None


def _existing(resource: Resource) -> tuple[ExistingComment, ...]:
    return tuple(
        ExistingComment(
            kind=c.kind.value,
            quote=c.quote,
            message=c.message,
            status=c.status.value,
            replies=tuple(ReplyLine(r.author.value, r.body) for r in c.replies),
        )
        for c in resource.review_comments
    )


# --- La vérification ------------------------------------------------------------


def list_comments(resource: Resource) -> list[ReviewComment]:
    """Les commentaires d'une ressource, ouverts et résolus, du plus ancien au
    plus récent."""
    return list(resource.review_comments)


def run_review(
    db: Session,
    resource: Resource,
    companion: Companion,
    reader: SourceReader,
    pasted_text: str | None = None,
) -> ReviewOutcome:
    doc = _notes_doc(resource)
    text = notes_text(doc)
    if not text.strip():
        raise ReviewNothingToReview(str(resource.id))
    _require(companion)

    pasted = (pasted_text or "").strip()
    if pasted:
        if len(pasted) > MAX_SOURCE_CHARS:
            raise ReviewPastedTooLong(str(resource.id))
        source = SourceText(kind="pasted", text=pasted)
    else:
        read = reader.read(resource.reference, resource.part)
        if isinstance(read, SourceMissing):
            return ReviewOutcome(True, read.reason, [])
        if len(read.text) > MAX_SOURCE_CHARS:
            return ReviewOutcome(True, PasteReason.too_long, [])
        source = read

    plan = _plan_of(resource)
    findings = companion.review_notes(
        ReviewContext(
            skill_title=resource.skill.name,
            intention=plan.target_level if plan else None,
            scope=plan.scope if plan else None,
            resource_title=resource.title,
            resource_author=resource.author,
            resource_reference=resource.reference,
            resource_part=resource.part,
            notes_text=text,
            source_kind=source.kind,
            source_text=source.text,
            existing_comments=_existing(resource),
        )
    )

    # Les garde-fous : un type inconnu est écarté comme une citation absente.
    candidates = [
        Finding(ReviewKind(f.kind), f.quote, f.after_quote, f.message, f.where_to_look)
        for f in findings
        if f.kind in ReviewKind.__members__
    ]
    kept = keep_findings(candidates, doc)
    # Un appel, une provenance : tous ses commentaires la partagent.
    prompt_version = findings[0].prompt_version if findings else ""
    model = findings[0].model if findings else ""

    run_id = uuid.uuid4()
    created: list[ReviewComment] = []
    for finding in kept:
        comment = ReviewComment(
            kind=finding.kind,
            anchor=finding.anchor,
            quote=finding.quote,
            message=finding.message,
            where_to_look=finding.where_to_look,
            run_id=run_id,
            prompt_version=prompt_version,
            model=model,
        )
        resource.review_comments.append(comment)
        created.append(comment)
    db.commit()
    for comment in created:
        db.refresh(comment)
    return ReviewOutcome(False, None, created)


# --- Un commentaire, son fil ----------------------------------------------------


def get_comment(db: Session, comment_id: uuid.UUID) -> ReviewComment | None:
    return db.get(ReviewComment, comment_id)


def set_status(
    db: Session, comment: ReviewComment, status: ReviewStatus
) -> ReviewComment:
    """Résoudre (archiver : il reste, replié) ou rouvrir."""
    if status is not comment.status:
        comment.status = status
        comment.resolved_at = (
            datetime.now(UTC).replace(tzinfo=None)
            if status is ReviewStatus.resolved
            else None
        )
    db.commit()
    db.refresh(comment)
    return comment


def delete_comment(db: Session, comment: ReviewComment) -> None:
    """Supprimer : le commentaire et son fil disparaissent."""
    db.delete(comment)
    db.commit()


def reply(
    db: Session,
    comment: ReviewComment,
    body: str,
    companion: Companion,
    reader: SourceReader,
) -> ReviewComment:
    """La réponse de l'utilisateur, puis celle de Sophia.

    La réponse de l'utilisateur est enregistrée **avant** l'appel : si Sophia
    échoue (réseau, API), ce qu'il a écrit reste dans le fil. Un compagnon
    indisponible refuse avant toute écriture. La source est relue si elle se
    lit (un passage collé, lui, n'a pas été gardé) ; sinon Sophia répond sans.
    """
    text = body.strip()
    if not text:
        raise ReviewEmptyReply(str(comment.id))
    _require(companion)

    comment.replies.append(ReviewReply(author=ReplyAuthor.user, body=text))
    db.commit()
    db.refresh(comment)

    resource = comment.resource
    read = reader.read(resource.reference, resource.part)
    source = (
        read.text
        if isinstance(read, SourceText) and len(read.text) <= MAX_SOURCE_CHARS
        else None
    )
    answer = companion.reply_in_thread(
        ReplyContext(
            skill_title=resource.skill.name,
            resource_title=resource.title,
            resource_part=resource.part,
            notes_text=notes_text(_notes_doc(resource)),
            comment_kind=comment.kind.value,
            comment_quote=comment.quote,
            comment_message=comment.message,
            comment_where_to_look=comment.where_to_look,
            thread=tuple(ReplyLine(r.author.value, r.body) for r in comment.replies),
            source_text=source,
        )
    )
    comment.replies.append(ReviewReply(author=ReplyAuthor.sophia, body=answer.strip()))
    db.commit()
    db.refresh(comment)
    return comment
