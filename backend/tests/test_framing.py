"""Cadrer l'étude (#175) : garde-fous, routes, contexte envoyé, préférences.

Faux port du compagnon par la dépendance : aucun appel réseau, aucun appel à
l'API. Les helpers de l'adaptateur sont éprouvés sur des blocs simulés.
"""

import uuid
from dataclasses import dataclass, field
from datetime import date
from types import SimpleNamespace

import pydantic
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from sophia.api.deps import get_companion
from sophia.application.companion import (
    Availability,
    CompanionFailed,
    IntentionContext,
    ResourcesContext,
    ResourceSearch,
    ScopeContext,
)
from sophia.domain.framing import (
    DEFER_SUGGESTION,
    MAX_INTENTION_CHARS,
    MAX_RESOURCES,
    MAX_SCOPE_TAGS,
    MAX_SUGGESTIONS,
    OPENING_QUESTION,
    REOPENING_QUESTION,
    IntentionTurn,
    ResourceProposal,
    ScopeTag,
    fit_intention,
    keep_intention_turn,
    keep_resources,
    keep_scope_tags,
    keep_suggestions,
    normalize_url,
    parse_scope,
    questions_left,
    scope_text,
)
from sophia.infrastructure.llm.anthropic_companion import (
    RESOURCES_FAILED,
    AnthropicCompanion,
    proposed_resources,
    search_result_urls,
)
from sophia.infrastructure.llm.context import intention_xml
from sophia.infrastructure.models import (
    AcquisitionPlan,
    Project,
    ProjectDomain,
    ProjectStep,
    Skill,
)
from sophia.infrastructure.unavailable import Unavailable
from sophia.main import app

# --- Garde-fous : intention ------------------------------------------------------


def test_questions_left_counts_generated_questions_after_the_opening():
    assert questions_left(0) == 5
    assert questions_left(1) == 5  # l'ouverture ne compte pas
    assert questions_left(3) == 3
    assert questions_left(6) == 0
    assert questions_left(9) == 0


def test_suggestions_are_trimmed_deduplicated_short_and_bounded():
    kept = keep_suggestions(
        ["  Finir le point ", "finir le point", "", "x" * 81, "A", "B", "C", "D", "E"]
    )
    assert kept == ["Finir le point", "A", "B", "C", DEFER_SUGGESTION]
    assert len(kept) == MAX_SUGGESTIONS


def test_deferring_to_sophia_is_always_offered_once_and_last():
    assert keep_suggestions([]) == [DEFER_SUGGESTION]
    assert keep_suggestions(["je ne sais pas, propose-moi", "A"]) == [
        "A",
        DEFER_SUGGESTION,
    ]


def test_intention_fits_the_field():
    assert fit_intention("  Une   volée sûre ") == "Une volée sûre"
    long = ("mot " * 80).strip()
    fitted = fit_intention(long)
    assert len(fitted) <= MAX_INTENTION_CHARS
    assert fitted.endswith("mot…")
    assert fit_intention("   ") is None


def test_a_turn_asks_the_next_question_with_its_suggestions():
    turn = keep_intention_turn(
        IntentionTurn("Pour finir le point ?", ["Finir", "Finir"], "Une volée", False),
        previous=None,
        answered=1,
    )
    assert turn == IntentionTurn(
        "Pour finir le point ?", ["Finir", DEFER_SUGGESTION], "Une volée", False
    )


def test_empty_reformulation_keeps_the_previous_draft():
    turn = keep_intention_turn(
        IntentionTurn("Et ensuite ?", [], "  ", False), previous="Brouillon", answered=2
    )
    assert turn.intention == "Brouillon"


@pytest.mark.parametrize(
    ("raw", "answered"),
    [
        (IntentionTurn("Encore ?", ["a"], "Fini", True), 2),  # le modèle a fini
        (IntentionTurn(None, ["a"], "Fini", False), 2),  # pas de question
        (IntentionTurn("Encore ?", ["a"], "Fini", False), 6),  # plafond atteint
    ],
)
def test_done_drops_question_and_suggestions(raw, answered):
    assert keep_intention_turn(raw, previous=None, answered=answered) == IntentionTurn(
        None, [], "Fini", True
    )


