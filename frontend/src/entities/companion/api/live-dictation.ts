import { apiSocketUrl } from '@/shared/api'

/** Pourquoi la transcription en direct s'est arrêtée (codes du serveur,
 *  plus `unreachable` : la connexion n'a pas abouti ou s'est coupée). */
export type LiveDictationError =
  | 'not_found'
  | 'unavailable'
  | 'too_long'
  | 'bad_message'
  | 'failed'
  | 'unreachable'

/** Une transcription en direct ouverte : on y pousse l'audio, on l'arrête,
 *  ou on l'abandonne. */
export interface LiveDictation {
  /** Une tranche de PCM 16 bits, mono, 16 kHz. */
  send: (pcm: ArrayBuffer) => void
  /** Plus d'audio : le serveur valide la fin et rend le texte (`onFinal`). */
  stop: () => void
  /** Abandonner : rien ne revient. */
  close: () => void
}

/**
 * La transcription en direct d'une dictée, par WebSocket
 * (`/skills/{id}/dictation/live`, protocole : `backend/…/api/dictation.py`).
 * Hors de TanStack Query : un flux, pas une requête.
 *
 * - L'audio poussé avant l'ouverture attend dans une file : on parle dès
 *   le clic, rien n'est perdu.
 * - `onTranscript` reçoit, après chaque passe de Whisper, tout le texte
 *   validé (`committed`) et le provisoire qui le suit (`tentative`) ;
 * - `onFinal` le texte complet, après `stop` ;
 * - `onError` un échec — le serveur le dit (`detail`), ou la connexion
 *   tombe avant le texte final. Un seul des deux arrive, une fois.
 */
export function openLiveDictation({
  skillId,
  resourceId,
  onTranscript,
  onFinal,
  onError,
}: {
  skillId: string
  resourceId: string | null
  onTranscript: (committed: string, tentative: string) => void
  onFinal: (text: string) => void
  onError: (code: LiveDictationError, detail: string | null) => void
}): LiveDictation {
  const query = resourceId ? `?resource_id=${resourceId}` : ''
  const socket = new WebSocket(
    apiSocketUrl(`/skills/${skillId}/dictation/live${query}`),
  )
  socket.binaryType = 'arraybuffer'
  const waiting: (ArrayBuffer | string)[] = []
  let over = false
  const end = () => {
    over = true
    waiting.length = 0
  }

  const push = (data: ArrayBuffer | string) => {
    if (over) return
    if (socket.readyState === WebSocket.OPEN) socket.send(data)
    else if (socket.readyState === WebSocket.CONNECTING) waiting.push(data)
  }
  socket.onopen = () => {
    for (const data of waiting) socket.send(data)
    waiting.length = 0
  }
  socket.onmessage = (event) => {
    if (over || typeof event.data !== 'string') return
    let message: {
      type?: string
      committed?: string
      tentative?: string
      text?: string
      code?: LiveDictationError
      detail?: string
    }
    try {
      message = JSON.parse(event.data)
    } catch {
      return
    }
    if (message.type === 'transcript')
      onTranscript(message.committed ?? '', message.tentative ?? '')
    else if (message.type === 'final') {
      end()
      onFinal(message.text ?? '')
    } else if (message.type === 'error') {
      end()
      onError(message.code ?? 'failed', message.detail ?? null)
    }
  }
  // Fermée sans texte final ni erreur dite : le serveur est tombé, ou ne
  // s'est jamais ouvert.
  socket.onclose = () => {
    if (over) return
    end()
    onError('unreachable', null)
  }

  return {
    send: (pcm) => push(pcm),
    stop: () => push(JSON.stringify({ type: 'stop' })),
    close: () => {
      end()
      socket.close()
    },
  }
}
