"""Deux compagnons l'un derrière l'autre : l'abonnement, puis l'API.

Chaque usage essaie le premier ; s'il échoue (`CompanionFailed` : limite
d'usage, délai, processus mort, sortie illisible…), le second refait l'appel
— quand il existe. Sinon l'échec du premier remonte tel quel, avec son
motif. Chacun écrit sa ligne au journal : l'échec du premier, puis l'appel
du second.
"""

from collections.abc import Callable
from typing import TypeVar

from sophia.application.companion import (
    Availability,
    CentralIdea,
    Companion,
    CompanionFailed,
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

T = TypeVar("T")


class FallbackCompanion:
    def __init__(self, primary: Companion, secondary: Companion | None) -> None:
        self.primary = primary
        self.secondary = secondary

    def availability(self) -> Availability:
        first = self.primary.availability()
        if first.available or self.secondary is None:
            return first
        return self.secondary.availability()

    def _call(self, call: Callable[[Companion], T]) -> T:
        try:
            return call(self.primary)
        except CompanionFailed:
            if self.secondary is None:
                raise
            return call(self.secondary)

    def clean_dictation(self, ctx: DictationContext) -> list[str]:
        return self._call(lambda c: c.clean_dictation(ctx))

    def review_notes(self, ctx: ReviewContext) -> list[ReviewFinding]:
        return self._call(lambda c: c.review_notes(ctx))

    def central_ideas(self, ctx: IdeasContext) -> list[CentralIdea]:
        return self._call(lambda c: c.central_ideas(ctx))

    def reply_in_thread(self, ctx: ReplyContext) -> str:
        return self._call(lambda c: c.reply_in_thread(ctx))

    def intention_turn(self, ctx: IntentionContext) -> IntentionTurn:
        return self._call(lambda c: c.intention_turn(ctx))

    def propose_scope(self, ctx: ScopeContext) -> list[ScopeTag]:
        return self._call(lambda c: c.propose_scope(ctx))

    def search_resources(self, ctx: ResourcesContext) -> ResourceSearch:
        return self._call(lambda c: c.search_resources(ctx))
