"""Schémas Pydantic des ressources d'un savoir (design #81) et de leurs notes
(#173)."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from sophia.domain.resource_kind import ResourceKind


class ResourceCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    author: str | None = Field(default=None, max_length=200)
    reference: str | None = Field(default=None, max_length=500)
    part: str | None = Field(default=None, max_length=200)
    #: Créée depuis ce cycle (de son savoir) : elle y entre aussi.
    plan_id: uuid.UUID | None = None


class ResourceUpdate(BaseModel):
    #: Facultatif mais jamais nul : un `null` explicite est refusé (422).
    title: str = Field(default=None, min_length=1, max_length=200)
    author: str | None = Field(default=None, max_length=200)
    reference: str | None = Field(default=None, max_length=500)
    part: str | None = Field(default=None, max_length=200)


class ResourceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    skill_id: uuid.UUID
    title: str
    author: str | None
    reference: str | None
    #: La sorte, lue au lien (vidéo, texte) ; nulle pour un autre lien ou une
    #: référence sans lien.
    kind: ResourceKind | None
    part: str | None
    created_at: datetime


class LinkTitle(BaseModel):
    """Le titre et l'auteur lus à un lien (l'auteur : une personne, sinon le
    site ; retiré de la fin du titre) ; `None` pour ce qui n'a pas pu
    l'être."""

    title: str | None
    author: str | None = None


class ResourceNotesRead(BaseModel):
    """Les notes d'une ressource."""

    #: Le document TipTap (`{"type": "doc", "content": […]}`), nul s'il n'a
    #: jamais été écrit. Même forme que les notes du savoir, sans questions.
    doc: dict[str, Any] | None


class ResourceNotesWrite(BaseModel):
    """Le document entier : il remplace l'ancien."""

    doc: dict[str, Any] | None = None
