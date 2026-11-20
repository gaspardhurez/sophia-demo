"""Le LLM du compagnon : l'API, l'abonnement (avec l'API en relais), ou
l'indisponible — selon `SOPHIA_LLM_BACKEND`."""

import atexit
import shutil

from sophia.application.companion import Companion
from sophia.infrastructure.config import Settings
from sophia.infrastructure.llm.anthropic_companion import AnthropicCompanion
from sophia.infrastructure.llm.fallback import FallbackCompanion
from sophia.infrastructure.llm.subscription import SubscriptionCompanion
from sophia.infrastructure.unavailable import Unavailable

NO_API_KEY = "Pas de clé API Anthropic configurée."
NO_BACKEND = "Ni Claude Code (claude) trouvé, ni clé API Anthropic configurée."


def _api(settings: Settings) -> AnthropicCompanion | None:
    key = settings.anthropic_api_key
    if key is None or not key.get_secret_value().strip():
        return None
    return AnthropicCompanion(
        api_key=key,
        model_dictation=settings.llm_model_dictation,
        model_review=settings.llm_model_review,
        log_path=settings.llm_log_path,
    )


def build_companion(settings: Settings) -> Companion:
    """Sans appel réseau ni processus lancé : la clé n'est éprouvée qu'au
    premier appel, Claude Code n'est lancé qu'au premier usage.

    - `api` : disponible dès qu'une clé est configurée ;
    - `subscription` : Claude Code trouvé → l'abonnement, l'API en relais si
      la clé est là ; Claude Code introuvable → l'API seule, si la clé est là.
    """
    api = _api(settings)
    if settings.llm_backend == "api":
        return api or Unavailable(NO_API_KEY)
    claude = shutil.which(settings.claude_bin)
    if claude is None:
        return api or Unavailable(NO_BACKEND)
    subscription = SubscriptionCompanion(
        claude_bin=claude,
        model_dictation=settings.llm_model_dictation,
        model_review=settings.llm_model_review,
        log_path=settings.llm_log_path,
        timeout_s=settings.claude_timeout_s,
    )
    # Les processus préchauffés s'arrêtent avec l'app.
    atexit.register(subscription.close)
    return FallbackCompanion(subscription, api)
