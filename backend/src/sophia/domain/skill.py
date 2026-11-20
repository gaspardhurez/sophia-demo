"""Invariants métier de l'arbre de compétences — pur, sans dépendance framework.

La logique qui parcourt réellement l'arbre (et a donc besoin de la base) vit dans
`application/skills.py` ; ici on ne garde que les erreurs métier qu'une violation
lève.

**Plus de profondeur maximale (31/08/2026).** Elle valait 3, et c'était une
limite de produit, pas une nécessité technique. Elle est tombée au premier
domaine large : ranger l'informatique demande un niveau de tiroirs (CS,
Software…) avant même d'arriver aux sujets, et « DSA › Graphes › BFS » consommait
déjà les trois. Ce qui garde l'arbre lisible n'est pas un plafond mais le test de
la feuille — un nœud tient s'il s'écrit en une fiche et se coche d'un bloc.
Restent les invariants qui, eux, protègent l'intégrité : pas de cycle, un parent
du même domaine.
"""


class SkillTreeError(Exception):
    """Base des violations d'invariant de l'arbre de compétences."""


class ParentNotFound(SkillTreeError):
    """Le parent référencé n'existe pas."""


class CrossDomainParent(SkillTreeError):
    """Le parent n'est pas du domaine visé — un enfant vit dans celui de son parent."""


class SkillCycle(SkillTreeError):
    """L'opération ferait d'une compétence son propre ancêtre."""
