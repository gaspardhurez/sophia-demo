"""La sorte d'une ressource, lue dans son lien et sa page. Pur, sans framework.

Elle ne sert qu'à dessiner la tuile : 📺 une vidéo, 📘 un texte (un article,
une doc, un PDF — ou une référence sans lien, un livre), 🔗 sinon. Rien ne la
saisit : le serveur la lit quand le lien est posé (`application/resources.py`).

- **Vidéo** : un hébergeur de vidéos connu, un chemin connu pour ne porter
  que des vidéos (`_VIDEO_PATHS` : les cours de Real Python se déclarent
  `article` et cachent leur lecteur derrière la connexion — rien dans la page
  ne le dit), ou une page qui se déclare vidéo (`og:type` en `video.*`).
- **Texte** : un PDF, une page qui se déclare article (`og:type = article`),
  ou une page dont on tire un vrai texte suivi (`TEXT_MIN_CHARS`).
- Le reste — page illisible, accueil d'un site, outil — n'a pas de sorte.
"""

import enum
from dataclasses import dataclass
from html.parser import HTMLParser
from urllib.parse import urlparse

#: En deçà, un texte extrait d'une page est un menu ou une accroche, pas un
#: article.
TEXT_MIN_CHARS = 1500

_VIDEO_HOSTS = (
    "youtube.com",
    "youtu.be",
    "vimeo.com",
    "dailymotion.com",
    "twitch.tv",
)

#: (hébergeur, début du chemin) : un raté de la détection s'ajoute ici.
_VIDEO_PATHS = (("realpython.com", "/courses/"),)


class ResourceKind(enum.StrEnum):
    video = "video"
    text = "text"


@dataclass(frozen=True)
class LinkPage:
    """Ce qu'on a lu à un lien : son type de contenu, l'`og:type` de la page
    (HTML) et la longueur du texte qu'on en tire."""

    content_type: str
    og_type: str | None = None
    text_chars: int = 0


def kind_from_url(url: str) -> ResourceKind | None:
    """Ce que le lien dit seul, sans aller le lire."""
    parsed = urlparse(url.strip())
    host = (parsed.hostname or "").removeprefix("www.").removeprefix("m.")
    if any(host == h or host.endswith("." + h) for h in _VIDEO_HOSTS):
        return ResourceKind.video
    if any(host == h and parsed.path.startswith(p) for h, p in _VIDEO_PATHS):
        return ResourceKind.video
    if parsed.path.lower().endswith(".pdf"):
        return ResourceKind.text
    return None


def kind_from_page(page: LinkPage) -> ResourceKind | None:
    """Ce que la page dit d'elle-même."""
    if page.content_type == "application/pdf":
        return ResourceKind.text
    og = (page.og_type or "").strip().lower()
    if og.startswith("video"):
        return ResourceKind.video
    if og == "article" or page.text_chars >= TEXT_MIN_CHARS:
        return ResourceKind.text
    return None


class _OgTypeParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.og_type: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "meta" and self.og_type is None:
            values = dict(attrs)
            if values.get("property") == "og:type" and values.get("content"):
                self.og_type = values["content"]


def og_type(html: str) -> str | None:
    """L'`og:type` d'une page, s'il est déclaré."""
    parser = _OgTypeParser()
    parser.feed(html)
    return parser.og_type
