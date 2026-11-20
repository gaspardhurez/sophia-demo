"""Use cases de l'interro d'un cycle : sa courbe et ses passations (design #80
; refondue le 07/10/2026, chantier interro-reapprentissage, #102, #103).

Passer l'interro : commencer (ou reprendre) une passation sur les questions
complètes du savoir, puis les passer une à une — le texte tapé, la réponse
attendue révélée, le verdict (un seul pour une réponse libre, un par élément
pour une liste). Une question ratée retourne en fin de file et se repose
après un délai ; ouvrir les notes du savoir relance ce délai. La passation se
termine d'elle-même quand chaque question a été sue une fois : la courbe du
cycle avance d'un rang (`domain/recall.py`), l'intervalle compté depuis ce
jour réel, qu'il soit en retard ou en avance ; après J+90, elle est terminée.

**L'interro suit les notes** : une passation ouverte prend les questions du
moment (`sync_open_sessions`, appelé quand une question change). Seul geste
manuel sur la courbe : **Recommencer** (`restart`).
"""

import uuid
from datetime import UTC, date, datetime

from sqlalchemy.orm import Session

from sophia.application import acts as act_use_cases
from sophia.application import notes as notes_use_cases
from sophia.application.schemas.recall import RecallAnswerWrite
from sophia.domain.notes import AnswerForm
from sophia.domain.plan import (
    RecallNotDue,
    RecallNotRunning,
    RecallQuestionKnown,
    RecallSessionFinished,
    RecallWithoutQuestion,
)
from sophia.domain.recall import (
    RETRY_DELAY,
    due_after,
    is_due,
    is_finished,
    list_known,
    next_stage,
)
from sophia.infrastructure.models import (
    AcquisitionPlan,
    NoteQuestion,
    RecallAnswer,
    RecallAttempt,
    RecallRestart,
    RecallSession,
    Skill,
)


def _now() -> datetime:
    return datetime.now(UTC)


def _check_running(plan: AcquisitionPlan) -> None:
    if plan.recall_next_due_at is None:
        raise RecallNotRunning(str(plan.id))


def get_session(db: Session, session_id: uuid.UUID) -> RecallSession | None:
    return db.get(RecallSession, session_id)


def get_skill(db: Session, skill_id: uuid.UUID) -> Skill | None:
    return db.get(Skill, skill_id)


def list_sessions(
    plan: AcquisitionPlan, include_open: bool = False
) -> list[RecallSession]:
    """Les passations terminées du cycle, de la plus récente à la plus
    ancienne — les passes de l'interro (fiche d'une pièce, #137, #138).
    `include_open` : la passation ouverte, s'il y en a une, en tête (« En
    cours »). Une passation abandonnée n'y paraît jamais."""
    finished = sorted(
        (s for s in plan.recall_sessions if s.is_finished),
        key=lambda s: s.finished_at,
        reverse=True,
    )
    if not include_open:
        return finished
    return [s for s in plan.recall_sessions if s.is_open] + finished


# --- Les questions de la passation : celles des notes -------------------------


def _eligible(skill: Skill) -> list[tuple[NoteQuestion, str]]:
    """Les questions complètes du savoir, dans l'ordre du document, avec le
    chemin des titres au-dessus d'elles."""
    return [(q, p) for q, p in notes_use_cases.questions_in_order(skill) if q.complete]


def _copy(row: RecallAnswer, question: NoteQuestion, path: str) -> None:
    """La question telle qu'elle est maintenant, copiée dans la passation."""
    row.question_id = question.id
    row.kind = question.kind
    row.form = question.form
    row.prompt = question.prompt
    row.section_title = path
    row.expected_answer = question.answer
    row.points = [dict(p) for p in question.points]


def _sync(db: Session, session: RecallSession) -> None:
    """Une passation ouverte prend les questions du moment (#102) : une
    question ajoutée entre en fin de file ; une supprimée est retirée (si
    elle n'est pas déjà sue) ; une modifiée se repose telle qu'elle est —
    chaque passage garde le texte posé. Une question sue reste sue, telle
    qu'on l'a sue. Si tout ce qui reste est su, la passation se termine.

    Une question devenue incomplète en cours d'écriture reste comme elle
    était : on ne perd pas ses passages pour une frappe en cours."""
    eligible = _eligible(session.plan.skill)
    for row in [a for a in session.answers if a.question_id is None and not a.known]:
        session.answers.remove(row)
    by_question = {a.question_id: a for a in session.answers}
    for question, path in eligible:
        row = by_question.get(question.id)
        if row is None:
            row = RecallAnswer(
                position=max((a.position for a in session.answers), default=-1) + 1,
                queue_rank=max((a.queue_rank for a in session.answers), default=-1) + 1,
            )
            _copy(row, question, path)
            session.answers.append(row)
        elif not row.known:
            _copy(row, question, path)
    session.total = len(session.answers)
    if session.answers and all(a.known for a in session.answers):
        _finish(db, session)


