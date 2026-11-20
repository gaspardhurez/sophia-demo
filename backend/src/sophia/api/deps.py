"""Dépendances FastAPI partagées par les routers."""

from functools import lru_cache
from pathlib import Path
from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from sophia.application.companion import Companion, Transcriber
from sophia.application.resources import LinkReader
from sophia.application.review import SourceReader
from sophia.infrastructure.config import settings
from sophia.infrastructure.database import get_db
from sophia.infrastructure.link_reader import WebLinkReader
from sophia.infrastructure.llm import build_companion
from sophia.infrastructure.sources import WebSourceReader
from sophia.infrastructure.transcription import build_transcriber

DbSession = Annotated[Session, Depends(get_db)]


def get_media_dir() -> Path:
    """Le dossier média — une dépendance, pour que les tests le remplacent."""
    return settings.media_dir


MediaDir = Annotated[Path, Depends(get_media_dir)]


# Les ports du compagnon, construits une fois par processus (le client du LLM se
# crée au premier appel, pas à chaque requête ; les processus Claude Code de
# l'abonnement se préchauffent dans ce même objet) ; des dépendances, pour que
# les tests les remplacent. Poser la clé, changer `SOPHIA_LLM_BACKEND` ou
# installer mlx-whisper demande donc de relancer le serveur.
@lru_cache
def get_companion() -> Companion:
    return build_companion(settings)


@lru_cache
def get_transcriber() -> Transcriber:
    return build_transcriber(settings)


CompanionDep = Annotated[Companion, Depends(get_companion)]
TranscriberDep = Annotated[Transcriber, Depends(get_transcriber)]


def get_source_reader() -> SourceReader:
    """La lecture de la source d'une ressource (page web, sous-titres) — une
    dépendance, pour que les tests n'aillent jamais sur le réseau."""
    return WebSourceReader()


SourceReaderDep = Annotated[SourceReader, Depends(get_source_reader)]


def get_link_reader() -> LinkReader:
    """La lecture d'un lien pour la sorte d'une ressource — une dépendance,
    pour que les tests n'aillent jamais sur le réseau."""
    return WebLinkReader()


LinkReaderDep = Annotated[LinkReader, Depends(get_link_reader)]
