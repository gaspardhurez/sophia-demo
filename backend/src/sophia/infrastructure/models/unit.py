"""Modèle `Unit` — le référentiel des unités de mesure.

Référencé par clé étrangère depuis `ActivityType`, `Metric`, `ProjectTotal` et
`ActivityValue`, pas juxtaposé à des colonnes texte : c'est la FK qui interdit une
unité fantôme et qui fait qu'un renommage se propage sans toucher aux lignes qui
l'emploient.

Le catalogue se construit **à l'usage** — aucune graine, on crée l'unité au
moment où on en a besoin.
"""

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from sophia.domain.unit import plural_of
from sophia.infrastructure.database import Base
from sophia.infrastructure.models.base import uuid_pk

if TYPE_CHECKING:
    from sophia.infrastructure.models.activity_type import ActivityType
    from sophia.infrastructure.models.metric import Metric


class UnitKind(enum.StrEnum):
    """Nature de l'unité — remplace la reconnaissance par expression régulière.

    **Purement descriptif depuis le 27/08/2026.** `time` portait l'effet métier
    (« la valeur d'une activité s'y déduit de sa durée ») avec le facteur en dur
    — une division par 3600. Il ne disait donc pas « c'est une durée » mais
    « compte en heures » : marquer `minute` d'un `time` aurait enregistré une
    séance de deux heures à « 2 ». C'est `seconds_per_unit` qui porte désormais
    l'échelle d'une durée ; la durée d'une activité, elle, ne passe plus par une
    unité (un Total en mode `duration` la lit au calendrier).
    """

    time = "time"
    distance = "distance"
    count = "count"
    other = "other"


class UnitTone(enum.StrEnum):
    """Teinte d'affichage — la palette d'étiquettes Notion.

    Distincte de la couleur d'un domaine : celle-ci porte du sens, une teinte
    d'unité ne sert qu'à distinguer.
    """

    default = "default"
    gray = "gray"
    brown = "brown"
    orange = "orange"
    yellow = "yellow"
    green = "green"
    blue = "blue"
    purple = "purple"
    pink = "pink"
    red = "red"


class Unit(Base):
    __tablename__ = "units"
    __table_args__ = (UniqueConstraint("name", name="uq_units_name"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    # Forme singulière, telle que saisie (« kilomètre », « km », « spécialité »).
    name: Mapped[str] = mapped_column(String(30), nullable=False)
    # Pluriel ; `null` = accord par défaut (singulier + « s »). Le français ne
    # le dérive pas toujours par cette règle — « morceaux », « km » invariable —
    # d'où la possibilité de l'écrire.
    plural: Mapped[str | None] = mapped_column(String(30), nullable=True)
    # Forme d'affichage de la pastille ; `null` = singulier avec une capitale.
    # Une vignette tout en minuscules fait négligé, alors qu'en ligne après un
    # nombre la minuscule s'impose : deux usages, deux formes.
    label: Mapped[str | None] = mapped_column(String(30), nullable=True)
    kind: Mapped[UnitKind] = mapped_column(
        Enum(UnitKind, name="unit_kind"), nullable=False, default=UnitKind.count
    )
    # **Combien de secondes vaut UNE unité** — 60 pour la minute, 3600 pour
    # l'heure. `null` = l'unité ne mesure pas une durée, et c'est le cas courant.
    #
    # Un seul champ pour deux réponses, parce qu'elles sont indissociables :
    # savoir qu'on manipule une durée n'aide en rien si on ignore son échelle.
    # Il commande donc à la fois la saisie en `mm:ss` (49:30 se stocke 49,5 en
    # minutes — la valeur reste un nombre dans son unité, rien de spécial en
    # base) et sa relecture. Une unité de durée ne se **déclare** pas sur une
    # activité : la durée se lit au calendrier (Total en mode `duration`).
    seconds_per_unit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Ce qu'on compte, en une image. Sur l'UNITÉ et nulle part ailleurs : une
    # barre annonce une mesure (« 50 heures », « 25 recettes »), et c'est la
    # mesure qui se dessine. L'emoji d'une activité type reste le sien — il
    # l'identifie sur les pastilles du calendrier — mais il ne légende plus une
    # barre : deux sources pour un même signal demandaient une règle de
    # priorité qui ne payait pas sa complexité.
    emoji: Mapped[str | None] = mapped_column(String(16), nullable=True)
    tone: Mapped[UnitTone] = mapped_column(
        Enum(UnitTone, name="unit_tone"), nullable=False, default=UnitTone.default
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    # Supprimer une unité délie les activités types et les métriques (SET NULL
    # côté base) : on ne détruit pas ce qu'on fait ou ce qu'on mesure parce
    # qu'on range son référentiel. Les Totaux en valeur et les valeurs déclarées
    # partent en revanche avec elle (CASCADE) — sans unité, ils ne disent plus
    # rien ; d'où le remplacement proposé à la suppression (`replace_by`).
    activity_types: Mapped[list["ActivityType"]] = relationship(
        back_populates="unit", passive_deletes=True
    )
    metrics: Mapped[list["Metric"]] = relationship(
        back_populates="unit", passive_deletes=True
    )

    @property
    def effective_plural(self) -> str:
        """Pluriel affiché : celui saisi, sinon la règle (`plural_of`)."""
        return self.plural or plural_of(self.name)

    @property
    def effective_label(self) -> str:
        """Libellé de la pastille : celui saisi, sinon le singulier capitalisé."""
        return self.label or (self.name[:1].upper() + self.name[1:])
