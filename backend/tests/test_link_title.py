"""Le titre d'une page, pour pré-remplir une ressource dont on colle le
lien."""

import pytest
from fastapi.testclient import TestClient

from sophia.application import resources
from sophia.domain.link_title import PageInfo, page_info, page_title


def test_og_title_comes_before_the_title_tag() -> None:
    html = (
        "<html><head><title>Never Gonna Give You Up - YouTube</title>"
        '<meta property="og:title" content="Never Gonna Give You Up">'
        "</head></html>"
    )
    assert page_title(html) == "Never Gonna Give You Up"


def test_the_title_tag_without_og_title() -> None:
    assert page_title("<title>\n  Tennis —\n Wikipédia </title>") == (
        "Tennis — Wikipédia"
    )


def test_entities_are_decoded() -> None:
    assert page_title("<title>Tom &amp; Jerry &#8211; l&#39;intégrale</title>") == (
        "Tom & Jerry – l'intégrale"
    )


@pytest.mark.parametrize("html", ["", "<p>Rien</p>", "<title>   </title>"])
def test_no_title(html: str) -> None:
    assert page_title(html) is None


def test_a_long_title_is_cut() -> None:
    assert len(page_title(f"<title>{'a' * 500}</title>") or "") == 200


def test_the_route_reads_the_page(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        resources, "fetch_html", lambda url: f"<title>Page de {url}</title>"
    )
    resp = client.get("/link-title", params={"url": " https://a.fr "})
    assert resp.json() == {"title": "Page de https://a.fr", "author": None}


def test_an_unreachable_page_has_no_title(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(resources, "fetch_html", lambda url: None)
    assert client.get("/link-title", params={"url": "x"}).json() == {
        "title": None,
        "author": None,
    }


def test_the_site_name_leaves_the_title_for_the_author() -> None:
    html = (
        "<title>How to Run Your Python Scripts and Code – Real Python</title>"
        '<meta property="og:site_name" content="Real Python">'
    )
    assert page_info(html) == PageInfo(
        "How to Run Your Python Scripts and Code", "Real Python"
    )


def test_a_person_comes_before_the_site() -> None:
    html = (
        '<meta property="og:title" content="Python Virtual Environments">'
        '<meta property="og:site_name" content="Real Python">'
        '<meta name="author" content="Martin Breuss">'
    )
    assert page_info(html).author == "Martin Breuss"


def test_the_author_of_a_json_ld_graph() -> None:
    html = (
        "<title>Laver les légumes | ANSES</title>"
        '<script type="application/ld+json">'
        '{"@graph": [{"@type": "WebPage"}, {"@type": "Article",'
        ' "author": [{"@type": "Person", "name": "Jeanne Martin"}]}]}'
        "</script>"
    )
    assert page_info(html) == PageInfo("Laver les légumes | ANSES", "Jeanne Martin")


def test_the_channel_of_a_youtube_video() -> None:
    html = (
        '<meta property="og:title" content="Comment laver ses légumes">'
        '<meta property="og:site_name" content="YouTube">'
        '<span itemprop="author" itemscope itemtype="http://schema.org/Person">'
        '<link itemprop="url" href="http://www.youtube.com/@chef">'
        '<link itemprop="name" content="Chef Michel"></span>'
        '<link itemprop="name" content="Autre chose">'
    )
    assert page_info(html) == PageInfo("Comment laver ses légumes", "Chef Michel")


def test_an_address_is_not_an_author() -> None:
    html = '<title>Article</title><meta name="author" content="https://x.fr/moi">'
    assert page_info(html) == PageInfo("Article", None)


def test_the_route_reads_the_author(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        resources,
        "fetch_html",
        lambda url: (
            "<title>Article - Le Site</title>"
            '<meta property="og:site_name" content="Le Site">'
        ),
    )
    resp = client.get("/link-title", params={"url": "https://a.fr"})
    assert resp.json() == {"title": "Article", "author": "Le Site"}
