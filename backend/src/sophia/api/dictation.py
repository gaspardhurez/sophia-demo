"""Routes de la dictée dans les notes (#173) : la transcription en direct
(WebSocket), puis le nettoyage du texte (POST).

**Le WebSocket** `/skills/{skill_id}/dictation/live` (`?resource_id=` quand
on dicte dans les notes d'une ressource, pour l'amorce de Whisper) :

- le serveur accepte, vérifie le savoir (et la ressource, qui doit être la
  sienne) et les deux ports — sans clé, inutile de faire tourner Whisper —,
  puis envoie `{"type": "ready"}` ;
- le client envoie l'audio en **trames binaires** : PCM 16 bits signé,
  petit-boutiste, mono, 16 kHz, par tranches (~0,25 s) ;
- après chaque passe, le serveur envoie `{"type": "transcript",
  "committed": …, "tentative": …}` : tout le texte validé depuis le début,
  et le provisoire qui le suit ;
- le client envoie `{"type": "stop"}` ; le serveur valide la fin, envoie
  `{"type": "final", "text": …}` (le texte complet) et ferme ;
- un échec : `{"type": "error", "code": …, "detail": …}`, puis la
  fermeture. Codes : `not_found`, `unavailable` (le motif en `detail`),
  `too_long` (10 minutes), `bad_message`, `failed`.

Le client qui ferme abandonne la dictée : rien n'est gardé.

**Le nettoyage** `POST /skills/{skill_id}/dictation` : le texte final en
puces, par le LLM. Séparé du WebSocket pour que « Réessayer » renvoie le
même texte sans redicter.
"""

import asyncio
import contextlib
import json
import uuid

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, status
from starlette.concurrency import run_in_threadpool
from starlette.websockets import WebSocketState

from sophia.api.deps import CompanionDep, DbSession, TranscriberDep
from sophia.application import dictation as use_cases
from sophia.application import resources as resource_use_cases
from sophia.application import skills as skill_use_cases
from sophia.application.companion import CompanionUnavailable
from sophia.application.schemas.dictation import DictationCreate, DictationRead
from sophia.domain.dictation import AudioTooLong
from sophia.infrastructure.models import Resource, Skill

router = APIRouter(tags=["companion"])

NOT_FOUND = "Savoir ou ressource introuvable."
TOO_LONG = "Dictée trop longue : 10 minutes au plus."
BAD_MESSAGE = 'Message inattendu : de l\'audio PCM, ou {"type": "stop"}.'
FAILED = "La transcription a échoué."


def _target(
    db: DbSession, skill_id: uuid.UUID, resource_id: uuid.UUID | None
) -> tuple[Skill, Resource | None] | None:
    """Le savoir, et la ressource si elle est donnée — la sienne : une
    ressource d'un autre savoir n'est pas trouvée."""
    skill = skill_use_cases.get_skill(db, skill_id)
    if skill is None:
        return None
    if resource_id is None:
        return skill, None
    resource = resource_use_cases.get_resource(db, resource_id)
    if resource is None or resource.skill_id != skill.id:
        return None
    return skill, resource


@router.post(
    "/skills/{skill_id}/dictation",
    response_model=DictationRead,
    operation_id="cleanDictation",
    responses={
        404: {"description": "Savoir ou ressource introuvable."},
        502: {"description": "Le nettoyage n'a pas abouti (réseau, réponse)."},
        503: {"description": "Nettoyage indisponible ; le motif est en `detail`."},
    },
)
def clean_dictation(
    skill_id: uuid.UUID,
    payload: DictationCreate,
    db: DbSession,
    companion: CompanionDep,
) -> DictationRead:
    """Nettoie le texte d'une dictée en puces, à poser au curseur. Rien n'est
    enregistré ici."""
    target = _target(db, skill_id, payload.resource_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)
    skill, resource = target
    bullets = use_cases.clean(skill, resource, payload.transcript, companion=companion)
    return DictationRead(bullets=bullets)


# Ce que la réception passe à la boucle des passes : de l'audio, l'arrêt, ou
# le départ du client.
_STOP = object()
_GONE = object()


class _BadMessage(Exception):
    pass


async def _receive(websocket: WebSocket, inbox: asyncio.Queue) -> None:
    """Reçoit sans attendre les passes : l'audio s'accumule pendant que
    Whisper tourne, et la passe suivante le prend d'un coup."""
    while True:
        message = await websocket.receive()
        if message["type"] == "websocket.disconnect":
            await inbox.put(_GONE)
            return
        if message.get("bytes") is not None:
            await inbox.put(message["bytes"])
            continue
        try:
            stop = json.loads(message.get("text") or "").get("type") == "stop"
        except (ValueError, AttributeError):
            stop = False
        await inbox.put(_STOP if stop else _BadMessage())
        if stop:
            return


async def _fail(websocket: WebSocket, code: str, detail: str) -> None:
    if websocket.client_state == WebSocketState.CONNECTED:
        await websocket.send_json({"type": "error", "code": code, "detail": detail})
        await websocket.close()


@router.websocket("/skills/{skill_id}/dictation/live")
async def live_dictation(
    websocket: WebSocket,
    skill_id: uuid.UUID,
    db: DbSession,
    companion: CompanionDep,
    transcriber: TranscriberDep,
    resource_id: uuid.UUID | None = None,
) -> None:
    """La transcription en direct d'une dictée (protocole : en tête du
    module). Les passes tournent hors de la boucle (Whisper est synchrone) ;
    la réception, elle, ne s'arrête jamais."""
    await websocket.accept()
    target = _target(db, skill_id, resource_id)
    if target is None:
        await _fail(websocket, "not_found", NOT_FOUND)
        return
    try:
        use_cases.check_ports(transcriber.availability(), companion.availability())
    except CompanionUnavailable as exc:
        await _fail(websocket, "unavailable", exc.reason)
        return
    skill, resource = target
    hint = use_cases.whisper_hint(use_cases.dictation_context(skill, resource, ""))
    # La base n'a plus rien à dire : la connexion ne reste pas prise le
    # temps de la dictée (des minutes).
    db.close()

    session = use_cases.LiveDictation(transcriber, hint)
    inbox: asyncio.Queue = asyncio.Queue()
    receiver = asyncio.create_task(_receive(websocket, inbox))
    await websocket.send_json({"type": "ready"})
    try:
        while True:
            # Tout ce qui est arrivé pendant la passe d'avant, d'un coup.
            items = [await inbox.get()]
            while not inbox.empty():
                items.append(inbox.get_nowait())
            stop = False
            for item in items:
                if item is _GONE:
                    return
                if isinstance(item, _BadMessage):
                    await _fail(websocket, "bad_message", BAD_MESSAGE)
                    return
                if item is _STOP:
                    stop = True
                    break
                session.feed(item)
            if stop:
                break
            if session.due():
                await run_in_threadpool(session.step)
                await websocket.send_json(
                    {
                        "type": "transcript",
                        "committed": session.validated,
                        "tentative": session.tentative,
                    }
                )
        text = await run_in_threadpool(session.finish)
        await websocket.send_json({"type": "final", "text": text})
        await websocket.close()
    except AudioTooLong:
        await _fail(websocket, "too_long", TOO_LONG)
    except WebSocketDisconnect:
        # Parti pendant une passe : l'envoi échoue, rien à garder.
        pass
    except Exception:
        # Whisper a planté : on le dit au client (s'il est encore là), et
        # l'erreur remonte au journal du serveur.
        with contextlib.suppress(Exception):
            await _fail(websocket, "failed", FAILED)
        raise
    finally:
        receiver.cancel()
