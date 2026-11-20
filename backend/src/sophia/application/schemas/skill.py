"""Schémas Pydantic exposés par l'API pour les compétences.

`parent_skill_id` n'apparaît pas dans `SkillUpdate` : tout changement de parent
passe par l'endpoint dédié `reparent` (invariants profondeur/cycle à valider).
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from sophia.infrastructure.models import SkillStatus


class SkillCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    parent_skill_id: uuid.UUID | None = None
    status: SkillStatus = SkillStatus.not_started
    # Son rang parmi ses frères ; absent, il se range en dernier.
    order: int | None = None


class SkillUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    status: SkillStatus | None = None
    order: int | None = None


class SkillReparent(BaseModel):
    new_parent_id: uuid.UUID | None = None
    # Sa place parmi ses nouveaux frères (0 = en tête) ; absente, en dernier.
    # C'est ainsi qu'on réordonne : on reste sous le même parent, à un autre rang.
    index: int | None = Field(default=None, ge=0)


class SkillRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    domain_id: uuid.UUID
    parent_skill_id: uuid.UUID | None
    name: str
    description: str | None
    status: SkillStatus
    order: int
    # 0 à 4 : non commencé, Étude, Pratique, Application, acquis (cf. modèle).
    level: int
    # Un cycle en cours (à clore compris).
    has_open_cycle: bool
    # Un cycle en cours ou prévu : ses pièces se posent (#107).
    has_cycle: bool
    created_at: datetime
    updated_at: datetime
