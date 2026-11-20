"""Schémas du pense-bête. Un texte, rien d'autre."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NotepadRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    content: str
    updated_at: datetime


class NotepadWrite(BaseModel):
    content: str
