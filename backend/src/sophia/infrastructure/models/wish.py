"""Modèle `Wish` — une puce de la colonne du calendrier (#215).

Deux listes qu'on écrit sur place en planifiant : les **envies** (ce qu'on a
envie de faire ces temps-ci) et les **engagements** (ce qu'on s'est engagé à
faire). Ni date, ni coche, ni trace : un texte, un domaine facultatif, une
place dans sa liste. Ce n'est pas une activité — rien ne se glisse au
calendrier depuis ici.

Le domaine sert au filtre de la colonne ; supprimer le domaine garde la puce,
sans domaine.
"""

import enum
import uuid

from sqlalchemy import Enum, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from sophia.infrastructure.database import Base
from sophia.infrastructure.models.base import TimestampMixin, uuid_pk


class WishKind(enum.StrEnum):
    WISH = "wish"  # une envie
    COMMITMENT = "commitment"  # un engagement


class Wish(TimestampMixin, Base):
    __tablename__ = "wishes"

    #: Donné par le client : la liste s'écrit comme un texte (couper, recoller)
    #: et s'enregistre d'un bloc, chaque puce garde son id d'une écriture à
    #: l'autre.
    id: Mapped[uuid.UUID] = uuid_pk()
    kind: Mapped[WishKind] = mapped_column(
        Enum(WishKind, native_enum=False, length=16), nullable=False, index=True
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    domain_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("domains.id", ondelete="SET NULL"), nullable=True, index=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
