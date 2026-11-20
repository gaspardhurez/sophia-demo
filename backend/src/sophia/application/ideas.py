"""Use case des idées centrales d'une section des notes (#173).

« Préparer les questions », interrupteur « 🧠 Suggestions » : pour une section
des notes du savoir, Sophia propose ce qu'il faut savoir sans les notes et
que les questions de la section ne couvrent pas encore — l'idée, pourquoi
elle compte, un angle ; jamais la question rédigée (c'est l'utilisateur qui
l'écrit).

**La section arrive de l'écran**, en fragment de document TipTap (ses nœuds
de premier rang, son titre compris) : c'est l'écran qui découpe
(`pages/skill-notes/lib/question-sections.ts`), sur le document qu'il est en
train d'éditer — un découpage refait ici porterait sur le document enregistré,
en retard de la dernière frappe, et dupliquerait la règle. Les questions, elles,
se lisent en base, d'après les nœuds `question` du fragment : leur texte fait
foi côté serveur.

**Rien n'est persisté** : ni la demande ni les idées. « Pas besoin » écarte
une carte le temps de l'écran ; « Écrire la question » crée une question par
le chemin habituel.
"""

from sophia.application.companion import (
    Companion,
    CompanionUnavailable,
    ExistingQuestion,
    IdeasContext,
)
from sophia.domain.ideas import (
    Idea,
    IdeasNothingToSort,
    KeptIdea,
    keep_ideas,
    section_question_ids,
    section_text,
    section_title,
)
from sophia.domain.notes import AnswerForm
from sophia.infrastructure.models import AcquisitionPlan, NoteQuestion, PlanState, Skill


def _plan_of(skill: Skill) -> AcquisitionPlan | None:
    """Le cycle du savoir : celui en cours s'il y en a un, sinon le plus
    récent (même règle que la vérification)."""
    active = [p for p in skill.plans if p.state is PlanState.active]
    if active:
        return active[0]
    return max(skill.plans, key=lambda p: p.created_at, default=None)


def _existing(question: NoteQuestion) -> ExistingQuestion:
    if question.form is AnswerForm.list:
        points = [p["text"].strip() for p in question.points if p["text"].strip()]
        answer = " ; ".join(points) or None
    else:
        answer = (question.answer or "").strip() or None
    return ExistingQuestion(prompt=question.prompt.strip(), answer=answer)


def propose_ideas(skill: Skill, section: dict, companion: Companion) -> list[KeptIdea]:
    """Les idées centrales de la section, après garde-fous : trois au plus,
    une liste vide s'il n'y a rien à ajouter. Section sans texte → 422 ;
    compagnon indisponible → 503, avant tout appel."""
    text = section_text(section)
    if not text.strip():
        raise IdeasNothingToSort(str(skill.id))
    availability = companion.availability()
    if not availability.available:
        raise CompanionUnavailable(availability.reason or "Compagnon indisponible.")

    # Seules les questions du savoir comptent, dans l'ordre de la section ; une
    # question encore sans énoncé ne couvre rien.
    by_id = {q.id: q for q in skill.note_questions}
    questions = tuple(
        _existing(by_id[qid])
        for qid in section_question_ids(section)
        if qid in by_id and by_id[qid].prompt.strip()
    )
    plan = _plan_of(skill)
    ideas = companion.central_ideas(
        IdeasContext(
            skill_title=skill.name,
            intention=plan.target_level if plan else None,
            scope=plan.scope if plan else None,
            section_title=section_title(section),
            section_text=text,
            questions=questions,
        )
    )
    return keep_ideas(
        [Idea(i.idea, i.reason, i.angle, i.quote) for i in ideas], section
    )
