"""Schémas Pydantic des indisponibilités (#105)."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UnavailabilityCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=200)
    emoji: str | None = Field(default=None, max_length=16)
    all_day: bool = False
    start_at: datetime
    end_at: datetime
    notes: str | None = None


class UnavailabilityUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    #: Facultatifs mais jamais nuls : un `null` explicite est refusé (422).
    title: str = Field(default=None, min_length=1, max_length=200)
    all_day: bool = Field(default=None)
    start_at: datetime = Field(default=None)
    end_at: datetime = Field(default=None)
    emoji: str | None = Field(default=None, max_length=16)
    notes: str | None = None


class UnavailabilitySlotCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=200)
    emoji: str | None = Field(default=None, max_length=16)
    start_at: datetime
    end_at: datetime


class UnavailabilitySlotUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(default=None, min_length=1, max_length=200)
    start_at: datetime = Field(default=None)
    end_at: datetime = Field(default=None)
    emoji: str | None = Field(default=None, max_length=16)


class UnavailabilitySlotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    emoji: str | None
    title: str
    start_at: datetime
    end_at: datetime


class UnavailabilityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    emoji: str | None
    title: str
    all_day: bool
    start_at: datetime
    end_at: datetime
    notes: str | None
    slots: list[UnavailabilitySlotRead]
