"""Schémas du compagnon : l'état de ses actions, pour griser ce qui ne marche pas."""

from pydantic import BaseModel


class ActionStatus(BaseModel):
    available: bool
    # Pourquoi l'action est indisponible, en français ; `None` si elle l'est.
    reason: str | None


class CompanionStatus(BaseModel):
    # Dicter dans les notes : transcription puis nettoyage (les deux ports).
    dictation: ActionStatus
    # Vérifier les notes d'une ressource.
    review: ActionStatus
    # Proposer les idées centrales à ancrer et tester.
    ideas: ActionStatus
    # Répondre dans un fil.
    reply: ActionStatus
    # Cadrer l'étude (#175) : les questions de l'intention…
    intention: ActionStatus
    # … le périmètre proposé…
    scope: ActionStatus
    # … et la recherche de ressources.
    resources: ActionStatus
