"""Les images des notes, téléversées en local (décision du 03/10/2026). Pur.

Un média est un fichier sur disque, sans ligne en base : son **nom** porte
tout ce qu'on a besoin de savoir — un uuid (unique, donc cacheable à vie) et
une extension qui dit son type. Ce module tient les deux règles qui protègent
ce dossier : quel contenu y entre (types acceptés, taille, contenu conforme à
son type) et quel nom peut en sortir (aucun chemin, rien d'autre qu'un nom
produit ici).

**Pas de SVG** : un SVG peut embarquer du script ; ouvert directement depuis
l'URL de l'API, il s'exécuterait sur l'origine de l'API et pourrait l'appeler
librement. Pour des captures et des schémas exportés, PNG/JPEG/GIF/WebP
suffisent.
"""

import re
import uuid


class MediaError(Exception):
    """Base des refus sur les médias."""


class UnsupportedMediaType(MediaError):
    """Type non accepté, ou contenu qui n'est pas ce que son type annonce."""


class MediaTooLarge(MediaError):
    """Le fichier dépasse la taille maximale."""


class MediaNotFound(MediaError):
    """Aucun média de ce nom — ou un nom qui n'en est pas un."""


MAX_MEDIA_BYTES = 20 * 1024 * 1024

# Type MIME → extension. Une seule extension par type : le nom se déduit du
# type et le type se relit du nom, sans ambiguïté.
MEDIA_TYPES: dict[str, str] = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
}
_TYPE_OF_EXTENSION = {ext: ct for ct, ext in MEDIA_TYPES.items()}

# uuid4 canonique en minuscules, un point, une extension connue. Rien d'autre :
# ni séparateur, ni `..`, ni encodage — un nom qui ne correspond pas n'existe pas.
_MEDIA_ID = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
    r"\.(" + "|".join(map(re.escape, _TYPE_OF_EXTENSION)) + r")"
)


def accepted_type(declared: str | None) -> str:
    """Le type déclaré, normalisé, s'il est accepté (`image/png; x=y` → `image/png`)."""
    content_type = (declared or "").split(";", 1)[0].strip().lower()
    if content_type not in MEDIA_TYPES:
        raise UnsupportedMediaType
    return content_type


def check_signature(content_type: str, head: bytes) -> None:
    """Le contenu commence bien comme son type l'annonce.

    Le type déclaré vient du navigateur (souvent de l'extension du fichier) :
    on le confronte aux premiers octets pour ne servir sous `image/png` que du
    PNG — un fichier renommé, ou autre chose qu'une image, est refusé.
    """
    ok = {
        "image/png": head.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/jpeg": head.startswith(b"\xff\xd8\xff"),
        "image/gif": head.startswith((b"GIF87a", b"GIF89a")),
        "image/webp": head[:4] == b"RIFF" and head[8:12] == b"WEBP",
    }[content_type]
    if not ok:
        raise UnsupportedMediaType


def check_size(size: int) -> None:
    if size > MAX_MEDIA_BYTES:
        raise MediaTooLarge


def new_media_id(content_type: str) -> str:
    """Un nom neuf pour un média de ce type : `<uuid>.<extension>`."""
    return f"{uuid.uuid4()}.{MEDIA_TYPES[content_type]}"


def media_type_of(media_id: str) -> str:
    """Le type d'un média d'après son nom, si ce nom est valide.

    Seul garde-fou contre la traversée de répertoire : un nom qui passe ici
    est un simple nom de fichier, jamais un chemin.
    """
    match = _MEDIA_ID.fullmatch(media_id)
    if match is None:
        raise MediaNotFound
    return _TYPE_OF_EXTENSION[match.group(1)]