# --- Garde-fous : périmètre --------------------------------------------------------


def test_scope_tags_are_cleaned_deduplicated_and_bounded():
    tags = keep_scope_tags(
        [
            ScopeTag(" Placement  sous le lob ", True),
            ScopeTag("placement sous le lob", False),
            ScopeTag("", True),
            ScopeTag("x" * 61, True),
            ScopeTag("Cibles ; vitre", False),
            *[ScopeTag(f"Partie {i}", True) for i in range(12)],
        ]
    )
    assert tags[0] == ScopeTag("Placement sous le lob", True)
    assert tags[1] == ScopeTag("Cibles , vitre", False)
    assert len(tags) == MAX_SCOPE_TAGS


def test_scope_text_writes_retained_then_the_edges():
    tags = [
        ScopeTag("Placement sous le lob", True),
        ScopeTag("Volée côté revers", False),
        ScopeTag("Frappe : effet latéral, coupé", True),
        ScopeTag("Smash par 3", False),
    ]
    text = scope_text(tags)
    assert text == (
        "Placement sous le lob\n"
        "Frappe : effet latéral, coupé\n"
        "Hors de ce cycle : Volée côté revers ; Smash par 3"
    )
    assert parse_scope(text) == [tags[0], tags[2], tags[1], tags[3]]


def test_nothing_retained_is_no_scope():
    assert scope_text([ScopeTag("Smash par 3", False)]) is None
    assert scope_text([]) is None


def test_parse_scope_reads_a_hand_written_scope_line_by_line():
    assert parse_scope("- Le geste\n\n• L'usage\n") == [
        ScopeTag("Le geste", True),
        ScopeTag("L'usage", True),
    ]
    assert parse_scope(None) == []


# --- Garde-fous : ressources -------------------------------------------------------


def proposal(url: str, **kw) -> ResourceProposal:
    return ResourceProposal(
        title=kw.get("title", "Volée : the complete guide"),
        url=url,
        author=kw.get("author", "The Tennis School"),
        why_trust=kw.get("why_trust", "coachs de joueurs du circuit pro"),
        kind=kw.get("kind", "video"),
        duration=kw.get("duration", "14 min"),
        date=kw.get("date", "mars 2025"),
        covers=kw.get("covers", "Placement, Frappe"),
    )


def test_normalize_url():
    assert normalize_url("http://www.Example.com/a/#x") == "https://example.com/a"
    assert normalize_url("https://youtube.com/watch?v=AbC") == (
        "https://youtube.com/watch?v=AbC"
    )
    assert normalize_url(" pas un lien ") == "pas un lien"


def test_only_links_from_the_search_results_are_kept():
    kept = keep_resources(
        [
            proposal("https://inventee.example/video"),
            proposal("https://www.tennis.example/volee/"),
        ],
        found_urls=["https://tennis.example/volee"],
        exclude=[],
    )
    assert [k.url for k in kept] == ["https://www.tennis.example/volee/"]


def test_excluded_duplicate_and_incomplete_proposals_are_dropped():
    found = [f"https://s.example/{i}" for i in range(12)]
    kept = keep_resources(
        [
            proposal("https://s.example/0"),  # déjà ajoutée
            proposal("https://s.example/1"),
            proposal("https://s.example/1/"),  # doublon
            proposal("https://s.example/2", title=" "),
            proposal("https://s.example/3", why_trust=""),
            proposal("https://s.example/4", kind="podcast", author=" ", covers=""),
            *[proposal(u) for u in found[5:]],
        ],
        found_urls=found,
        exclude=["http://s.example/0"],
    )
    assert kept[0].url == "https://s.example/1"
    assert kept[1].url == "https://s.example/4"
    assert (kept[1].kind, kept[1].author, kept[1].covers) == (None, None, None)
    assert len(kept) == MAX_RESOURCES


# --- Adaptateur : les blocs de la recherche ------------------------------------------


def test_search_result_urls_reads_only_successful_search_results():
    content = [
        SimpleNamespace(type="text", text="..."),
        SimpleNamespace(
            type="web_search_tool_result",
            content=[SimpleNamespace(url="https://a.example"), SimpleNamespace(url="")],
        ),
        SimpleNamespace(
            type="web_search_tool_result",
            content=SimpleNamespace(error_code="max_uses_exceeded"),
        ),
        SimpleNamespace(type="web_fetch_tool_result", content=SimpleNamespace()),
    ]
    assert search_result_urls(content) == ["https://a.example"]


