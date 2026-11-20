"""Use cases du pense-bête — lire et écrire l'unique texte.

Pas de création à déclencher, pas de suppression : le pense-bête **existe
toujours**, vide au pire. Un écran qui doit d'abord demander « est-ce qu'il y en
a un ? » avant d'afficher un champ de saisie fait porter à l'interface une
question qui n'a qu'une réponse.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from sophia.application.schemas.notepad import NotepadWrite
from sophia.infrastructure.models import Notepad


def get_notepad(db: Session) -> Notepad:
    """L'unique pense-bête, créé au premier accès s'il n'existe pas encore.

    Le singleton se tient ici plutôt que par une ligne semée en migration :
    une donnée insérée par une migration se retrouve absente de toute base
    créée autrement (un test, une restauration partielle), et le bug ne se voit
    qu'au moment de lire.
    """
    pad = db.scalar(select(Notepad).limit(1))
    if pad is None:
        pad = Notepad(content="")
        db.add(pad)
        db.commit()
        db.refresh(pad)
    return pad


def save_notepad(db: Session, payload: NotepadWrite) -> Notepad:
    pad = get_notepad(db)
    pad.content = payload.content
    db.commit()
    db.refresh(pad)
    return pad
