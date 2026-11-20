"""Lire la source d'une ressource, sur le moment et sans rien en garder (#173).

- **Page web** : la page entière (`web.fetch_page`), dont `trafilatura` tire
  le texte principal (sans menus, commentaires ni pied de page), en Markdown
  pour garder les titres — ils servent à dire « où regarder ».
- **Vidéo YouTube** : les sous-titres (`youtube-transcript-api`), en français
  sinon en anglais, mis en paragraphes horodatés et restreints à la partie de
  la ressource quand elle donne des horodatages (`domain.source`).

Tout échec rend `SourceMissing` avec son motif ; rien ne lève. Le réseau est
borné (10 s par requête).
"""

import requests
import trafilatura
from youtube_transcript_api import (
    NoTranscriptFound,
    TranscriptsDisabled,
    YouTubeTranscriptApi,
    YouTubeTranscriptApiException,
)

from sophia.application.review import SourceMissing, SourceText
from sophia.domain.review import PasteReason
from sophia.domain.source import (
    Caption,
    captions_text,
    is_web_link,
    time_range,
    youtube_video_id,
)
from sophia.infrastructure.web import fetch_page

TIMEOUT = 10
#: Moins que ça, ce n'est pas le contenu : un mur payant, une page vide.
MIN_PAGE_CHARS = 200
LANGUAGES = ["fr", "en"]


class _BoundedSession(requests.Session):
    """`requests` n'a pas de délai par défaut : on en pose un."""

    def request(self, *args, **kwargs):
        kwargs.setdefault("timeout", TIMEOUT)
        return super().request(*args, **kwargs)


def read_youtube(video_id: str, part: str | None) -> SourceText | SourceMissing:
    try:
        fetched = YouTubeTranscriptApi(http_client=_BoundedSession()).fetch(
            video_id, languages=LANGUAGES
        )
    except (NoTranscriptFound, TranscriptsDisabled):
        return SourceMissing(PasteReason.no_transcript)
    except (YouTubeTranscriptApiException, requests.RequestException):
        return SourceMissing(PasteReason.unreachable)
    captions = [Caption(text=s.text, start=s.start) for s in fetched]
    text = captions_text(captions, time_range(part))
    return (
        SourceText(kind="youtube", text=text)
        if text
        else SourceMissing(PasteReason.no_transcript)
    )


def read_web(url: str) -> SourceText | SourceMissing:
    html = fetch_page(url)
    if html is None:
        return SourceMissing(PasteReason.unreachable)
    try:
        text = trafilatura.extract(
            html,
            url=url,
            output_format="markdown",
            include_comments=False,
            include_tables=True,
        )
    except Exception:  # noqa: BLE001 — une page qui ne s'analyse pas est illisible
        text = None
    if not text or len(text.strip()) < MIN_PAGE_CHARS:
        return SourceMissing(PasteReason.unreachable)
    return SourceText(kind="web", text=text.strip())


class WebSourceReader:
    """L'adaptateur du port `SourceReader` (`application/review.py`)."""

    def read(
        self, reference: str | None, part: str | None
    ) -> SourceText | SourceMissing:
        if not is_web_link(reference):
            return SourceMissing(PasteReason.no_link)
        url = reference.strip()
        video_id = youtube_video_id(url)
        if video_id is not None:
            return read_youtube(video_id, part)
        return read_web(url)
