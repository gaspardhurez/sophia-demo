"""La séquence d'acquisition d'un projet — l'écrire, et la tenir.

La règle (rang continu, étape = coupe, hors séquence par défaut) vit dans
`sophia.domain.sequence`. Ici : lire les rangs, les réécrire après chaque
mouvement des liens, et l'écriture d'un bloc du plan.
"""

import uuid

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from sophia.application.schemas.project import SequenceSegment
from sophia.domain.project import SequenceMismatch
from sophia.domain.sequence import Placed, sequence_order
from sophia.infrastructure.models import Project, project_skills


def _positions(db: Session, project: Project) -> dict[uuid.UUID, int | None]:
    rows = db.execute(
        select(project_skills.c.skill_id, project_skills.c.position).where(
            project_skills.c.project_id == project.id
        )
    )
    return {skill_id: position for skill_id, position in rows}


def _write(db: Session, project: Project, order: list[uuid.UUID]) -> None:
    """Pose les rangs 1…n dans cet ordre ; tout le reste hors séquence."""
    link = project_skills.c
    db.execute(
        update(project_skills)
        .where(link.project_id == project.id)
        .values(position=None)
    )
    for rank, skill_id in enumerate(order, start=1):
        db.execute(
            update(project_skills)
            .where(link.project_id == project.id, link.skill_id == skill_id)
            .values(position=rank)
        )


def normalize_sequence(db: Session, project: Project) -> None:
    """Remet la séquence d'aplomb après un mouvement des liens ou des étapes.

    Appelé par tout ce qui touche aux savoirs d'un projet ou à ses étapes :
    un savoir entré dans une étape y prend un rang (en fin d'étape), un savoir
    sorti de toute étape repasse hors séquence, les rangs se resserrent.
    """
    db.flush()
    db.expire(project)
    pos = _positions(db, project)
    steps = sorted(project.steps, key=lambda s: s.order)
    in_steps = {skill.id for step in steps for skill in step.skills}

    def placed(skill) -> Placed:
        return Placed(skill.id, pos.get(skill.id), skill.name)

    order = sequence_order(
        [[placed(s) for s in step.skills] for step in steps],
        [placed(s) for s in project.skills if s.id not in in_steps],
    )
    _write(db, project, order)


def ranked_skills(db: Session, project: Project) -> list:
    """Les savoirs rangés, dans l'ordre — ce que reprend une première étape."""
    pos = _positions(db, project)
    ranked = [s for s in project.skills if pos.get(s.id) is not None]
    return sorted(ranked, key=lambda s: pos[s.id])


def set_sequence(
    db: Session, project: Project, segments: list[SequenceSegment]
) -> Project:
    """Écrit la séquence d'un bloc : chaque étape reçoit ses savoirs, dans
    l'ordre ; ce qui n'est nulle part est hors séquence.

    Un seul geste pour tous les glisser-déposer du plan — réordonner, changer
    d'étape, renvoyer au bac —, si bien qu'aucun état intermédiaire ne peut
    contredire la règle. Aucun lien projet ↔ savoir ne naît ni ne meurt ici :
    les brouillons de cycle ne bougent pas.
    """
    steps = {step.id: step for step in project.steps}
    visés = {skill.id: skill for skill in project.skills}
    for step in project.steps:
        visés.update({skill.id: skill for skill in step.skills})

    given = [sid for seg in segments for sid in seg.skill_ids]
    if len(given) != len(set(given)) or any(sid not in visés for sid in given):
        raise SequenceMismatch(str(project.id))
    if steps:
        ids = [seg.step_id for seg in segments]
        if any(i not in steps for i in ids) or len(ids) != len(set(ids)):
            raise SequenceMismatch(str(project.id))
    elif len(segments) > 1 or any(seg.step_id is not None for seg in segments):
        raise SequenceMismatch(str(project.id))

    by_step = {seg.step_id: seg.skill_ids for seg in segments}
    order: list[uuid.UUID] = []
    if steps:
        for step in sorted(steps.values(), key=lambda s: s.order):
            chosen = by_step.get(step.id, [])
            step.skills = [visés[sid] for sid in chosen]
            order.extend(chosen)
    else:
        order = by_step.get(None, [])

    db.flush()
    _write(db, project, order)
    db.commit()
    db.refresh(project)
    return project