def sync_open_sessions(db: Session, skill: Skill) -> None:
    """Une question du savoir vient de changer : ses passations ouvertes la
    suivent. N'enregistre pas : l'appelant valide."""
    for plan in skill.plans:
        for session in plan.recall_sessions:
            if session.is_open and plan.recall_next_due_at is not None:
                _sync(db, session)


# --- Passer l'interro -----------------------------------------------------------


def start(db: Session, plan: AcquisitionPlan) -> RecallSession:
    """Commencer l'interro du cycle, ou reprendre celle qu'on avait quittée
    (ses réponses sont gardées, ses questions remises à jour).

    Une **nouvelle** passation ne s'ouvre qu'à partir du jour dû — aujourd'hui
    ou en retard (`is_due`) ; avant, `RecallNotDue` (#138 : plus de passation
    en avance). Celle qu'on avait quittée se reprend toujours.

    Une nouvelle passation prend toutes les questions complètes du savoir,
    dans l'ordre du document — l'ordre de la file au départ —, copiées avec
    le chemin des titres au-dessus d'elles ; une question incomplète (sans
    énoncé ou sans réponse attendue) n'entre pas.
    """
    _check_running(plan)
    pending = next((s for s in plan.recall_sessions if s.is_open), None)
    if pending is not None:
        _sync(db, pending)
        db.commit()
        db.refresh(pending)
        return pending
    if not is_due(plan.recall_next_due_at, date.today()):
        raise RecallNotDue(str(plan.id))
    questions = _eligible(plan.skill)
    if not questions:
        raise RecallWithoutQuestion(str(plan.id))
    session = RecallSession(
        day=date.today(),
        started_at=_now(),
        stage_before=plan.recall_stage or 0,
        total=len(questions),
    )
    for position, (question, path) in enumerate(questions):
        row = RecallAnswer(position=position, queue_rank=position)
        _copy(row, question, path)
        session.answers.append(row)
    plan.recall_sessions.append(session)
    db.commit()
    db.refresh(session)
    return session


def _open_row(session: RecallSession, answer_id: uuid.UUID) -> RecallAnswer | None:
    """La question `answer_id` d'une passation ouverte, encore à savoir."""
    if not session.is_open:
        raise RecallSessionFinished(str(session.id))
    row = next((a for a in session.answers if a.id == answer_id), None)
    if row is not None and row.known:
        raise RecallQuestionKnown(str(row.id))
    return row


def answer(
    db: Session,
    session: RecallSession,
    answer_id: uuid.UUID,
    payload: RecallAnswerWrite,
) -> RecallSession | None:
    """Le passage en cours d'une question : le texte tapé, puis le verdict.
    `None` si la question n'est pas de cette passation.

    Sans verdict, on enregistre le texte (« Retourner », ou quitter en cours
    de frappe). Avec, le passage se clôt : pour une liste, la question est
    sue si tous ses éléments sont donnés (`known_points` ; `known` est alors
    ignoré). Ratée, elle passe en fin de file et attend `RETRY_DELAY`. Sue,
    et la dernière à l'être, elle termine la passation.
    """
    row = _open_row(session, answer_id)
    if row is None:
        return None
    now = _now()
    attempt = row.open_attempt
    if attempt is None:
        attempt = RecallAttempt(
            number=len(row.attempts) + 1, started_at=now, prompt=row.prompt
        )
        row.attempts.append(attempt)
    text = payload.answer.strip() if payload.answer else None
    attempt.answer = text or None
    if row.form is AnswerForm.list and payload.known_points is not None:
        given = [str(p) for p in payload.known_points]
        attempt.known_points = given
        attempt.known = list_known([p["id"] for p in row.points], given)
    else:
        attempt.known = payload.known
    if attempt.known is not None:
        attempt.judged_at = now
    if attempt.known is False:
        row.queue_rank = max(a.queue_rank for a in session.answers) + 1
        row.available_at = now + RETRY_DELAY
    if attempt.known and all(a.known for a in session.answers):
        _finish(db, session)
    db.commit()
    db.refresh(session)
    return session


