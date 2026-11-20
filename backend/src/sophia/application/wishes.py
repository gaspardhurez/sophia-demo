"""Use cases des envies et engagements (#215).

Une liste s'écrit comme un texte — Entrée coupe une puce, Retour arrière la
recolle — et s'enregistre **d'un bloc** : le client envoie la liste entière
d'un genre, dans l'ordre, chaque puce avec son id. Ce qui n'y est plus est
supprimé, ce qui est nouveau est créé. Comme le pense-bête, on remplace ; ⌘Z
renvoie la liste d'avant.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from sophia.application.schemas.wish import WishListWrite
from sophia.domain.wish import WishDomainNotFound, check_list
from sophia.infrastructure.models import Domain, Wish, WishKind


def list_wishes(db: Session) -> list[Wish]:
    """Les deux listes : les envies, puis les engagements, chacune dans son
    ordre."""
    rows = db.scalars(select(Wish).order_by(Wish.position))
    return sorted(rows, key=lambda w: (w.kind != WishKind.WISH, w.position))


def replace_wishes(db: Session, kind: WishKind, payload: WishListWrite) -> list[Wish]:
    """Remplace la liste d'un genre ; renvoie la nouvelle."""
    others = set(db.scalars(select(Wish.id).where(Wish.kind != kind)))
    check_list([i.id for i in payload.items], others)

    domain_ids = {i.domain_id for i in payload.items if i.domain_id is not None}
    if domain_ids:
        found = set(db.scalars(select(Domain.id).where(Domain.id.in_(domain_ids))))
        if found != domain_ids:
            raise WishDomainNotFound

    current = {w.id: w for w in db.scalars(select(Wish).where(Wish.kind == kind))}
    kept: list[Wish] = []
    for position, item in enumerate(payload.items):
        wish = current.pop(item.id, None)
        if wish is None:
            wish = Wish(id=item.id, kind=kind)
            db.add(wish)
        wish.text = item.text
        wish.domain_id = item.domain_id
        wish.position = position
        kept.append(wish)
    for gone in current.values():
        db.delete(gone)
    db.commit()
    for wish in kept:
        db.refresh(wish)
    return kept