def _tool_use(payload: dict) -> SimpleNamespace:
    return SimpleNamespace(type="tool_use", name="propose_resources", input=payload)


def test_proposed_resources_reads_the_tool_call():
    item = {
        "title": "T",
        "url": "https://a.example",
        "author": None,
        "why_trust": "officielle",
        "kind": "text",
        "duration": None,
        "date": None,
        "covers": None,
    }
    assert proposed_resources([_tool_use({"resources": [item]})]) == [
        ResourceProposal(**item)
    ]
    assert proposed_resources([SimpleNamespace(type="text")]) is None
    with pytest.raises(pydantic.ValidationError):
        proposed_resources([_tool_use({"resources": [{"title": "T"}]})])


def _response(stop_reason: str, content: list) -> SimpleNamespace:
    return SimpleNamespace(
        stop_reason=stop_reason,
        model="claude-opus-5-5",
        content=content,
        usage=SimpleNamespace(
            input_tokens=100,
            output_tokens=20,
            cache_read_input_tokens=0,
            cache_creation_input_tokens=0,
            server_tool_use=SimpleNamespace(web_search_requests=1),
        ),
    )


class _FakeMessages:
    def __init__(self, responses: list) -> None:
        self.responses = responses
        self.requests: list[dict] = []

    def create(self, **request):
        self.requests.append(request)
        return self.responses.pop(0)


def _adapter(tmp_path, responses: list) -> tuple[AnthropicCompanion, _FakeMessages]:
    from pydantic import SecretStr

    adapter = AnthropicCompanion(
        api_key=SecretStr("sk-test"),
        model_dictation="claude-haiku-5-5",
        model_review="claude-opus-5-5",
        log_path=tmp_path / "llm_calls.jsonl",
    )
    messages = _FakeMessages(responses)
    adapter._client = SimpleNamespace(beta=SimpleNamespace(messages=messages))
    return adapter, messages


def _search_ctx() -> ResourcesContext:
    from sophia.application.companion import SkillFrame

    return ResourcesContext(
        frame=SkillFrame(skill_title="Volée", skill_description=None, domain="Tennis"),
        preferences="Des coachs",
    )


def test_search_resumes_a_paused_turn_and_logs_once(tmp_path):
    item = {
        "title": "T",
        "url": "https://b.example",
        "author": None,
        "why_trust": "coach pro",
        "kind": "video",
        "duration": None,
        "date": None,
        "covers": None,
    }
    first = [
        SimpleNamespace(
            type="web_search_tool_result",
            content=[SimpleNamespace(url="https://a.example")],
        )
    ]
    second = [
        SimpleNamespace(
            type="web_search_tool_result",
            content=[SimpleNamespace(url="https://b.example")],
        ),
        _tool_use({"resources": [item]}),
    ]
    adapter, messages = _adapter(
        tmp_path, [_response("pause_turn", first), _response("tool_use", second)]
    )
    search = adapter.search_resources(_search_ctx())
    assert search.found_urls == ("https://a.example", "https://b.example")
    assert search.proposals == [ResourceProposal(**item)]
    # La reprise renvoie le tour mis en pause, sans message « continue ».
    resumed = messages.requests[1]["messages"]
    assert [m["role"] for m in resumed] == ["user", "assistant"]
    assert resumed[1]["content"] == first
    tools = {t["name"] for t in messages.requests[0]["tools"]}
    assert tools == {"web_search", "web_fetch", "propose_resources"}
    lines = (tmp_path / "llm_calls.jsonl").read_text(encoding="utf-8").splitlines()
    assert len(lines) == 1
    assert '"usage": "resources"' in lines[0]
    assert '"input_tokens": 200' in lines[0]


@pytest.mark.parametrize(
    "response",
    [
        _response("end_turn", [SimpleNamespace(type="text", text="Rien.")]),
        _response("refusal", []),
        _response("max_tokens", []),
    ],
)
def test_search_without_proposals_fails(tmp_path, response):
    adapter, _ = _adapter(tmp_path, [response])
    with pytest.raises(CompanionFailed) as raised:
        adapter.search_resources(_search_ctx())
    assert raised.value.reason == RESOURCES_FAILED


