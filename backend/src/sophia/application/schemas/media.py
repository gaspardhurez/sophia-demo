"""Schémas des médias. Un média est un fichier : pas d'entité derrière."""

from pydantic import BaseModel


class MediaRead(BaseModel):
    id: str
    url: str
    content_type: str
    size: int
