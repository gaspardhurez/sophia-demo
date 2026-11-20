"""Modèle `Domain` — le conteneur racine d'un champ d'apprentissage."""

import enum
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Enum, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from sophia.infrastructure.database import Base
from sophia.infrastructure.models.base import TimestampMixin, uuid_pk

if TYPE_CHECKING:
    from sophia.infrastructure.models.skill import Skill


class DomainStatus(enum.StrEnum):
    """Le domaine est-il une piste que je poursuis en ce moment ?

    Un domaine ne se supprime pas quand on cesse de s'y consacrer — son arbre,
    ses projets passés et son historique restent. Il se met **en veille** :
    il quitte l'accueil, et rien d'autre. Il reste ouvrable, choisissable dans
    un sélecteur, et ses activités déjà planifiées restent au calendrier.
    """

    active = "active"
    paused = "paused"


class Domain(TimestampMixin, Base):
    __tablename__ = "domains"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # Emoji illustratif, choisi par l'utilisateur (optionnel).
    emoji: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # Couleur du domaine (clé de palette curée, ex. « emerald ») — utilisée
    # partout (activités, cartes, page). Cf. schéma pour les valeurs permises.
    color: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Cap du domaine : « où je veux arriver » (non daté, jamais « fini »).
    vision: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Les préférences de ressources du domaine (#175), en texte libre (format,
    # sources : « des coachs de joueurs pro ») : écrites une fois au cadrage
    # de l'étude, elles pré-remplissent celui du savoir suivant du domaine et
    # orientent la recherche de ressources du compagnon.
    resource_preferences: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Actif ou en veille — cf. `DomainStatus`. Ne filtre QUE l'accueil.
    status: Mapped[DomainStatus] = mapped_column(
        Enum(DomainStatus, name="domain_status"),
        nullable=False,
        default=DomainStatus.active,
        server_default=DomainStatus.active.value,
    )

    # Le domaine **système** (« Sophia », 05/10/2026) : celui de l'app, qui
    # porte ses activités méta (le rituel de semaine). Absent des listes, sans
    # réglage, on n'y ajoute rien à la main. Un seul, créé au premier besoin
    # (`application.system_domain`).
    system: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0"
    )

    # Les savoirs du domaine : il possède son arbre, et le supprimer l'emporte.
    skills: Mapped[list["Skill"]] = relationship(
        back_populates="domain",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    # Les projets ne sont pas une relation ici (#203) : un projet a plusieurs
    # domaines (`ProjectDomain`). Supprimer le domaine supprime ceux dont il
    # est le principal et délie les autres (`application.domains`).