# --- Routes ------------------------------------------------------------------------


@dataclass
class FakeCompanion:
    turn: IntentionTurn = field(
        default_factory=lambda: IntentionTurn(
            "Pour finir le point, ou garder le filet ?",
            ["Finir le point", "Garder le filet"],
            "Une volée sûre en match.",
            False,
        )
    )
    tags: list[ScopeTag] = field(default_factory=list)
    search: ResourceSearch = field(
        default_factory=lambda: ResourceSearch(proposals=[], found_urls=())
    )
    fail: bool = False
    calls: list = field(default_factory=list)

    def availability(self) -> Availability:
        return Availability(available=True)

    def _call(self, ctx):
        self.calls.append(ctx)
        if self.fail:
            raise CompanionFailed("Échec.")

    def intention_turn(self, ctx: IntentionContext) -> IntentionTurn:
        self._call(ctx)
        return self.turn

    def propose_scope(self, ctx: ScopeContext) -> list[ScopeTag]:
        self._call(ctx)
        return list(self.tags)

    def search_resources(self, ctx: ResourcesContext) -> ResourceSearch:
        self._call(ctx)
        return self.search


@pytest.fixture
def companion() -> FakeCompanion:
    fake = FakeCompanion()
    app.dependency_overrides[get_companion] = lambda: fake
    return fake


def _setup(client: TestClient, db: Session) -> dict:
    """Un domaine Tennis : Coups > Volée (sœur : Chandelle ; enfant : Côté
    revers), un ancien cycle, un cycle ouvert sur un projet et son étape,
    une ressource dans le cycle, des notes titrées."""
    d = client.post("/domains", json={"name": "Tennis"}).json()["id"]
    root = client.post(f"/domains/{d}/skills", json={"name": "Coups"}).json()["id"]
    s = client.post(
        f"/domains/{d}/skills", json={"name": "Volée", "parent_skill_id": root}
    ).json()["id"]
    client.post(
        f"/domains/{d}/skills", json={"name": "Chandelle", "parent_skill_id": root}
    )
    client.post(
        f"/domains/{d}/skills", json={"name": "Côté revers", "parent_skill_id": s}
    )
    old = client.post(
        f"/skills/{s}/plans", json={"target_level": "Découvrir le geste"}
    ).json()["id"]
    client.post(f"/plans/{old}/abandon")
    plan = client.post(f"/skills/{s}/plans", json={}).json()["id"]
    client.post(
        f"/skills/{s}/resources",
        json={
            "title": "Guide",
            "reference": "https://tennis.example/guide",
            "plan_id": plan,
        },
    )
    client.put(
        f"/skills/{s}/notes",
        json={
            "doc": {
                "type": "doc",
                "content": [
                    {
                        "type": "heading",
                        "attrs": {"level": 1},
                        "content": [{"type": "text", "text": "Le placement"}],
                    }
                ],
            }
        },
    )
    skill = db.get(Skill, uuid.UUID(s))
    project = Project(
        domain_links=[ProjectDomain(domain_id=uuid.UUID(d), position=0)],
        title="Tournoi du club",
        start_at=date(2026, 10, 1),
        due_at=date(2026, 12, 1),
    )
    project.steps = [
        ProjectStep(title="Les coups", order=0, skills=[skill]),
        ProjectStep(title="Le service", order=1),
    ]
    db.add(project)
    cycle = db.get(AcquisitionPlan, uuid.UUID(plan))
    cycle.projects.append(project)
    db.commit()
    return {"domain": d, "skill": s, "plan": plan}


def test_the_opening_without_intention_asks_what_this_cycle_is_for(
    client: TestClient, db: Session, companion: FakeCompanion
):
    ids = _setup(client, db)
    response = client.post(
        f"/plans/{ids['plan']}/framing/intention", json={"turns": []}
    )
    assert response.json()["question"] == OPENING_QUESTION
    assert response.json()["intention"] is None


