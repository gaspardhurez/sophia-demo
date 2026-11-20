"""Invariants métier des domaines. Pur, sans framework."""


class DomainError(Exception):
    """Base des refus sur un domaine."""


class SystemDomainLocked(DomainError):
    """Le domaine système (« Sophia ») n'a pas de réglage : il ne se modifie
    ni ne se supprime."""
