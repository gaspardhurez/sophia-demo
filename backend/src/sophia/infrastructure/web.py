"""Lire une page web — avec les sous-titres YouTube (`sources.py`) et le client
Anthropic, les seuls endroits où Sophia va sur internet.

Bornée : http(s) seulement ; n'importe quel échec rend `None`.

- `fetch_html` : 5 s, lue par morceaux jusqu'au titre de la page (4 Mo au plus
  — celui de YouTube arrive après 760 Ko de scripts) ; un titre qu'on ne
  trouve pas n'est pas une erreur.
- `fetch_page` : la page entière, pour en extraire le texte (vérification des
  notes d'une ressource) ; 10 s, 5 Mo au plus — au-delà, `None` plutôt
  qu'une page coupée.
- `fetch_link` : la sorte d'une ressource (`link_reader.py`) — le type de
  contenu, et la page entière si elle est en HTML (mêmes bornes que
  `fetch_page`, 5 s).
"""

import http.client
import urllib.request
from urllib.parse import urlparse

TIMEOUT = 5
MAX_BYTES = 4 * 1024 * 1024
CHUNK = 64 * 1024
# Certains sites refusent un client sans nom de navigateur.
USER_AGENT = "Mozilla/5.0 (Sophia)"


def fetch_html(url: str) -> str | None:
    if urlparse(url).scheme not in ("http", "https"):
        return None
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            if response.headers.get_content_type() != "text/html":
                return None
            charset = response.headers.get_content_charset() or "utf-8"
            data = b""
            # Un morceau de plus après `</title>` : `og:title` le suit souvent.
            seen_title = False
            while len(data) < MAX_BYTES:
                chunk = response.read(CHUNK)
                if not chunk:
                    break
                data += chunk
                if seen_title:
                    break
                seen_title = b"</title>" in data.lower()
            return data.decode(charset, errors="replace")
    except (OSError, ValueError, LookupError, http.client.HTTPException):
        return None


PAGE_TIMEOUT = 10
PAGE_MAX_BYTES = 5 * 1024 * 1024
_HTML_TYPES = ("text/html", "application/xhtml+xml")


def fetch_page(url: str) -> str | None:
    if urlparse(url).scheme not in ("http", "https"):
        return None
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=PAGE_TIMEOUT) as response:
            if response.headers.get_content_type() not in _HTML_TYPES:
                return None
            charset = response.headers.get_content_charset() or "utf-8"
            data = response.read(PAGE_MAX_BYTES + 1)
            if len(data) > PAGE_MAX_BYTES:
                return None
            return data.decode(charset, errors="replace")
    except (OSError, ValueError, LookupError, http.client.HTTPException):
        return None


def fetch_link(url: str) -> tuple[str, str | None] | None:
    """Le type de contenu d'un lien et, pour une page HTML, la page (5 Mo au
    plus, sinon `None` à sa place) ; `None` si le lien ne répond pas."""
    if urlparse(url).scheme not in ("http", "https"):
        return None
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            content_type = response.headers.get_content_type()
            if content_type not in _HTML_TYPES:
                return content_type, None
            charset = response.headers.get_content_charset() or "utf-8"
            data = response.read(PAGE_MAX_BYTES + 1)
            if len(data) > PAGE_MAX_BYTES:
                return content_type, None
            return content_type, data.decode(charset, errors="replace")
    except (OSError, ValueError, LookupError, http.client.HTTPException):
        return None
