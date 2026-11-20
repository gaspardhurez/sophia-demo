"""Lire un lien pour en déduire la sorte d'une ressource (`domain/resource_kind`).

L'adaptateur du port `LinkReader` (`application/resources.py`). Une seule
requête : le type de contenu suffit pour un PDF ; une page HTML est lue
entière (`web.fetch_link`) pour son `og:type` et la longueur du texte que
`trafilatura` en tire. N'importe quel échec rend `None` : la ressource
garde la tuile 🔗.
"""

import trafilatura

from sophia.domain.resource_kind import LinkPage, og_type
from sophia.infrastructure.web import fetch_link


class WebLinkReader:
    def read(self, url: str) -> LinkPage | None:
        fetched = fetch_link(url)
        if fetched is None:
            return None
        content_type, html = fetched
        if html is None:
            return LinkPage(content_type=content_type)
        try:
            text = trafilatura.extract(html, url=url, include_comments=False)
        except Exception:  # noqa: BLE001 — une page qui ne s'analyse pas n'a pas de texte
            text = None
        return LinkPage(
            content_type=content_type,
            og_type=og_type(html),
            text_chars=len((text or "").strip()),
        )
