"""Le titre et l'auteur d'une page web, lus dans son HTML. Pur, sans
framework.

Sert à pré-remplir une ressource dont on colle le lien : le **titre** seul,
et l'**auteur** dans son propre champ plutôt que collé au titre.

- Le titre : `og:title` passe devant `<title>` (il porte le titre seul, sans
  le nom du site : « … – YouTube »).
- L'auteur : une personne d'abord — `<meta name="author">`, l'auteur d'un
  JSON-LD, la chaîne d'une vidéo YouTube (`itemprop="author"`) —, sinon le
  nom du site (`og:site_name`). Une adresse n'est pas un auteur.
- Le titre perd le nom de l'auteur ou du site qui le termine
  (« How to Run Your Python Scripts – Real Python » → « How to Run Your
  Python Scripts »), puisqu'il passe dans le champ Auteur.
"""

import json
from dataclasses import dataclass
from html.parser import HTMLParser

# Au-delà, ce n'est plus un titre qu'on garde tel quel.
MAX_LENGTH = 200
# Un auteur tient dans le champ (`resources.author`).
MAX_AUTHOR_LENGTH = 120
# Ce qui sépare le titre du nom du site, en fin de `<title>`.
_SEPARATORS = (" – ", " — ", " - ", " | ", " · ", " :: ")


@dataclass(frozen=True)
class PageInfo:
    title: str | None
    author: str | None


class _PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.og: str | None = None
        self.title: str | None = None
        self.meta_author: str | None = None
        self.site: str | None = None
        self.channel: str | None = None
        self.ld_author: str | None = None
        self._in_title = False
        self._in_ld = False
        self._in_author_scope = False
        self._chunks: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "title" and self.title is None:
            self._in_title = True
            self._chunks = []
        elif tag == "script" and values.get("type") == "application/ld+json":
            self._in_ld = True
            self._chunks = []
        if values.get("itemprop") == "author":
            self._in_author_scope = True
        elif (
            self._in_author_scope
            and values.get("itemprop") == "name"
            and values.get("content")
            and self.channel is None
        ):
            self.channel = values["content"]
        if tag != "meta" or not values.get("content"):
            return
        content = values["content"]
        prop, name = values.get("property"), values.get("name")
        if prop == "og:title" and self.og is None:
            self.og = content
        elif prop == "og:site_name" and self.site is None:
            self.site = content
        elif name == "author" and self.meta_author is None:
            self.meta_author = content

    def handle_data(self, data: str) -> None:
        if self._in_title or self._in_ld:
            self._chunks.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "title" and self._in_title:
            self._in_title = False
            self.title = "".join(self._chunks)
        elif tag == "script" and self._in_ld:
            self._in_ld = False
            if self.ld_author is None:
                self.ld_author = _ld_author("".join(self._chunks))
        elif tag == "span" and self._in_author_scope:
            self._in_author_scope = False


def _ld_author(raw: str) -> str | None:
    """Le nom du premier auteur d'un bloc JSON-LD (objet, liste, `@graph`)."""
    try:
        data = json.loads(raw)
    except ValueError:
        return None
    stack = [data]
    while stack:
        node = stack.pop(0)
        if isinstance(node, list):
            stack.extend(node)
        elif isinstance(node, dict):
            author = node.get("author")
            if isinstance(author, list) and author:
                author = author[0]
            if isinstance(author, dict) and isinstance(author.get("name"), str):
                return author["name"]
            if isinstance(author, str):
                return author
            stack.extend(node.get("@graph", []) or [])
    return None


def _clean(raw: str | None, limit: int) -> str | None:
    text = " ".join((raw or "").split())
    if not text or text.lower().startswith(("http://", "https://")):
        return None
    return text[:limit].rstrip() or None


def _without_suffix(title: str, names: list[str]) -> str:
    """Le titre sans « – Nom » final, quand ce nom est l'auteur ou le site."""
    for name in names:
        for sep in _SEPARATORS:
            suffix = f"{sep}{name}"
            if title.lower().endswith(suffix.lower()) and len(title) > len(suffix):
                return title[: -len(suffix)].rstrip()
    return title


def page_info(html: str) -> PageInfo:
    """Le titre (`og:title`, sinon `<title>`) et l'auteur (une personne,
    sinon le site) ; espaces resserrés ; `None` pour ce qui manque."""
    parser = _PageParser()
    parser.feed(html)
    person = next(
        (
            a
            for a in (
                _clean(parser.meta_author, MAX_AUTHOR_LENGTH),
                _clean(parser.ld_author, MAX_AUTHOR_LENGTH),
                _clean(parser.channel, MAX_AUTHOR_LENGTH),
            )
            if a
        ),
        None,
    )
    site = _clean(parser.site, MAX_AUTHOR_LENGTH)
    title = next(
        (t for t in (_clean(parser.og, 10_000), _clean(parser.title, 10_000)) if t),
        None,
    )
    if title:
        title = _without_suffix(title, [n for n in (person, site) if n])
        title = title[:MAX_LENGTH].rstrip()
    return PageInfo(title=title, author=person or site)


def page_title(html: str) -> str | None:
    """Le titre seul (cf. `page_info`)."""
    return page_info(html).title
