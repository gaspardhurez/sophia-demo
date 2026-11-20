"""Les prompts du compagnon, un fichier par usage dans `prompts/`.

Un prompt est versionné dans le repo : sa première ligne dit sa version
(`version: dictation-1`), séparée du texte par une ligne `---`. La version part
au journal avec chaque appel — c'est elle qui relie un résultat au texte qui
l'a produit. On la change à chaque retouche du texte.

Le texte est le **prompt système, fixe** : il se met en cache côté API ; le
contexte variable va dans le message utilisateur.
"""

from dataclasses import dataclass
from functools import cache
from pathlib import Path

PROMPTS_DIR = Path(__file__).parent / "prompts"


@dataclass(frozen=True)
class Prompt:
    version: str
    text: str


@cache
def load_prompt(usage: str) -> Prompt:
    """Le prompt de l'usage (`dictation`…), lu une fois par processus."""
    raw = (PROMPTS_DIR / f"{usage}.md").read_text(encoding="utf-8")
    header, sep, text = raw.partition("\n---\n")
    key, _, version = header.partition(":")
    if not sep or key.strip() != "version" or not version.strip():
        raise ValueError(f"Prompt {usage} : en-tête « version: … » manquant.")
    return Prompt(version=version.strip(), text=text.strip())
