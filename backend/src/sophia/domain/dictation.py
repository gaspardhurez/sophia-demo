"""La dictée dans les notes (#173). Pur.

La voix arrive en direct, en PCM 16 bits mono à 16 kHz, et se transcrit par
tranches (cf. `application/dictation.py`) : une **fenêtre** — l'audio pas
encore validé, quelques secondes — se retranscrit à chaque tranche reçue.
Ce module tient ce qui décide sans rien exécuter :

- quand un mot de la fenêtre devient **validé** (`settle`) : quand deux
  passes successives s'accordent sur lui (et sur tout ce qui le précède),
  ou quand la voix marque une pause — Whisper, qui voit alors la fin d'une
  phrase, ne la réécrira plus ;
- où la voix se tait (`frame_levels`, `trailing_pause`, `quietest_frame`),
  sur le niveau du signal ;
- les bornes et les refus.

Valider par accord plutôt qu'au fil de chaque passe : la fin d'une fenêtre
coupe souvent un mot en deux, et Whisper le devine de travers (« inter- »
devient « intérêt ») ; la passe suivante, qui a la suite, le corrige. Ce qui
est validé ne bouge plus ; le reste s'affiche en provisoire.
"""

import re
import sys
from array import array
from dataclasses import dataclass


class DictationError(Exception):
    """Base des refus sur une dictée."""


class AudioTooLong(DictationError):
    """La dictée dépasse la durée maximale."""


#: Une dictée se fait bloc par bloc : dix minutes couvrent largement une partie.
MAX_AUDIO_SECONDS = 10 * 60
#: Le format reçu : PCM 16 bits signé, petit-boutiste, mono, 16 kHz — celui
#: que Whisper lit, sans rien décoder.
SAMPLE_RATE = 16_000
BYTES_PER_SECOND = SAMPLE_RATE * 2
#: Le texte transcrit envoyé au nettoyage : dix minutes de parole font
#: ~1 500 mots ; la borne protège la route, pas l'usage.
MAX_TRANSCRIPT_CHARS = 20_000

#: Le niveau se lit par trames de 30 ms (la granularité d'une syllabe).
FRAME_SECONDS = 0.03
#: Sous ce niveau (moyenne quadratique, 0 à 1), rien ne parle : le souffle
#: d'une pièce, micro à suppression de bruit (celle du navigateur), reste
#: bien en deçà ; la voix tourne autour de 0,05–0,2.
SPEECH_LEVEL = 0.015
#: Une trame se tait sous ce dixième du pic de la fenêtre (une voix forte
#: laisse un fond plus haut), et jamais au-dessus de `SPEECH_LEVEL`.
SILENCE_RATIO = 0.1
#: Une pause : assez pour que la phrase soit finie, pas assez pour qu'un
#: silence de réflexion au milieu d'un mot ne la coupe (une plosive dure
#: moins de 0,1 s).
PAUSE_SECONDS = 0.5


#: Une trame, en octets.
FRAME_BYTES = round(SAMPLE_RATE * FRAME_SECONDS) * 2


def frame_levels(pcm: bytes) -> list[float]:
    """Le niveau de chaque trame **complète** de 30 ms : la moyenne
    quadratique du signal, de 0 (silence) à 1 (pleine échelle). Une trame
    incomplète en fin de signal attend la suite."""
    samples = array("h")
    samples.frombytes(pcm[: len(pcm) - len(pcm) % FRAME_BYTES])
    if sys.byteorder == "big":
        samples.byteswap()
    size = FRAME_BYTES // 2
    levels = []
    for start in range(0, len(samples), size):
        frame = samples[start : start + size]
        power = sum(s * s for s in frame) / len(frame)
        levels.append(power**0.5 / 32768)
    return levels


def _silence_level(levels: list[float]) -> float:
    return min(SPEECH_LEVEL, max(levels, default=0.0) * SILENCE_RATIO)


def has_speech(levels: list[float]) -> bool:
    """La fenêtre porte-t-elle de la voix ? Sinon, inutile de la transcrire :
    sur du silence, Whisper invente (« Sous-titres réalisés par… »)."""
    return any(level >= SPEECH_LEVEL for level in levels)