def test_opening_turn_is_fixed_with_suggestions_for_the_skill(
    client: TestClient, db: Session, companion: FakeCompanion
):
    ids = _setup(client, db)
    response = client.post(
        f"/plans/{ids['plan']}/framing/intention",
        json={"turns": [], "intention": "Existante"},
    )
    assert response.status_code == 200
    assert response.json() == {
        "question": REOPENING_QUESTION,
        "suggestions": ["Finir le point", "Garder le filet", DEFER_SUGGESTION],
        "intention": "Existante",
        "done": False,
    }
    frame = companion.calls[0].frame
    assert frame.skill_title == "Volée"
    assert frame.domain == "Tennis"
    assert frame.ancestors == ("Coups",)
    assert frame.siblings == ("Chandelle",)
    assert frame.children == ("Côté revers",)
    assert [(o.title, o.steps) for o in frame.projects] == [
        ("Tournoi du club", ("Les coups",))
    ]
    assert [(c.state, c.intention) for c in frame.past_cycles] == [
        ("abandoned", "Découvrir le geste")
    ]
    assert frame.note_titles == ("Le placement",)
    assert [r.reference for r in frame.resources] == ["https://tennis.example/guide"]
    assert companion.calls[0].draft == "Existante"


def test_next_turn_reformulates_and_asks(
    client: TestClient, db: Session, companion: FakeCompanion
):
    ids = _setup(client, db)
    turns = [{"question": OPENING_QUESTION, "answer": "Une volée sûre"}]
    response = client.post(
        f"/plans/{ids['plan']}/framing/intention",
        json={"turns": turns, "intention": None},
    )
    assert response.json() == {
        "question": "Pour finir le point, ou garder le filet ?",
        "suggestions": ["Finir le point", "Garder le filet", DEFER_SUGGESTION],
        "intention": "Une volée sûre en match.",
        "done": False,
    }
    ctx = companion.calls[0]
    assert ctx.questions_left == 5
    assert "<answer>Une volée sûre</answer>" in intention_xml(ctx)
    assert "<questions_left>5</questions_left>" in intention_xml(ctx)


def test_at_the_cap_the_turn_is_done(
    client: TestClient, db: Session, companion: FakeCompanion
):
    ids = _setup(client, db)
    turns = [{"question": f"Q{i}", "answer": f"R{i}"} for i in range(6)]
    response = client.post(
        f"/plans/{ids['plan']}/framing/intention", json={"turns": turns}
    )
    assert response.json() == {
        "question": None,
        "suggestions": [],
        "intention": "Une volée sûre en match.",
        "done": True,
    }
    assert companion.calls[0].questions_left == 0
    # Au-delà du plafond : refusé.
    too_many = [*turns, {"question": "Q", "answer": "R"}]
    assert (
        client.post(
            f"/plans/{ids['plan']}/framing/intention", json={"turns": too_many}
        ).status_code
        == 422
    )


def test_scope_proposes_tags(client: TestClient, db: Session, companion: FakeCompanion):
    ids = _setup(client, db)
    companion.tags = [
        ScopeTag("Placement sous le lob", True),
        ScopeTag("Côté revers", False),
        ScopeTag("placement sous le lob", True),
    ]
    response = client.post(
        f"/plans/{ids['plan']}/framing/scope", json={"intention": "Brouillon"}
    )
    assert response.status_code == 200
    assert response.json() == {
        "tags": [
            {"label": "Placement sous le lob", "in_cycle": True},
            {"label": "Côté revers", "in_cycle": False},
        ]
    }
    assert companion.calls[0].intention == "Brouillon"


def test_scope_falls_back_to_the_cycle_intention(
    client: TestClient, db: Session, companion: FakeCompanion
):
    ids = _setup(client, db)
    client.patch(f"/plans/{ids['plan']}", json={"target_level": "Celle du cycle"})
    client.post(f"/plans/{ids['plan']}/framing/scope", json={})
    assert companion.calls[0].intention == "Celle du cycle"


