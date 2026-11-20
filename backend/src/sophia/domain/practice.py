"""Invariants métier des objets de pratique (V4). Pur, sans framework."""


class PracticeError(Exception):
    """Base des violations d'invariant sur un objet de pratique."""


class PracticeSkillNotFound(PracticeError):
    """La compétence à laquelle rattacher l'objet de pratique n'existe pas."""


class PracticePlanMismatch(PracticeError):
    """Le cycle où ranger le nouvel objet n'est pas un cycle de son savoir."""
