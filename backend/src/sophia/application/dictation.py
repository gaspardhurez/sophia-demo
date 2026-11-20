"""Use cases de la dictée dans les notes (#173).

Deux temps, l'API Claude ne prenant pas d'audio :

1. **En direct**, la voix se transcrit en local (`Transcriber`, Whisper) par
   tranches, à mesure qu'elle arrive (`LiveDictation`, servie par le
   WebSocket de `api/dictation.py`) : l'écran montre le texte au fil de la
   parole, en provisoire. Rien ne quitte la machine.
2. **À l'arrêt**, le texte validé complet part au LLM, qui le nettoie en
   puces (`clean`), avec le contexte qui l'aide à corriger le vocabulaire.

Rien n'est enregistré : les puces repartent vers l'écran, qui les pose au
curseur, dans les notes du savoir ou d'une ressource — c'est leur
enregistrement habituel qui les garde.
"""

from sophia.application.companion import (
    Availability,
    Companion,
    CompanionUnavailable,
    DictationContext,
    Transcriber,
)
from sophia.domain.dictation import (
    BYTES_PER_SECOND,
    FRAME_BYTES,
    FRAME_SECONDS,
    MAX_AUDIO_SECONDS,
    AudioTooLong,
    Window,
    frame_levels,
    has_speech,
    quietest_frame,
    settle,
    trailing_pause,
    words,
)
from sophia.domain.notes import heading_titles
from sophia.infrastructure.models import Resource, Skill

#: Whisper ne lit que la fin de son amorce (~220 jetons) : on la garde courte.
MAX_HINT_CHARS = 600
#: La fin du texte déjà validé, ajoutée à l'amorce : la fenêtre suivante
#: continue la phrase au lieu de la recommencer (majuscule, orthographe d'un
#: terme déjà entendu).
PROMPT_TAIL_CHARS = 200

#: Une passe au plus toutes les demi-secondes d'audio neuf : en deçà, la passe
#: suivante n'apporterait presque rien. Une passe de large-v3-turbo prend
#: ~0,8 s (mesuré) : quand elles sont plus lentes
#: que la parole, les tranches s'accumulent et la passe suivante les prend
#: toutes.
STEP_SECONDS = 0.5
#: Au-delà, une fenêtre sans pause se coupe à son endroit le plus calme :
#: chaque passe retranscrit toute la fenêtre, elle doit rester courte.
MAX_WINDOW_SECONDS = 15
#: Une fenêtre sans voix ne garde que sa fin : de quoi ne pas couper
#: l'attaque du mot qui commence.
KEEP_SILENCE_SECONDS = 0.3


def check_ports(*ports: Availability) -> None:
    """Lève `CompanionUnavailable` si un port manque, avec **tous** les
    motifs : on sait tout ce qu'il manque d'un coup."""
    if not all(p.available for p in ports):
        reasons = [p.reason for p in ports if not p.available and p.reason]
        raise CompanionUnavailable(" ".join(reasons) or "La dictée est indisponible.")


def dictation_context(
    skill: Skill, resource: Resource | None, transcript: str
) -> DictationContext:
    """Le contexte d'une dictée, lu de la base : le savoir, la ressource et la
    partie qui intéresse quand on dicte dans ses notes, les titres des notes
    du savoir."""
    doc = skill.notes.doc if skill.notes is not None else None
    return DictationContext(
        skill=skill.name,
        resource=resource.title if resource is not None else None,
        resource_part=resource.part if resource is not None else None,
        note_titles=tuple(heading_titles(doc)),
        transcript=transcript,
    )


def whisper_hint(ctx: DictationContext) -> str:
    """L'amorce de la transcription : les mots qu'on s'attend à entendre. Elle
    oriente l'orthographe des termes du domaine, sans rien imposer."""
    parts = [ctx.skill, ctx.resource or "", ctx.resource_part or "", *ctx.note_titles]
    return ". ".join(p.strip() for p in parts if p.strip())[:MAX_HINT_CHARS]


def clean(
    skill: Skill,
    resource: Resource | None,
    transcript: str,
    *,
    companion: Companion,
) -> list[str]:
    """Nettoie le texte d'une dictée en puces. Liste vide si rien n'a été
    entendu (ou si rien ne portait sur le contenu) — sans appeler le LLM."""
    check_ports(companion.availability())
    transcript = transcript.strip()
    if not transcript:
        return []
    bullets = companion.clean_dictation(dictation_context(skill, resource, transcript))
    return [b.strip() for b in bullets if b.strip()]


