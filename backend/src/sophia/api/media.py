"""Routes des médias — téléverser une image, la servir.

Pas de DELETE : un fichier orphelin ne coûte rien, on verra à l'usage.
"""

from fastapi import APIRouter, UploadFile
from fastapi.responses import FileResponse

from sophia.api.deps import MediaDir
from sophia.application import media as use_cases
from sophia.application.schemas.media import MediaRead

router = APIRouter(tags=["media"])


@router.post(
    "/media",
    response_model=MediaRead,
    status_code=201,
    operation_id="uploadMedia",
    responses={
        413: {"description": "Fichier trop gros (20 Mo au plus)."},
        415: {"description": "Type refusé : PNG, JPEG, GIF ou WebP."},
    },
)
def upload_media(file: UploadFile, media_dir: MediaDir) -> MediaRead:
    return use_cases.save_media(media_dir, file.content_type, file.file)


@router.get(
    "/media/{media_id}",
    response_class=FileResponse,
    operation_id="getMedia",
    responses={
        200: {
            "content": {
                "image/png": {},
                "image/jpeg": {},
                "image/gif": {},
                "image/webp": {},
            }
        },
        404: {"description": "Média introuvable."},
    },
)
def get_media(media_id: str, media_dir: MediaDir) -> FileResponse:
    path, content_type = use_cases.media_file(media_dir, media_id)
    # Le nom est unique et le fichier ne change jamais : cache à vie.
    # `nosniff` : le navigateur s'en tient au type annoncé.
    return FileResponse(
        path,
        media_type=content_type,
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    )
