"""Le port indisponible — même adaptateur pour le LLM et la transcription.

Il porte son motif et répond à `availability()` ; chaque méthode d'usage des
deux ports (`application/companion.py`) y est écrite explicitement et lève
`CompanionUnavailable` : le typage vérifie qu'il satisfait les deux
`Protocol`, et une méthode oubliée se voit au lieu d'être avalée.
"""

from typing import NoReturn

from sophia.application.companion import (
    Availability,
    CentralIdea,
    CompanionUnavailable,
    DictationContext,
    IdeasContext,
    IntentionContext,
    ReplyContext,
    ResourcesContext,
    ResourceSearch,
    ReviewContext,
    ReviewFinding,
    ScopeContext,
)
from sophia.domain.framing import IntentionTurn, ScopeTag


class Unavailable:
    def __init__(self, reason: str) -> None:
        self.reason = reason

    def availability(self) -> Availability:
        return Availability(available=False, reason=self.reason)

    def _refuse(self) -> NoReturn:
        raise CompanionUnavailable(self.reason)

    # --- Transcriber -----------------------------------------------------------

    def transcribe(self, pcm: bytes, hint: str) -> str:
        self._refuse()

    # --- Companion ---------------------------------------------------------------

    def clean_dictation(self, ctx: DictationContext) -> list[str]:
        self._refuse()

    def review_notes(self, ctx: ReviewContext) -> list[ReviewFinding]:
        self._refuse()

    def central_ideas(self, ctx: IdeasContext) -> list[CentralIdea]:
        self._refuse()

    def reply_in_thread(self, ctx: ReplyContext) -> str:
        self._refuse()

    def intention_turn(self, ctx: IntentionContext) -> IntentionTurn:
        self._refuse()

    def propose_scope(self, ctx: ScopeContext) -> list[ScopeTag]:
        self._refuse()

    def search_resources(self, ctx: ResourcesContext) -> ResourceSearch:
        self._refuse()
