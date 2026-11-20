import { ApiError } from '@/shared/api'
import type { RecorderFailure } from '@/shared/lib/use-audio-recorder'

import type { LiveDictationError } from '../api/live-dictation'

/**
 * Ce qu'on peut faire d'une dictée qui a échoué :
 * - `resend` : renvoyer **le même texte** au nettoyage — la panne est en
 *   aval (nettoyage raté, serveur injoignable), la voix n'y est pour rien ;
 * - `record` : dicter à nouveau — la transcription n'a pas abouti (trop
 *   longue, coupée, Whisper en échec) ;
 * - `none` : rien à retenter d'ici — la dictée est indisponible, et le
 *   bouton se grise de lui-même une fois l'état du compagnon relu.
 */
export type DictationRetry = 'resend' | 'record' | 'none'

/**
 * Le message et le recours d'un nettoyage échoué, d'après le statut de la
 * réponse (cf. `POST /skills/{id}/dictation`). Les motifs du serveur sont
 * en français mais écrits pour l'API ; on dit plutôt ce que l'échec veut
 * dire pour celui qui dicte. Seul le 503 garde le motif du serveur : il
 * nomme ce qui manque (clé, transcription).
 */
export function dictationFailure(error: unknown): {
  message: string
  retry: DictationRetry
} {
  if (!(error instanceof ApiError))
    return {
      message: 'Le serveur ne répond pas : la dictée n’a pas été nettoyée.',
      retry: 'resend',
    }
  switch (error.status) {
    case 502:
      return { message: 'Le nettoyage n’a pas abouti.', retry: 'resend' }
    case 503:
      return {
        message: `Dictée indisponible : ${error.message}`,
        retry: 'none',
      }
    default:
      return {
        message: `La dictée a échoué (erreur ${error.status}).`,
        retry: 'resend',
      }
  }
}

/** Ce que l'on dit quand le micro ne s'ouvre pas. */
const RECORDER_FAILURE: Record<RecorderFailure, string> = {
  denied:
    'Micro refusé : autorise-le pour ce site dans les réglages du navigateur.',
  'no-device': 'Aucun micro trouvé : branche-en un.',
  unsupported: 'Ce navigateur ne sait pas enregistrer le son en direct.',
  failed: 'Le micro n’a pas pu démarrer : est-il pris par une autre app ?',
}

/** Le message et le recours d'un micro qui ne s'ouvre pas : on peut
 *  réessayer, sauf si le navigateur ne sait pas faire. */
export function recorderFailure(failure: RecorderFailure): {
  message: string
  retry: DictationRetry
} {
  return {
    message: RECORDER_FAILURE[failure],
    retry: failure === 'unsupported' ? 'none' : 'record',
  }
}

/** Le message et le recours d'une transcription en direct interrompue. */
export function liveDictationFailure(
  code: LiveDictationError,
  detail: string | null,
): { message: string; retry: DictationRetry } {
  switch (code) {
    case 'unavailable':
      return {
        message: `Dictée indisponible : ${detail ?? 'motif inconnu.'}`,
        retry: 'none',
      }
    case 'too_long':
      return {
        message: 'Dictée trop longue : 10 minutes au plus.',
        retry: 'record',
      }
    case 'not_found':
      return {
        message: 'Ces notes n’existent plus : la dictée n’a pas été gardée.',
        retry: 'none',
      }
    case 'unreachable':
      return {
        message: 'Le serveur ne répond pas : la dictée n’a pas été transcrite.',
        retry: 'record',
      }
    default:
      return { message: 'La transcription a échoué.', retry: 'record' }
  }
}