def trailing_pause(levels: list[float]) -> bool:
    """La fenêtre finit-elle par une pause, après de la voix ?"""
    if not has_speech(levels):
        return False
    quiet = _silence_level(levels)
    needed = round(PAUSE_SECONDS / FRAME_SECONDS)
    tail = levels[-needed:]
    return len(tail) == needed and all(level < quiet for level in tail)


def quietest_frame(levels: list[float], lo: int, hi: int) -> int:
    """La trame la plus calme entre `lo` et `hi` (exclu) : là où couper une
    fenêtre trop longue sans pause, au plus près d'une frontière de mot.
    Lissée sur trois trames, pour ne pas tomber dans une plosive."""
    lo, hi = max(lo, 1), min(hi, len(levels) - 1)
    if hi <= lo:
        return max(0, min(lo, len(levels)))
    return min(range(lo, hi), key=lambda i: levels[i - 1] + levels[i] + levels[i + 1])


# --- La validation des mots ----------------------------------------------------

_PUNCTUATION = re.compile(r"[^\w]+")


def words(text: str) -> tuple[str, ...]:
    """Les mots d'une transcription, ponctuation collée (« compiler. »). Une
    ponctuation seule (« ... », que Whisper rend sur un silence) n'en est
    pas un."""
    return tuple(w for w in text.split() if _key(w))


def _key(word: str) -> str:
    """Un mot comparé sans casse ni ponctuation : deux passes qui ne
    diffèrent que par une virgule ou une majuscule s'accordent."""
    return _PUNCTUATION.sub("", word.lower())


def agreed_prefix(a: tuple[str, ...], b: tuple[str, ...]) -> int:
    """Le nombre de mots sur lesquels deux passes s'accordent, depuis le
    début."""
    n = 0
    for x, y in zip(a, b, strict=False):
        if _key(x) != _key(y):
            break
        n += 1
    return n


#: Un mot ne se valide par accord que si la passe en entend au moins tant
#: après lui (cf. `settle`).
MARGIN_WORDS = 2


@dataclass(frozen=True)
class Window:
    """Ce qu'on sait du texte de la fenêtre en cours : combien de ses mots
    sont déjà validés, et la passe d'avant (nulle à l'ouverture)."""

    validated: int = 0
    previous: tuple[str, ...] | None = None


@dataclass(frozen=True)
class Settled:
    """Ce qu'une passe décide : les mots qu'elle valide (à ajouter au texte
    validé), ceux qui restent provisoires, et la fenêtre qui suit — neuve si
    la fenêtre se ferme (`closed` : son audio est abandonné)."""

    validated: tuple[str, ...]
    tentative: tuple[str, ...]
    window: Window
    closed: bool


def settle(window: Window, hypothesis: tuple[str, ...], *, close: bool) -> Settled:
    """Ce que valide une passe sur la fenêtre.

    - `close` (une pause, la fin de la dictée, une fenêtre coupée) : tout ce
      que la passe entend au-delà du déjà validé l'est, et la fenêtre se
      ferme.
    - Sinon, ce sur quoi elle s'accorde avec la passe d'avant, depuis le
      début, **moins ses `MARGIN_WORDS` derniers mots** : près de la fin de
      la fenêtre, deux passes peuvent s'accorder sur un mot coupé, deviné
      de travers (« typé de l' » pour « typé dynamiquement »). Le reste est
      provisoire. Un mot déjà validé ne se reprend jamais, même si cette
      passe le dit autrement.
    """
    done = window.validated
    if close:
        return Settled(
            validated=hypothesis[done:],
            tentative=(),
            window=Window(),
            closed=True,
        )
    agreed = agreed_prefix(window.previous, hypothesis) if window.previous else 0
    upto = max(done, min(agreed, len(hypothesis) - MARGIN_WORDS))
    return Settled(
        validated=hypothesis[done:upto],
        tentative=hypothesis[upto:],
        window=Window(validated=upto, previous=hypothesis),
        closed=False,
    )
