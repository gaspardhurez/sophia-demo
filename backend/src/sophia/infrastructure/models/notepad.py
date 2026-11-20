"""Modèle `Notepad` — le pense-bête, un seul texte pour toute l'app.

**Une ligne, pas une liste.** Ce qu'on note ici, ce sont des remarques d'usage
jetées au fil de l'eau : « le compteur est faux », « le bouton est trop loin ».
Les découper en objets distincts demanderait de décider, à chaque remarque, où
elle commence et où elle finit — un travail de rangement au moment précis où
l'on veut juste ne pas perdre le fil de ce qu'on faisait.

Le format libre porte aussi ce qu'une liste d'items perdrait : les ratures, les
regroupements, l'ordre qu'on se donne soi-même.

Il vit en **base** et non dans le navigateur, parce qu'il n'est pas lu que par
l'app : c'est de là que sortent les prochains chantiers, et il faut pouvoir le
relire d'ailleurs.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from sophia.infrastructure.database import Base
from sophia.infrastructure.models.base import uuid_pk


class Notepad(Base):
    __tablename__ = "notepad"

    id: Mapped[uuid.UUID] = uuid_pk()
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    #: Sert à dire « enregistré » à l'écran, et à voir d'un coup d'œil si le
    #: pense-bête a bougé depuis la dernière fois qu'on l'a dépouillé.
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )
