"""Routes de l'interro d'un cycle (design #80, #102, #103) — commencer ou
reprendre une passation, passer les questions (la dernière sue termine),
réviser une question ; l'historique des passations ; recommencer la
courbe."""

import uuid

from fastapi import APIRouter, HTTPException, status

from sophia.api.deps import DbSession
from sophia.application import plans as plan_use_cases
from sophia.application import recall as use_cases
from sophia.application.schemas.plan import PlanRead
from sophia.application.schemas.recall import (
    RecallAnswerWrite,
    RecallRevisionWrite,
    RecallSessionRead,
    RecallSessionSummary,
)
from sophia.infrastructure.models import AcquisitionPlan, RecallSession

router = APIRouter(tags=["recall"])


def _get_plan_or_404(db: DbSession, plan_id: uuid.UUID) -> AcquisitionPlan:
    plan = plan_use_cases.get_plan(db, plan_id)
    if plan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan introuvable")
    return plan


def _get_session_or_404(db: DbSession, session_id: uuid.UUID) -> RecallSession:
    session = use_cases.get_session(db, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Passation introuvable")
    return session


@router.post(
    "/plans/{plan_id}/recall",
    response_model=RecallSessionRead,
    operation_id="startRecall",
)
def start_recall(plan_id: uuid.UUID, db: DbSession) -> RecallSession:
    """Passer l'interro : une nouvelle passation — à partir du jour dû
    seulement (#138) —, ou celle qu'on avait quittée, ses réponses gardées."""
    return use_cases.start(db, _get_plan_or_404(db, plan_id))


@router.get(
    "/plans/{plan_id}/recall-sessions",
    response_model=list[RecallSessionSummary],
    operation_id="listRecallSessions",
)
def list_recall_sessions(
    plan_id: uuid.UUID, db: DbSession, include_open: bool = False
) -> list[RecallSession]:
    """Les passations terminées, de la plus récente à la plus ancienne ;
    avec `include_open`, la passation ouverte en tête."""
    return use_cases.list_sessions(_get_plan_or_404(db, plan_id), include_open)


@router.get(
    "/recall-sessions/{session_id}",
    response_model=RecallSessionRead,
    operation_id="getRecallSession",
)
def get_recall_session(session_id: uuid.UUID, db: DbSession) -> RecallSession:
    return _get_session_or_404(db, session_id)


@router.put(
    "/recall-sessions/{session_id}/answers/{answer_id}",
    response_model=RecallSessionRead,
    operation_id="answerRecall",
)
def answer_recall(
    session_id: uuid.UUID,
    answer_id: uuid.UUID,
    payload: RecallAnswerWrite,
    db: DbSession,
) -> RecallSession:
    """Le passage en cours d'une question : le texte, puis le verdict. Ratée,
    elle passe en fin de file ; la dernière sue termine la passation."""
    session = use_cases.answer(
        db, _get_session_or_404(db, session_id), answer_id, payload
    )
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Question introuvable")
    return session


@router.post(
    "/skills/{skill_id}/notes/opened",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="notesOpened",
)
def notes_opened(skill_id: uuid.UUID, db: DbSession) -> None:
    """Les notes du savoir viennent de s'ouvrir : dans ses interros en cours,
    les questions qui restent attendent à nouveau dix minutes."""
    skill = use_cases.get_skill(db, skill_id)
    if skill is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Savoir introuvable")
    use_cases.notes_opened(db, skill)


@router.put(
    "/recall-sessions/{session_id}/answers/{answer_id}/revision",
    response_model=RecallSessionRead,
    operation_id="setRecallRevision",
)
def set_recall_revision(
    session_id: uuid.UUID,
    answer_id: uuid.UUID,
    payload: RecallRevisionWrite,
    db: DbSession,
) -> RecallSession:
    """« Réviser » : une séance de révision du savoir ce jour-là, rattachée à
    la question ; une seconde date la déplace."""
    session = use_cases.set_revision(
        db, _get_session_or_404(db, session_id), answer_id, payload.day
    )
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Question introuvable")
    return session


@router.delete(
    "/recall-sessions/{session_id}/answers/{answer_id}/revision",
    response_model=RecallSessionRead,
    operation_id="clearRecallRevision",
)
def clear_recall_revision(
    session_id: uuid.UUID, answer_id: uuid.UUID, db: DbSession
) -> RecallSession:
    """Retirer la révision : la séance part du calendrier si elle n'est pas
    faite."""
    session = use_cases.clear_revision(
        db, _get_session_or_404(db, session_id), answer_id
    )
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Question introuvable")
    return session


@router.post(
    "/plans/{plan_id}/recall/restart",
    response_model=PlanRead,
    operation_id="restartRecall",
)
def restart_recall(plan_id: uuid.UUID, db: DbSession) -> AcquisitionPlan:
    """Recommencer l'interro : la courbe repart à J+1, une passation ouverte
    est abandonnée, l'historique note « Recommencée »."""
    return use_cases.restart(db, _get_plan_or_404(db, plan_id))
