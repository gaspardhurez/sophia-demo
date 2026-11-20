"""La transcription locale, sur Apple Silicon, par mlx-whisper.

`mlx_whisper` ne s'importe qu'au moment de transcrire : sa présence se vérifie
à la construction, sans le charger (l'import charge MLX). Le premier appel
télécharge le modèle depuis Hugging Face (~1,6 Go pour large-v3-turbo, dans
`~/.cache/huggingface`), puis mlx-whisper le garde en mémoire pour le
processus (`ModelHolder` : **un seul** modèle à la fois — en alterner deux
les rechargerait à chaque passe).

L'audio arrive déjà en PCM 16 kHz mono (le navigateur le rééchantillonne) :
il passe à Whisper en tableau numpy, sans fichier ni ffmpeg.

Réglages d'une passe en direct : température 0 seule (les replis à
température plus haute relancent le décodage — une passe lente, et du texte
inventé sur un mot coupé), et pas de conditionnement sur le texte précédent
**dans** la fenêtre (elle est courte ; la suite d'une fenêtre à l'autre passe
par l'amorce). Et un plafond de jetons à la mesure de l'audio : sur un mot
coupé, Whisper part parfois en boucle jusqu'à son plafond par défaut (224
jetons), et la passe prend 2,5 s au lieu de 0,8. Enfin, sans horodatage :
avec, un dernier segment inachevé (la fenêtre coupe une phrase) fait
reculer Whisper et relancer une seconde passe complète (mesuré : 1,9 s au
lieu de 0,9) ; on n'a besoin que du texte.
"""

import threading

from sophia.application.companion import Availability
from sophia.domain.dictation import BYTES_PER_SECOND

#: Le français parlé tient sous ~6 jetons par seconde ; la marge couvre un
#: débit rapide et la ponctuation.
TOKENS_PER_SECOND = 10
MIN_TOKENS = 24
#: Le plafond par défaut de Whisper (la moitié de son contexte de texte).
MAX_TOKENS = 224


class MlxTranscriber:
    def __init__(self, *, model: str) -> None:
        self.model = model
        # MLX tient un seul modèle en mémoire, partagé : une transcription à
        # la fois (les passes de deux dictées, ou d'un WebSocket et d'un
        # autre fil, attendent leur tour).
        self._lock = threading.Lock()

    def availability(self) -> Availability:
        return Availability(available=True)

    def transcribe(self, pcm: bytes, hint: str) -> str:
        if not pcm:
            return ""
        import mlx_whisper
        import numpy as np

        signal = np.frombuffer(pcm[: len(pcm) - len(pcm) % 2], dtype="<i2")
        audio = signal.astype(np.float32) / 32768.0
        seconds = len(pcm) / BYTES_PER_SECOND
        tokens = min(MAX_TOKENS, MIN_TOKENS + round(TOKENS_PER_SECOND * seconds))
        with self._lock:
            result = mlx_whisper.transcribe(
                audio,
                path_or_hf_repo=self.model,
                language="fr",
                initial_prompt=hint or None,
                temperature=0.0,
                condition_on_previous_text=False,
                sample_len=tokens,
                without_timestamps=True,
            )
        return str(result.get("text") or "").strip()
