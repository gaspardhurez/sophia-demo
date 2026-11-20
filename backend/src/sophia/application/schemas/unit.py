"""Schémas Pydantic du référentiel d'unités."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from sophia.infrastructure.models import UnitKind, UnitTone


class UnitCreate(BaseModel):
    name: str = Field(min_length=1, max_length=30)
    plural: str | None = Field(default=None, max_length=30)
    label: str | None = Field(default=None, max_length=30)
    kind: UnitKind = UnitKind.count
    # Secondes que vaut une unité (60, 3600) ; `null` = pas une durée.
    seconds_per_unit: int | None = Field(default=None, gt=0)
    emoji: str | None = Field(default=None, max_length=16)
    tone: UnitTone = UnitTone.default


class UnitUpdate(BaseModel):
    """Renommage, accord, nature, teinte — tout est modifiable après coup."""

    name: str | None = Field(default=None, min_length=1, max_length=30)
    plural: str | None = Field(default=None, max_length=30)
    label: str | None = Field(default=None, max_length=30)
    kind: UnitKind | None = None
    seconds_per_unit: int | None = Field(default=None, gt=0)
    emoji: str | None = Field(default=None, max_length=16)
    tone: UnitTone | None = None


class UnitRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    # Formes brutes : `null` = « suis la règle par défaut ». Le client en a
    # besoin pour afficher le placeholder du champ.
    plural: str | None
    label: str | None
    # Formes résolues, prêtes à afficher.
    effective_plural: str
    effective_label: str
    kind: UnitKind
    # Non-null = l'unité mesure une durée, et dit à quelle échelle. Commande
    # la saisie et la lecture en `mm:ss` ; une telle unité ne se déclare pas
    # sur une activité (la durée se lit au calendrier, Total en mode `duration`).
    seconds_per_unit: int | None
    emoji: str | None
    tone: UnitTone
    created_at: datetime


class UnitUsage(BaseModel):
    """Ce qu'une suppression toucherait — pour l'annoncer avant de la faire.

    Sans remplacement, Totaux et valeurs déclarées sont **supprimés** (ils n'ont
    pas de sens sans leur unité), métriques et activités types **déliées**. Avec
    remplacement, tout bascule vers l'autre unité.
    """

    totals: int
    values: int
    metrics: int
    activity_types: int
