"""Le contexte d'un appel au LLM, mis en XML : une balise par élément, le
contenu échappé. Le prompt système dit ce que chaque balise contient."""

from xml.sax.saxutils import escape

from sophia.application.companion import (
    DictationContext,
    IdeasContext,
    IntentionContext,
    ReplyContext,
    ResourcesContext,
    ReviewContext,
    ScopeContext,
    SkillFrame,
)


def _tag(name: str, value: str | None, **attrs: str | None) -> str:
    rendered = "".join(
        f' {k}="{escape(v, {chr(34): "&quot;"})}"' for k, v in attrs.items() if v
    )
    body = escape(value.strip()) if value and value.strip() else ""
    return f"<{name}{rendered}>{body}</{name}>"


def _section(name: str, value: str) -> str:
    return f"<{name}>\n{value}\n</{name}>"


def dictation_message(ctx: DictationContext) -> str:
    """Le message utilisateur d'un nettoyage de dictée : le contexte, puis la
    transcription, chacun dans sa balise (cf. `prompts/dictation.md`). Non
    échappé, contrairement aux autres : c'est la forme qu'éprouvent ses évals."""
    parts = [_section("savoir", ctx.skill)]
    if ctx.resource:
        parts.append(_section("ressource", ctx.resource))
    if ctx.resource_part:
        parts.append(_section("partie", ctx.resource_part))
    if ctx.note_titles:
        titles = "\n".join(f"- {t}" for t in ctx.note_titles)
        parts.append(_section("titres_des_notes", titles))
    parts.append(_section("transcription", ctx.transcript))
    return "\n\n".join(parts)


def review_xml(ctx: ReviewContext) -> str:
    comments = "\n".join(
        "<comment"
        f' kind="{c.kind}" status="{c.status}">\n'
        + _tag("quote", c.quote)
        + "\n"
        + _tag("message", c.message)
        + "".join("\n" + _tag("reply", r.body, author=r.author) for r in c.replies)
        + "\n</comment>"
        for c in ctx.existing_comments
    )
    return "\n".join(
        [
            _tag("skill", ctx.skill_title),
            _tag("intention", ctx.intention),
            _tag("scope", ctx.scope),
            _tag(
                "resource",
                ctx.resource_title,
                author=ctx.resource_author,
                reference=ctx.resource_reference,
            ),
            _tag("part", ctx.resource_part),
            _tag("notes", ctx.notes_text),
            _tag("source", ctx.source_text, kind=ctx.source_kind),
            f"<existing_comments>\n{comments}\n</existing_comments>"
            if comments
            else "<existing_comments></existing_comments>",
        ]
    )


def ideas_xml(ctx: IdeasContext) -> str:
    questions = "\n".join(
        "<question>\n"
        + _tag("prompt", q.prompt)
        + "\n"
        + _tag("answer", q.answer)
        + "\n</question>"
        for q in ctx.questions
    )
    return "\n".join(
        [
            _tag("skill", ctx.skill_title),
            _tag("intention", ctx.intention),
            _tag("scope", ctx.scope),
            _tag("section", ctx.section_text, title=ctx.section_title),
            f"<questions>\n{questions}\n</questions>"
            if questions
            else "<questions></questions>",
        ]
    )


def reply_xml(ctx: ReplyContext) -> str:
    thread = "\n".join(_tag("reply", r.body, author=r.author) for r in ctx.thread)
    return "\n".join(
        [
            _tag("skill", ctx.skill_title),
            _tag("resource", ctx.resource_title),
            _tag("part", ctx.resource_part),
            _tag("notes", ctx.notes_text),
            "<comment"
            f' kind="{ctx.comment_kind}">\n'
            + _tag("quote", ctx.comment_quote)
            + "\n"
            + _tag("message", ctx.comment_message)
            + "\n"
            + _tag("where_to_look", ctx.comment_where_to_look)
            + "\n</comment>",
            f"<thread>\n{thread}\n</thread>",
            _tag("source", ctx.source_text)
            if ctx.source_text
            else "<source>(non disponible)</source>",
        ]
    )


# --- Cadrer l'étude (#175) -------------------------------------------------------


def _block(name: str, body: str) -> str:
    return f"<{name}>\n{body}\n</{name}>" if body else f"<{name}></{name}>"


def _list(name: str, item: str, values: tuple[str, ...]) -> str:
    return _block(name, "\n".join(_tag(item, v) for v in values))


def frame_xml(frame: SkillFrame) -> str:
    """Le savoir et son cycle, commun aux trois temps du cadrage."""
    projects = "\n".join(
        "<project>\n"
        + _tag("title", o.title)
        + "\n"
        + _list("steps", "step", o.steps)
        + "\n</project>"
        for o in frame.projects
    )
    cycles = "\n".join(
        f'<past_cycle state="{c.state}">\n'
        + _tag("intention", c.intention)
        + "\n"
        + _tag("scope", c.scope)
        + "\n</past_cycle>"
        for c in frame.past_cycles
    )
    resources = "\n".join(
        _tag("resource", r.title, author=r.author, reference=r.reference)
        for r in frame.resources
    )
    tree = "\n".join(
        [
            _list("ancestors", "skill", frame.ancestors),
            _list("siblings", "skill", frame.siblings),
            _list("children", "skill", frame.children),
        ]
    )
    return "\n".join(
        [
            _tag("domain", frame.domain),
            _tag("skill", frame.skill_title),
            _tag("description", frame.skill_description),
            _block("tree", tree),
            _block("projects", projects),
            _block("past_cycles", cycles),
            _list("note_titles", "title", frame.note_titles),
            _tag("current_scope", frame.scope),
            _block("cycle_resources", resources),
        ]
    )


def intention_xml(ctx: IntentionContext) -> str:
    turns = "\n".join(
        "<turn>\n"
        + _tag("question", t.question)
        + "\n"
        + _tag("answer", t.answer)
        + "\n</turn>"
        for t in ctx.turns
    )
    return "\n".join(
        [
            frame_xml(ctx.frame),
            _tag("draft_intention", ctx.draft),
            _block("turns", turns),
            f"<questions_left>{ctx.questions_left}</questions_left>",
        ]
    )


def scope_xml(ctx: ScopeContext) -> str:
    return "\n".join([frame_xml(ctx.frame), _tag("intention", ctx.intention)])


def resources_xml(ctx: ResourcesContext) -> str:
    return "\n".join(
        [
            frame_xml(ctx.frame),
            _tag("intention", ctx.frame.intention),
            _tag("preferences", ctx.preferences),
            _list("exclude", "url", ctx.exclude),
        ]
    )
