"""La sorte d'une ressource (tuile 📺 / 📘 / 🔗), lue dans son lien et sa page."""

from fastapi.testclient import TestClient

from sophia.api.deps import get_link_reader
from sophia.domain.resource_kind import (
    LinkPage,
    ResourceKind,
    kind_from_page,
    kind_from_url,
    og_type,
)
from sophia.main import app


def test_a_video_host_is_a_video_without_reading_it() -> None:
    for url in (
        "https://www.youtube.com/watch?v=x",
        "https://youtu.be/x",
        "https://m.youtube.com/watch?v=x",
        "https://vimeo.com/1",
    ):
        assert kind_from_url(url) is ResourceKind.video


def test_a_known_video_path_is_a_video() -> None:
    assert kind_from_url("https://realpython.com/courses/what-can-you-do/") is (
        ResourceKind.video
    )
    assert kind_from_url("https://realpython.com/python-environment/") is None


def test_a_pdf_link_is_a_text() -> None:
    assert kind_from_url("https://example.com/cours.PDF") is ResourceKind.text


def test_another_link_says_nothing_by_itself() -> None:
    assert kind_from_url("https://realpython.com/python-environment/") is None


def test_the_page_tells_what_it_is() -> None:
    assert kind_from_page(LinkPage("application/pdf")) is ResourceKind.text
    assert kind_from_page(LinkPage("text/html", og_type="video.other")) is (
        ResourceKind.video
    )
    assert kind_from_page(LinkPage("text/html", og_type="article")) is (
        ResourceKind.text
    )
    assert kind_from_page(LinkPage("text/html", text_chars=4000)) is (ResourceKind.text)


def test_a_short_page_without_type_is_just_a_link() -> None:
    assert kind_from_page(LinkPage("text/html", og_type="website", text_chars=300)) is (
        None
    )


def test_og_type_is_read_in_the_html() -> None:
    html = '<head><meta property="og:type" content="article"></head>'
    assert og_type(html) == "article"
    assert og_type("<head></head>") is None


class _Reader:
    def __init__(self, page: LinkPage | None) -> None:
        self.page = page
        self.urls: list[str] = []

    def read(self, url: str) -> LinkPage | None:
        self.urls.append(url)
        return self.page


def _skill(client: TestClient) -> str:
    d = client.post("/domains", json={"name": "Python"}).json()["id"]
    return client.post(f"/domains/{d}/skills", json={"name": "Env"}).json()["id"]


def test_the_kind_is_read_when_the_link_is_set(client: TestClient) -> None:
    reader = _Reader(LinkPage("text/html", og_type="article"))
    app.dependency_overrides[get_link_reader] = lambda: reader
    s = _skill(client)

    r = client.post(
        f"/skills/{s}/resources",
        json={"title": "Article", "reference": "https://realpython.com/a/"},
    ).json()

    assert r["kind"] == "text"
    assert reader.urls == ["https://realpython.com/a/"]


def test_a_reference_without_link_has_no_kind(client: TestClient) -> None:
    reader = _Reader(LinkPage("text/html", og_type="article"))
    app.dependency_overrides[get_link_reader] = lambda: reader
    s = _skill(client)

    r = client.post(
        f"/skills/{s}/resources", json={"title": "Livre", "reference": "Fluent Python"}
    ).json()

    assert r["kind"] is None
    assert reader.urls == []


def test_the_kind_follows_the_link_only(client: TestClient) -> None:
    reader = _Reader(None)
    app.dependency_overrides[get_link_reader] = lambda: reader
    s = _skill(client)
    r = client.post(
        f"/skills/{s}/resources",
        json={"title": "Vidéo", "reference": "https://youtu.be/x"},
    ).json()
    assert r["kind"] == "video"

    # Renommer ne relit rien ; changer le lien relit.
    renamed = client.patch(f"/resources/{r['id']}", json={"title": "Autre"}).json()
    assert renamed["kind"] == "video"
    moved = client.patch(
        f"/resources/{r['id']}", json={"reference": "https://example.com/"}
    ).json()
    assert moved["kind"] is None
    assert reader.urls == ["https://example.com/"]
