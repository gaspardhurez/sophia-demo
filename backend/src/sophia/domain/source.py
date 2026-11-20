"""Lire la source d'une ressource — la partie pure (#173).

Reconnaître une vidéo YouTube dans un lien, lire la **partie** d'une ressource
quand elle donne des horodatages (« de 4:10 à 9:30 »), et mettre des
sous-titres en texte horodaté (pour que la vérification dise « où regarder »).
"""

import re
from collections.abc import Iterable
from dataclasses import dataclass
from urllib.parse import parse_qs, urlparse

_YOUTUBE_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
_YOUTUBE_HOSTS = {"youtube.com", "m.youtube.com", "music.youtube.com"}


def youtube_video_id(reference: str | None) -> str | None:
    """L'identifiant d'une vidéo YouTube, si `reference` en est un lien
    (`watch?v=`, `youtu.be/`, `/shorts/`, `/embed/`, `/live/`) ; sinon `None`."""
    if not reference:
        return None
    url = urlparse(reference.strip())
    if url.scheme not in ("http", "https"):
        return None
    host = (url.hostname or "").removeprefix("www.")
    candidate: str | None = None
    if host == "youtu.be":
        candidate = url.path.strip("/").split("/")[0]
    elif host in _YOUTUBE_HOSTS:
        parts = [p for p in url.path.split("/") if p]
        if parts[:1] == ["watch"]:
            candidate = (parse_qs(url.query).get("v") or [None])[0]
        elif len(parts) >= 2 and parts[0] in ("shorts", "embed", "live"):
            candidate = parts[1]
    return candidate if candidate and _YOUTUBE_ID.match(candidate) else None


def is_web_link(reference: str | None) -> bool:
    return bool(reference) and urlparse(reference.strip()).scheme in ("http", "https")


# --- La partie, en horodatages -------------------------------------------------

_TIMESTAMP = re.compile(r"(?<![\d:])(\d{1,2}(?::\d{2}){1,2})(?![\d:])")
_FROM = re.compile(r"(à partir de|depuis|dès|from|after)\s*$", re.IGNORECASE)
_UNTIL = re.compile(r"(jusqu'à|jusqu’à|until|to|avant)\s*$", re.IGNORECASE)


def _seconds(stamp: str) -> int:
    total = 0
    for part in stamp.split(":"):
        total = total * 60 + int(part)
    return total


@dataclass(frozen=True)
class TimeRange:
    """Une fenêtre de la vidéo, en secondes ; un bord `None` est ouvert."""

    start: float | None
    end: float | None

    def contains(self, at: float) -> bool:
        return (self.start is None or at >= self.start) and (
            self.end is None or at < self.end
        )


def time_range(part: str | None) -> TimeRange | None:
    """La fenêtre que décrit la partie d'une ressource, si elle en décrit une.

    Deux horodatages ou plus : du premier au second (« de 4:10 à 9:30 »,
    « 4:10-9:30 »). Un seul : un début (« à partir de 12:00 ») ou une fin
    (« jusqu'à 9:30 ») selon le mot qui le précède — sans lui, rien. Toute
    autre partie (« chapitres 2 et 3 ») n'est pas une fenêtre : `None`."""
    if not part:
        return None
    found = list(_TIMESTAMP.finditer(part))
    if len(found) >= 2:
        a, b = _seconds(found[0].group(1)), _seconds(found[1].group(1))
        return TimeRange(min(a, b), max(a, b)) if a != b else None
    if len(found) == 1:
        before = part[: found[0].start()]
        at = _seconds(found[0].group(1))
        if _FROM.search(before):
            return TimeRange(at, None)
        if _UNTIL.search(before):
            return TimeRange(None, at)
    return None


# --- Les sous-titres en texte ---------------------------------------------------


@dataclass(frozen=True)
class Caption:
    """Un morceau de sous-titre : son texte, son début en secondes."""

    text: str
    start: float


def format_timestamp(seconds: float) -> str:
    s = int(seconds)
    h, rest = divmod(s, 3600)
    m, s = divmod(rest, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


#: Les sous-titres arrivent par morceaux de quelques secondes : on les regroupe
#: en paragraphes d'au moins ~30 s, chacun précédé de son horodatage.
PARAGRAPH_SECONDS = 30


def captions_text(captions: Iterable[Caption], window: TimeRange | None = None) -> str:
    """Les sous-titres en paragraphes horodatés (`[4:10] …`), restreints à
    `window` si elle est donnée."""
    lines: list[str] = []
    current: list[str] = []
    started: float | None = None
    for c in captions:
        if window is not None and not window.contains(c.start):
            continue
        text = " ".join(c.text.split())
        if not text:
            continue
        if started is None:
            started = c.start
        current.append(text)
        if c.start - started >= PARAGRAPH_SECONDS:
            lines.append(f"[{format_timestamp(started)}] " + " ".join(current))
            current, started = [], None
    if current and started is not None:
        lines.append(f"[{format_timestamp(started)}] " + " ".join(current))
    return "\n".join(lines)
