"""La séquence d'acquisition d'un projet (design #27, décidée le 24/09/2026).

L'ordre dans lequel on prévoit d'attaquer les savoirs d'un projet. Le rang
vit sur le lien projet ↔ savoir — jamais sur le savoir, qui peut être rangé
autrement dans un autre projet. Un savoir sans rang est **hors séquence** :
c'est là que tombe tout savoir qu'on lie, il n'y a pas d'état intermédiaire.

L'étape est une **coupe** dans la séquence, pas une seconde saisie :

- un savoir d'une étape est forcément rangé ;
- les rangs sont continus (1, 2, 3…) et traversent les étapes : ceux de
  l'étape 1 précèdent tous ceux de l'étape 2 ;
- sans étapes, la séquence se lit à plat.

Ce module calcule l'ordre qui tient ces règles ; l'application l'écrit.
"""

import unicodedata
import uuid
from dataclasses import dataclass


def name_key(name: str) -> str:
    """L'ordre alphabétique à la française : « Écrire » avec les E, pas après
    « Tracer » — les accents ne classent pas."""
    decomposed = unicodedata.normalize("NFD", name)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).casefold()


@dataclass(frozen=True)
class Placed:
    """Un savoir du projet tel que la séquence le voit."""

    skill_id: uuid.UUID
    position: int | None
    name: str


def _key(p: Placed) -> tuple[bool, int, str]:
    # À l'intérieur d'une étape : le rang connu d'abord, puis les nouveaux
    # venus par ordre alphabétique — un ordre neutre, qu'on corrige au glisser.
    return (p.position is None, p.position or 0, name_key(p.name))


def sequence_order(
    steps: list[list[Placed]], unstepped: list[Placed]
) -> list[uuid.UUID]:
    """Les savoirs rangés, dans l'ordre de la séquence.

    `steps` : les savoirs de chaque étape, étapes dans leur ordre.
    `unstepped` : les savoirs du projet qu'aucune étape ne porte.

    Avec des étapes, n'est rangé que ce qu'une étape porte : un savoir rangé
    hors de toute étape n'a pas de place entre deux coupes, il repasse hors
    séquence. Sans étapes, la séquence à plat garde les rangs qu'elle a.
    """
    if steps:
        return [p.skill_id for step in steps for p in sorted(step, key=_key)]
    ranked = [p for p in unstepped if p.position is not None]
    return [p.skill_id for p in sorted(ranked, key=_key)]