def test_resources_keep_only_searched_links_and_use_domain_preferences(
    client: TestClient, db: Session, companion: FakeCompanion
):
    ids = _setup(client, db)
    client.patch(
        f"/domains/{ids['domain']}",
        json={"resource_preferences": "Des coachs de joueurs pro"},
    )
    companion.search = ResourceSearch(
        proposals=[
            proposal("https://inventee.example/x"),
            proposal("https://tennis.example/guide"),  # déjà dans le cycle
            proposal("https://tennis.example/deja-proposee"),
            proposal("https://tennis.example/volee", kind="text", duration=None),
        ],
        found_urls=(
            "https://tennis.example/guide",
            "https://tennis.example/deja-proposee",
            "https://tennis.example/volee",
        ),
    )
    response = client.post(
        f"/plans/{ids['plan']}/framing/resources",
        json={"preferences": None, "exclude": ["https://tennis.example/deja-proposee"]},
    )
    assert response.status_code == 200
    assert response.json() == {
        "resources": [
            {
                "title": "Volée : the complete guide",
                "url": "https://tennis.example/volee",
                "author": "The Tennis School",
                "why_trust": "coachs de joueurs du circuit pro",
                "kind": "text",
                "duration": None,
                "date": "mars 2025",
                "covers": "Placement, Frappe",
            }
        ]
    }
    ctx = companion.calls[0]
    assert ctx.preferences == "Des coachs de joueurs pro"
    assert ctx.exclude == ("https://tennis.example/deja-proposee",)


def test_resources_preferences_from_the_screen_win(
    client: TestClient, db: Session, companion: FakeCompanion
):
    ids = _setup(client, db)
    client.patch(f"/domains/{ids['domain']}", json={"resource_preferences": "Domaine"})
    client.post(
        f"/plans/{ids['plan']}/framing/resources", json={"preferences": "Écran"}
    )
    assert companion.calls[0].preferences == "Écran"
    client.post(f"/plans/{ids['plan']}/framing/resources", json={"preferences": "  "})
    assert companion.calls[1].preferences is None


@pytest.mark.parametrize("action", ["intention", "scope", "resources"])
def test_unknown_plan_is_404(client: TestClient, companion: FakeCompanion, action: str):
    response = client.post(f"/plans/{uuid.uuid4()}/framing/{action}", json={})
    assert response.status_code == 404
    assert companion.calls == []


@pytest.mark.parametrize("action", ["intention", "scope", "resources"])
def test_unavailable_companion_is_503(client: TestClient, db: Session, action: str):
    ids = _setup(client, db)
    app.dependency_overrides[get_companion] = lambda: Unavailable("Pas de clé.")
    response = client.post(f"/plans/{ids['plan']}/framing/{action}", json={})
    assert response.status_code == 503
    assert response.json() == {"detail": "Pas de clé."}


@pytest.mark.parametrize("action", ["intention", "scope", "resources"])
def test_failed_companion_is_502(
    client: TestClient, db: Session, companion: FakeCompanion, action: str
):
    ids = _setup(client, db)
    companion.fail = True
    response = client.post(f"/plans/{ids['plan']}/framing/{action}", json={})
    assert response.status_code == 502


def test_framing_writes_nothing(
    client: TestClient, db: Session, companion: FakeCompanion
):
    ids = _setup(client, db)
    turns = [{"question": OPENING_QUESTION, "answer": "Une volée sûre"}]
    client.post(f"/plans/{ids['plan']}/framing/intention", json={"turns": turns})
    client.post(f"/plans/{ids['plan']}/framing/scope", json={})
    plan = db.get(AcquisitionPlan, uuid.UUID(ids["plan"]))
    db.refresh(plan)
    assert plan.target_level is None
    assert plan.scope is None


# --- Préférences du domaine ---------------------------------------------------------


def test_domain_resource_preferences_read_and_written(client: TestClient):
    d = client.post("/domains", json={"name": "Tennis"}).json()
    assert d["resource_preferences"] is None
    patched = client.patch(
        f"/domains/{d['id']}",
        json={"resource_preferences": " Des coachs de joueurs pro "},
    ).json()
    assert patched["resource_preferences"] == "Des coachs de joueurs pro"
    assert client.get(f"/domains/{d['id']}").json()["resource_preferences"] == (
        "Des coachs de joueurs pro"
    )
    cleared = client.patch(
        f"/domains/{d['id']}", json={"resource_preferences": "  "}
    ).json()
    assert cleared["resource_preferences"] is None
