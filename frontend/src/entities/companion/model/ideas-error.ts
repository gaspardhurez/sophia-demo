import { ApiError } from '@/shared/api'

/** Une demande d'idées centrales échouée : ce qu'on en dit, et si la
 *  redemander a un sens (`retry` faux quand Sophia est indisponible — la
 *  clé manque : l'interrupteur se grise de lui-même). */
export interface IdeasFailure {
  message: string
  retry: boolean
}

/**
 * Le message d'une demande d'idées centrales échouée, d'après le statut de
 * la réponse (cf. `POST /skills/{id}/central-ideas`). Comme pour la dictée,
 * on dit ce que l'échec veut dire pour qui prépare ses questions ; seul le
 * 503 garde le motif du serveur, qui nomme ce qui manque.
 */
export function ideasFailure(error: unknown): IdeasFailure {
  if (!(error instanceof ApiError))
    return {
      message: 'Le serveur ne répond pas : pas de suggestions.',
      retry: true,
    }
  switch (error.status) {
    case 422:
      return {
        message: 'Cette section n’a pas de texte à trier.',
        retry: false,
      }
    case 502:
      return { message: 'Les suggestions n’ont pas abouti.', retry: true }
    case 503:
      return {
        message: `Suggestions indisponibles : ${error.message}`,
        retry: false,
      }
    default:
      return {
        message: `Les suggestions ont échoué (erreur ${error.status}).`,
        retry: true,
      }
  }
}