def _finish(db: Session, session: RecallSession) -> None:
    """Chaque question a été sue une fois : la passation se termine, la
    courbe avance d'un rang, et la prochaine interro se compte depuis
    aujourd'hui — le jour réel. Après J+90, la courbe est terminée : plus
    d'interro posée. Le score au premier essai se garde, pour information.
    N'enregistre pas : l'appelant valide."""
    plan = session.plan
    _check_running(plan)
    today = date.today()
    session.day = today
    session.finished_at = _now()
    # Le rang de la courbe à la fin : il a pu bouger depuis le départ
    # (Recommencer abandonne la passation, mais par prudence).
    session.stage_before = plan.recall_stage or 0
    session.known_count = sum(1 for a in session.answers if a.first_known)
    session.stage_after = next_stage(session.stage_before)
    # Au calendrier (#82) : l'interro passée se coche à aujourd'hui, puis la
    # suivante se pose au jour de son rappel — s'il y en a une.
    act_use_cases.take_recall_activity(db, plan, today)
    plan.recall_stage = session.stage_after
    if is_finished(session.stage_after):
        plan.recall_next_due_at = None
    else:
        plan.recall_next_due_at = due_after(today, session.stage_after)
        act_use_cases.place_recall_activity(db, plan)


def notes_opened(db: Session, skill: Skill) -> None:
    """Les notes du savoir viennent de s'ouvrir : on ne doit pas restituer ce
    qu'on vient de relire. Dans ses passations en cours, toute question qui
    reste à passer — tentée ou non — attend à nouveau `RETRY_DELAY`."""
    until = _now() + RETRY_DELAY
    for plan in skill.plans:
        for session in plan.recall_sessions:
            if not session.is_open:
                continue
            for row in session.answers:
                if not row.known:
                    row.available_at = until
    db.commit()


# --- Réviser une question (#103) -----------------------------------------------


def set_revision(
    db: Session, session: RecallSession, answer_id: uuid.UUID, day: date
) -> RecallSession | None:
    """« Réviser » (dès le 3ᵉ passage) : une séance de révision du savoir,
    ce jour-là, rattachée à la question. Une seconde date déplace la même
    séance. La question reste dans la file : la révision n'est qu'un plus.
    `None` si la question n'est pas de cette passation."""
    row = _open_row(session, answer_id)
    if row is None:
        return None
    revision = row.revision
    if revision is not None and not revision.done:
        act_use_cases.move_activity_to(revision, day)
    else:
        row.revision = act_use_cases.new_study_activity(
            db, session.plan, day, f"Révision · {session.plan.skill.name}"
        )
    db.commit()
    db.refresh(session)
    return session


def clear_revision(
    db: Session, session: RecallSession, answer_id: uuid.UUID
) -> RecallSession | None:
    """Retirer la révision posée : la séance part du calendrier si elle
    n'est pas faite ; faite, elle reste, seul le lien tombe."""
    row = _open_row(session, answer_id)
    if row is None:
        return None
    revision = row.revision
    row.revision = None
    if revision is not None and not revision.done:
        db.delete(revision)
    db.commit()
    db.refresh(session)
    return session


# --- La courbe : Recommencer ------------------------------------------------------


def restart(db: Session, plan: AcquisitionPlan) -> AcquisitionPlan:
    """Recommencer l'interro (#102) : la courbe repart à J+1 — prochaine
    interro demain —, même terminée. Une passation ouverte est abandonnée
    (ses passages restent en base) ; l'historique note « Recommencée ».

    Une courbe jamais démarrée, ou arrêtée à la clôture sans être gardée en
    rétention, ne se recommence pas."""
    if plan.recall_stage is None or (plan.is_closed and not plan.recall_in_retention):
        raise RecallNotRunning(str(plan.id))
    now = _now()
    for session in plan.recall_sessions:
        if session.is_open:
            session.abandoned_at = now
    act_use_cases.withdraw_recall_activity(db, plan)
    plan.recall_stage = 0
    plan.recall_next_due_at = due_after(date.today(), 0)
    act_use_cases.place_recall_activity(db, plan)
    plan.recall_restarts.append(RecallRestart(at=now))
    db.commit()
    db.refresh(plan)
    return plan
