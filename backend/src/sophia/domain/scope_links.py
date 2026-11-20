"""Les liens d'une ressource au périmètre de son cycle (30/10). Pur, sans
framework.

Dans un cycle, une ressource se lie à des **parties retenues** du périmètre
(`plan_resources.scope_parts`, des libellés). Le périmètre reste un texte
(`acquisition_plans.scope`, `domain/framing.py`) : les liens le **suivent**
quand il est réécrit — une partie renommée emporte ses liens sous son
nouveau nom, une partie qui n'est plus retenue (supprimée, ou passée « Hors
de ce cycle ») les perd.
"""

from sophia.domain.framing import scope_parts
from sophia.domain.plan import PlanScopePartUnknown


def link_scope_parts(labels: list[str], scope: str | None) -> list[str]:
    """Les parties auxquelles lier une ressource, vérifiées contre le
    périmètre courant : chacune doit être une partie retenue, sinon
    `PlanScopePartUnknown`. Rendues dans l'ordre du périmètre, sans doublon."""
    parts = scope_parts(scope)
    unknown = [label for label in labels if label not in parts]
    if unknown:
        raise PlanScopePartUnknown(unknown[0])
    wanted = set(labels)
    return [p for p in parts if p in wanted]


def follow_scope(
    linked: list[str], scope: str | None, renames: dict[str, str]
) -> list[str]:
    """Les liens d'une ressource après une réécriture du périmètre :

    - les renommages (`ancien → nouveau`) s'appliquent d'abord, tous ensemble
      (pas en chaîne) ;
    - puis seules restent les parties retenues du nouveau périmètre — une
      partie supprimée, passée hors du cycle, ou un périmètre vidé défait le
      lien ;
    - dans l'ordre du périmètre, sans doublon (deux parties fondues en une
      par un renommage ne font qu'un lien).
    """
    wanted = {renames.get(label, label) for label in linked}
    return [p for p in scope_parts(scope) if p in wanted]
