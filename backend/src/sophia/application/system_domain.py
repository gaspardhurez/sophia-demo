"""Le **domaine système** (« Sophia », 05/10/2026) : celui de l'app.

Il porte les activités méta — aujourd'hui l'activité du rituel de semaine.
Absent des listes de domaines, sans réglage (ni modification ni suppression),
on n'y ajoute pas d'activité à la main.

**Créé au premier besoin**, pas par la migration : une migration de données ne
sème pas de ligne dont le code a besoin (une base créée autrement — tests,
restauration — ne l'aurait pas), comme le pense-bête. Son identifiant est
**fixe** : les fantômes peuvent le nommer sans rien écrire, et un aller-retour
de migration (le downgrade le garde en domaine ordinaire) le retrouve.
"""

import uuid

from sqlalchemy.orm import Session

from sophia.infrastructure.models import Domain

SYSTEM_DOMAIN_ID = uuid.uuid5(uuid.NAMESPACE_URL, "sophia:system-domain")
SYSTEM_DOMAIN_NAME = "Sophia"


def system_domain(db: Session) -> Domain:
    """Le domaine système, créé s'il n'existe pas encore (idempotent).

    N'enregistre pas : l'appelant valide avec le reste de son geste."""
    domain = db.get(Domain, SYSTEM_DOMAIN_ID)
    if domain is None:
        domain = Domain(id=SYSTEM_DOMAIN_ID, name=SYSTEM_DOMAIN_NAME, system=True)
        db.add(domain)
        db.flush()
    elif not domain.system:
        domain.system = True
    return domain
