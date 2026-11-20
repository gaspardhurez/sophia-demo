"""Médias : téléverser une image des notes, la relire, refuser le reste."""

import uuid
from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from sophia.api.deps import get_media_dir
from sophia.domain.media import MAX_MEDIA_BYTES
from sophia.main import app

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
GIF = b"GIF89a" + b"\x00" * 64
WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"\x00" * 64


@pytest.fixture
def media_dir(tmp_path: Path) -> Path:
    # Un sous-dossier pas encore créé : l'envoi doit le créer au besoin.
    return tmp_path / "media"


@pytest.fixture
def media_client(media_dir: Path) -> Generator[TestClient, None, None]:
    app.dependency_overrides[get_media_dir] = lambda: media_dir
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_media_dir, None)


def upload(client: TestClient, content: bytes, content_type: str, name="x"):
    return client.post("/media", files={"file": (name, content, content_type)})


@pytest.mark.parametrize(
    ("content", "content_type", "ext"),
    [
        (PNG, "image/png", "png"),
        (JPEG, "image/jpeg", "jpg"),
        (GIF, "image/gif", "gif"),
        (WEBP, "image/webp", "webp"),
    ],
)
def test_upload_then_read_back_identical(
    media_client: TestClient, media_dir: Path, content, content_type, ext
):
    res = upload(media_client, content, content_type)
    assert res.status_code == 201
    body = res.json()
    media_id = body["id"]
    stem, _, suffix = media_id.partition(".")
    assert suffix == ext
    assert str(uuid.UUID(stem)) == stem
    assert body == {
        "id": media_id,
        "url": f"/media/{media_id}",
        "content_type": content_type,
        "size": len(content),
    }
    # Aucun temporaire ne traîne : seul le fichier final est là.
    assert [p.name for p in media_dir.iterdir()] == [media_id]

    got = media_client.get(body["url"])
    assert got.status_code == 200
    assert got.content == content
    assert got.headers["content-type"] == content_type
    assert got.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert got.headers["x-content-type-options"] == "nosniff"


def test_each_upload_gets_its_own_name(media_client: TestClient):
    a = upload(media_client, PNG, "image/png").json()["id"]
    b = upload(media_client, PNG, "image/png").json()["id"]
    assert a != b


@pytest.mark.parametrize(
    ("content", "content_type"),
    [
        (b'<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>', "image/svg+xml"),
        (b"<html><script>alert(1)</script></html>", "text/html"),
        (b"%PDF-1.7", "application/pdf"),
        (b"hello", "text/plain"),
        (PNG, "application/octet-stream"),
        # Le type annoncé ne correspond pas au contenu.
        (JPEG, "image/png"),
        (b"<svg/>", "image/png"),
        (b"", "image/png"),
    ],
)
def test_refused_types(
    media_client: TestClient, media_dir: Path, content: bytes, content_type: str
):
    res = upload(media_client, content, content_type)
    assert res.status_code == 415
    assert not media_dir.exists() or list(media_dir.iterdir()) == []


def test_too_large(media_client: TestClient, media_dir: Path):
    content = PNG + b"\x00" * (MAX_MEDIA_BYTES - len(PNG) + 1)
    res = upload(media_client, content, "image/png")
    assert res.status_code == 413
    # Le temporaire est effacé : rien n'est resté dans le dossier.
    assert list(media_dir.iterdir()) == []


def test_unknown_media_is_404(media_client: TestClient):
    res = media_client.get(f"/media/{uuid.uuid4()}.png")
    assert res.status_code == 404


@pytest.mark.parametrize(
    "path",
    [
        "/media/..%2F..%2Fsecret.png",
        "/media/%2e%2e",
        "/media/%2e%2e%2fsecret.png",
        "/media/..",
        "/media/secret.png",
        "/media/.secret.png",
        "/media/{uuid}",  # sans extension
        "/media/{uuid}.svg",  # extension inconnue
        "/media/{uuid}.PNG",
        "/media/{uuid}.png.tmp",
        "/media/{uuid}.png%00.txt",
    ],
)
def test_invalid_ids_and_traversal_are_404(
    media_client: TestClient, media_dir: Path, path: str
):
    # Un fichier tentant juste à côté du dossier média, et un autre dedans
    # sous un nom qui n'est pas un nom de média : aucun ne doit sortir.
    media_dir.mkdir(parents=True)
    (media_dir.parent / "secret.png").write_bytes(b"SECRET")
    (media_dir / "secret.png").write_bytes(b"SECRET")
    some_id = str(uuid.uuid4())
    (media_dir / some_id).write_bytes(b"SECRET")
    (media_dir / f"{some_id}.png.tmp").write_bytes(b"SECRET")

    res = media_client.get(path.replace("{uuid}", some_id))
    assert res.status_code == 404
    assert b"SECRET" not in res.content
