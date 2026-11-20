"""La transcription de la dictée : mlx-whisper en local, ou l'indisponible.

Un adaptateur par API (Groq, OpenAI, Mistral) viendra le jour d'un
déploiement, choisi par `SOPHIA_TRANSCRIBER`.
"""

from importlib.util import find_spec

from sophia.application.companion import Transcriber
from sophia.infrastructure.config import Settings
from sophia.infrastructure.transcription.mlx import MlxTranscriber
from sophia.infrastructure.unavailable import Unavailable

DISABLED = "La transcription est désactivée dans la configuration."
NOT_INSTALLED = "La transcription locale (mlx-whisper) n'est pas installée."


def build_transcriber(settings: Settings) -> Transcriber:
    if settings.transcriber == "none":
        return Unavailable(DISABLED)
    # On cherche le module sans l'importer : l'import charge MLX, lourd. Pas
    # de ffmpeg à chercher : l'audio arrive déjà décodé (PCM).
    if find_spec("mlx_whisper") is None:
        return Unavailable(NOT_INSTALLED)
    return MlxTranscriber(model=settings.whisper_model)
