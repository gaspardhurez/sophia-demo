"""Schémas de la dictée : le texte transcrit à nettoyer, les puces rendues."""

import uuid

from pydantic import BaseModel, Field

from sophia.domain.dictation import MAX_TRANSCRIPT_CHARS


class DictationCreate(BaseModel):
    # Le texte validé de la dictée en direct, tel que Whisper l'a entendu.
    transcript: str = Field(max_length=MAX_TRANSCRIPT_CHARS)
    # La ressource dont on dicte les notes ; nul dans les notes du savoir.
    resource_id: uuid.UUID | None = None


class DictationRead(BaseModel):
    # Une puce par phrase, dans l'ordre dicté ; vide si rien n'a été entendu.
    bullets: list[str]