class LiveDictation:
    """Une dictée en direct : l'audio arrive par tranches (`feed`), chaque
    passe (`step`) retranscrit la **fenêtre** — l'audio pas encore validé —
    et rend le texte validé et le provisoire ; `finish` valide la fin et
    rend le texte complet, celui qui part au nettoyage.

    Ce que valide une passe se décide dans `domain/dictation.py` (`settle`) :
    l'accord de deux passes successives, ou une pause. Une fenêtre fermée
    abandonne son audio ; la suivante commence après. Une fenêtre sans voix
    n'est pas transcrite (Whisper inventerait sur le silence), une fenêtre
    trop longue sans pause se coupe à son endroit le plus calme.

    Synchrone, sans état partagé : une session par dictée, appelée d'un seul
    fil à la fois (le WebSocket alterne réception et passe). Le transcripteur,
    lui, est partagé : il tient un seul modèle et une transcription à la fois.
    """

    def __init__(self, transcriber: Transcriber, hint: str) -> None:
        self._transcriber = transcriber
        self._hint = hint
        self._audio = bytearray()  # la fenêtre
        self._levels: list[float] = []  # ses trames complètes
        self._window = Window()
        self._validated: list[str] = []
        # Les mots validés avant la fenêtre : eux seuls vont à l'amorce.
        self._before_window = 0
        self._tentative: tuple[str, ...] = ()
        self._received = 0
        self._fresh = 0  # reçu depuis la dernière passe

    # --- Ce qu'on en lit -------------------------------------------------------

    @property
    def validated(self) -> str:
        return " ".join(self._validated)

    @property
    def tentative(self) -> str:
        return " ".join(self._tentative)

    def due(self) -> bool:
        """Assez d'audio neuf pour qu'une passe vaille la peine."""
        return self._fresh >= STEP_SECONDS * BYTES_PER_SECOND

    # --- Ce qu'on en fait ------------------------------------------------------

    def feed(self, pcm: bytes) -> None:
        """Ajoute une tranche (PCM 16 bits, mono, 16 kHz) ; au-delà de dix
        minutes en tout, `AudioTooLong`."""
        self._received += len(pcm)
        if self._received > MAX_AUDIO_SECONDS * BYTES_PER_SECOND:
            raise AudioTooLong()
        self._audio += pcm
        self._fresh += len(pcm)
        measured = len(self._levels) * FRAME_BYTES
        self._levels += frame_levels(bytes(self._audio[measured:]))

    def step(self) -> None:
        """Une passe sur la fenêtre."""
        self._fresh = 0
        if not has_speech(self._levels):
            keep = round(KEEP_SILENCE_SECONDS / FRAME_SECONDS) * FRAME_BYTES
            self._drop(max(0, len(self._levels) * FRAME_BYTES - keep))
            return
        if trailing_pause(self._levels):
            self._pass(len(self._audio), close=True)
        elif len(self._audio) > MAX_WINDOW_SECONDS * BYTES_PER_SECOND:
            # Coupée entre sa moitié et sa dernière seconde : la tête se
            # valide, la queue ouvre la fenêtre suivante.
            n = len(self._levels)
            last_second = round(1 / FRAME_SECONDS)
            cut = quietest_frame(self._levels, n // 2, n - last_second)
            self._pass(cut * FRAME_BYTES, close=True)
        else:
            self._pass(len(self._audio), close=False)

    def finish(self) -> str:
        """La dernière passe, qui valide toute la fenêtre ; le texte complet."""
        if has_speech(self._levels):
            self._pass(len(self._audio), close=True)
        self._tentative = ()
        return self.validated

    # --- Le détail -------------------------------------------------------------

    def _prompt(self) -> str:
        # Pas les mots validés de la fenêtre elle-même : son audio les porte
        # encore, et Whisper, les lisant dans l'amorce, sauterait leur
        # répétition — la passe ne s'alignerait plus sur la précédente.
        before = " ".join(self._validated[: self._before_window])
        tail = before[-PROMPT_TAIL_CHARS:]
        return ". ".join(p for p in (self._hint, tail) if p)

    def _pass(self, upto: int, *, close: bool) -> None:
        text = self._transcriber.transcribe(bytes(self._audio[:upto]), self._prompt())
        settled = settle(self._window, words(text), close=close)
        self._validated += settled.validated
        self._tentative = settled.tentative
        self._window = settled.window
        if settled.closed:
            self._before_window = len(self._validated)
            self._drop(upto)

    def _drop(self, upto: int) -> None:
        """Abandonne le début de la fenêtre (validé, ou silence)."""
        if upto <= 0:
            return
        del self._audio[:upto]
        self._levels = frame_levels(bytes(self._audio))
