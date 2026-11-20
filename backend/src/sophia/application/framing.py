"""Use cases de « Cadrer l'étude » (#175) : les propositions du compagnon.

Trois temps, chacun passable, chacun une route (`api/framing.py`) :

1. **Intention** — `intention_turn` : sans échange, la question d'ouverture
   fixe et ses réponses proposées ; ensuite, à chaque réponse, l'intention
   reformulée et la question suivante, générée pour ce savoir, jusqu'à ce que
   le compagnon en sache assez ou au plafond (`domain/framing.py`) ;
2. **Périmètre** — `propose_scope` : les parties possibles du savoir, dans
   ou hors de ce cycle ;
3. **Ressources** — `search_resources` : une vraie recherche web, dont on ne
   garde que les liens tirés des résultats.

**Rien n'est écrit ici** : ce qui est validé s'écrit par les routes
existantes — l'intention et le périmètre par `PATCH /plans/{id}`
(`target_level`, `scope` : `domain.framing.scope_text`), les ressources par
celles du cycle, les préférences par `PATCH /domains/{id}`. Le compagnon
indisponible → 503, avant tout appel.
"""

from sophia.application.companion import (
    Companion,
    CompanionUnavailable,
    CycleResource,
    FramingProject,
    IntentionContext,
    PastCycle,
    QuestionAnswer,
    ResourcesContext,
    ScopeContext,
    SkillFrame,
)
from sophia.domain.framing import (
    IntentionTurn,
    ResourceProposal,
    ScopeTag,
    keep_intention_turn,
    keep_resources,
    keep_scope_tags,
    opening_turn,
    questions_left,
)
from sophia.domain.notes import heading_titles
from sophia.infrastructure.models import AcquisitionPlan, Skill


def _require(companion: Companion) -> None:
    availability = companion.availability()
    if not availability.available:
        raise CompanionUnavailable(availability.reason or "Compagnon indisponible.")


def _ancestors(skill: Skill) -> tuple[str, ...]:
    chain: list[str] = []
    node = skill.parent
    while node is not None:
        chain.append(node.name)
        node = node.parent
    return tuple(reversed(chain))


def _siblings(skill: Skill) -> tuple[str, ...]:
    pool = (
        skill.parent.children
        if skill.parent is not None
        else [s for s in skill.domain.skills if s.parent_skill_id is None]
    )
    return tuple(
        s.name for s in sorted(pool, key=lambda s: s.order) if s.id != skill.id
    )


def _projects(plan: AcquisitionPlan) -> tuple[FramingProject, ...]:
    skill = plan.skill
    return tuple(
        FramingProject(
            title=o.title,
            steps=tuple(
                step.title
                for step in sorted(o.steps, key=lambda st: st.order)
                if any(s.id == skill.id for s in step.skills)
            ),
        )
        for o in plan.projects
    )


def skill_frame(plan: AcquisitionPlan) -> SkillFrame:
    """Ce que le compagnon reçoit du savoir et du cycle — des valeurs,
    jamais d'objet ORM."""
    skill = plan.skill
    others = sorted(
        (p for p in skill.plans if p.id != plan.id), key=lambda p: p.created_at
    )
    return SkillFrame(
        skill_title=skill.name,
        skill_description=skill.description,
        domain=skill.domain.name,
        ancestors=_ancestors(skill),
        siblings=_siblings(skill),
        children=tuple(c.name for c in sorted(skill.children, key=lambda c: c.order)),
        projects=_projects(plan),
        past_cycles=tuple(
            PastCycle(state=p.state.value, intention=p.target_level, scope=p.scope)
            for p in others
            if p.target_level or p.scope
        ),
        note_titles=tuple(heading_titles(skill.notes.doc if skill.notes else None)),
        intention=plan.target_level,
        scope=plan.scope,
        resources=tuple(
            CycleResource(
                title=link.resource.title,
                author=link.resource.author,
                reference=link.resource.reference,
            )
            for link in plan.resource_links
        ),
    )


# --- 1. Intention ----------------------------------------------------------------


def intention_turn(
    plan: AcquisitionPlan,
    turns: list[tuple[str, str]],
    intention: str | None,
    companion: Companion,
) -> IntentionTurn:
    """Le tour suivant de l'intention. `turns` : les échanges `(question,
    réponse)` depuis l'ouverture ; `intention` : celle du cycle ou le
    brouillon courant, d'où la relance part."""
    _require(companion)
    answered = len(turns)
    raw = companion.intention_turn(
        IntentionContext(
            frame=skill_frame(plan),
            turns=tuple(QuestionAnswer(q, a) for q, a in turns),
            draft=intention,
            questions_left=questions_left(answered),
        )
    )
    if not turns:
        return opening_turn(intention, raw.suggestions)
    return keep_intention_turn(raw, previous=intention, answered=answered)


# --- 2. Périmètre ------------------------------------------------------------------


def propose_scope(
    plan: AcquisitionPlan, intention: str | None, companion: Companion
) -> list[ScopeTag]:
    """Les parties possibles du savoir, dans ou hors de ce cycle. `intention`
    : celle de l'écran (le brouillon) ; nulle, celle du cycle."""
    _require(companion)
    tags = companion.propose_scope(
        ScopeContext(frame=skill_frame(plan), intention=intention or plan.target_level)
    )
    return keep_scope_tags(tags)


# --- 3. Ressources -----------------------------------------------------------------


def search_resources(
    plan: AcquisitionPlan,
    preferences: str | None,
    exclude: list[str],
    companion: Companion,
) -> list[ResourceProposal]:
    """Des ressources pour le cycle, d'une vraie recherche web. `preferences`
    : celles de l'écran ; nulles, celles gardées au domaine. `exclude` : les
    liens déjà ajoutés ou déjà proposés ; ceux du cycle s'y ajoutent. Une
    liste vide : rien de solide."""
    _require(companion)
    frame = skill_frame(plan)
    if preferences is None:
        preferences = plan.skill.domain.resource_preferences
    in_cycle = [r.reference for r in frame.resources if r.reference]
    search = companion.search_resources(
        ResourcesContext(
            frame=frame,
            preferences=preferences.strip() or None if preferences else None,
            exclude=tuple(exclude),
        )
    )
    return keep_resources(
        search.proposals,
        found_urls=list(search.found_urls),
        exclude=[*exclude, *in_cycle],
    )
