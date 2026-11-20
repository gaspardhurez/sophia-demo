"""Use cases des médias — écrire une image dans le dossier média, la retrouver.

Pas de table : le dossier **est** le stockage, le nom du fichier son
identifiant. Pas de suppression non plus : un fichier orphelin ne coûte rien,
on verra à l'usage.
"""

import os
import tempfile
from pathlib import Path
from typing import BinaryIO

from sophia.application.schemas.media import MediaRead
from sophia.domain.media import (
    MAX_MEDIA_BYTES,
    MediaNotFound,
    MediaTooLarge,
    accepted_type,
    check_signature,
    check_size,
    media_type_of,
    new_media_id,
)

_CHUNK = 1024 * 1024


def save_media(media_dir: Path, declared_type: str | None, data: BinaryIO) -> MediaRead:
    """Écrit le fichier de façon **atomique** : dans un temporaire du même
    dossier, puis renommé. Un nom de média n'existe donc que complet — une
    écriture interrompue ne laisse qu'un `.tmp`, jamais une image tronquée.
    """
    content_type = accepted_type(declared_type)
    media_dir.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(dir=media_dir, prefix=".upload-", suffix=".tmp")
    tmp = Path(tmp_name)
    try:
        size = 0
        with os.fdopen(fd, "wb") as out:
            first = True
            # On lit au plus une fois au-delà de la limite : un fichier trop
            # gros est refusé sans être recopié en entier.
            while chunk := data.read(_CHUNK):
                if first:
                    check_signature(content_type, chunk[:16])
                    first = False
                size += len(chunk)
                if size > MAX_MEDIA_BYTES:
                    raise MediaTooLarge
                out.write(chunk)
            if first:
                check_signature(content_type, b"")
            check_size(size)
            out.flush()
            os.fsync(out.fileno())
        media_id = new_media_id(content_type)
        os.replace(tmp, media_dir / media_id)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    return MediaRead(
        id=media_id, url=f"/media/{media_id}", content_type=content_type, size=size
    )


def media_file(media_dir: Path, media_id: str) -> tuple[Path, str]:
    """Le chemin et le type d'un média existant."""
    content_type = media_type_of(media_id)
    path = media_dir / media_id
    if not path.is_file():
        raise MediaNotFound
    return path, content_type
