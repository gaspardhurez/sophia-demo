"""Use cases des notes d'un savoir (design #79, #88).

Un seul document par savoir, enregistré **d'un bloc** au fil de la saisie.
Les questions vivent en table et s'écrivent une à une (créées vides, en
place) ; leur ordre et leur contexte se lisent du document, au moment de
l'usage (`domain.notes.question_places`).
"""

import uuid
from typing import Any

from sqlalchemy.orm import Session

from sophia.application import recall as recall_use_cases
from sophia.application.schemas.notes import (
    NoteQuestionCreate,
    NoteQuestionUpdate,
    NotesWrite,
)
from sophia.domain.notes import (
    PATH_SEPARATOR,
    NotesSkillNotFound,
    question_places,
    with_point_ids,
    with_question_nodes,
)
from sophia.infrastructure.models import NoteQuestion, Skill, SkillNotes


def _load_skill(db: Session, skill_id: uuid.UUID) -> Skill:
    skill = db.get(Skill, skill_id)
    if skill is None:
        raise NotesSkillNotFound(str(skill_id))
    return skill


def _read(skill: Skill) -> dict[str, Any]:
    """Le document et les questions du savoir.

    Lu, le document **pose toutes ses questions** : une question qu'aucun
    nœud ne pose reçoit un nœud en fin de document, dans l'ordre de création
    (nœud effacé par erreur, question écrite par l'API). Rien ne s'écrit : le
    prochain enregistrement fixera ce que le front renvoie.
    """
    doc = skill.notes.doc if skill.notes is not None else None
    posed = {qid for qid, _ in question_places(doc)}
    missing = [q.id for q in skill.note_questions if q.id not in posed]
    return {
        "doc": with_question_nodes(doc, missing),
        "questions": skill.note_questions,
    }


def read_notes(db: Session, skill_id: uuid.UUID) -> dict[str, Any]:
    """Les notes d'un savoir. Un savoir sans notes n'est pas une erreur : son
    document est nul."""
    return _read(_load_skill(db, skill_id))


def save_notes(db: Session, skill_id: uuid.UUID, payload: NotesWrite) -> dict[str, Any]:
    """Remplace le document du savoir. L'enregistrement ne touche à aucune
    question : seul `DELETE /note-questions/{id}` en supprime une."""
    skill = _load_skill(db, skill_id)
    if skill.notes is None:
        skill.notes = SkillNotes(doc=payload.doc)
    else:
        skill.notes.doc = payload.doc
    db.commit()
    db.refresh(skill)
    return _read(skill)


def questions_in_order(skill: Skill) -> list[tuple[NoteQuestion, str]]:
    """Les questions du savoir dans l'ordre du document, chacune avec le
    chemin des titres au-dessus d'elle (« Le geste › Préparation », vide sans
    titre). Une question qu'aucun nœud ne pose vient à la fin, dans l'ordre de
    création, sans titre ; un nœud qui ne pose pas une question du savoir est
    sans effet."""
    doc = skill.notes.doc if skill.notes is not None else None
    by_id = {q.id: q for q in skill.note_questions}
    ordered: list[tuple[NoteQuestion, str]] = []
    for qid, path in question_places(doc):
        question = by_id.pop(qid, None)
        if question is not None:
            ordered.append((question, PATH_SEPARATOR.join(path)))
    ordered.extend((q, "") for q in skill.note_questions if q.id in by_id)
    return ordered


def get_question(db: Session, question_id: uuid.UUID) -> NoteQuestion | None:
    return db.get(NoteQuestion, question_id)


def create_question(
    db: Session, skill_id: uuid.UUID, payload: NoteQuestionCreate
) -> NoteQuestion:
    """Une question naît vide ou non : elle se crée en place et s'écrit au fil
    de la saisie. C'est le nœud que le front insère dans le document qui la
    place ; sans lui, la lecture l'ajoute en fin."""
    skill = _load_skill(db, skill_id)
    fields = payload.model_dump()
    fields["points"] = with_point_ids(fields["points"])
    question = NoteQuestion(**fields)
    skill.note_questions.append(question)
    db.flush()
    # L'interro suit les notes : une passation ouverte la prend (#102).
    recall_use_cases.sync_open_sessions(db, skill)
    db.commit()
    db.refresh(question)
    return question


def update_question(
    db: Session, question: NoteQuestion, payload: NoteQuestionUpdate
) -> NoteQuestion:
    """Modifier une question ; incomplète, elle s'enregistre mais ne compte
    pas (`domain.notes.is_complete`). `null` sur la nature, la forme, la
    question ou les éléments ne change rien ; un élément sans id en reçoit
    un."""
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        if value is None and field != "answer":
            continue
        if field == "points":
            value = with_point_ids(value)
        setattr(question, field, value)
    db.flush()
    recall_use_cases.sync_open_sessions(db, question.skill)
    db.commit()
    db.refresh(question)
    return question


def delete_question(db: Session, question: NoteQuestion) -> None:
    """Supprimer une question. Son nœud, s'il reste dans le document, n'a plus
    d'effet ; ses passations terminées gardent leur copie, une passation
    ouverte la retire si elle n'y est pas encore sue."""
    skill = question.skill
    db.delete(question)
    db.commit()
    db.refresh(skill)
    recall_use_cases.sync_open_sessions(db, skill)
    db.commit()
