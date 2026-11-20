"""Invariants des ressources d'un savoir (design #81). Pur, sans framework."""


class ResourceError(Exception):
    """Base des violations d'invariant sur une ressource."""


class ResourceSkillNotFound(ResourceError):
    """Le savoir auquel rattacher la ressource n'existe pas."""


class ResourcePlanMismatch(ResourceError):
    """Le cycle où ranger la nouvelle ressource n'est pas un cycle de son
    savoir."""
