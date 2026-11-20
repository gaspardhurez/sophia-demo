import { ApiError } from '@/shared/api'

/**
 * Le message d'une vérification échouée (`POST /resources/{id}/review`), et
 * si l'on peut la relancer d'ici. Comme pour la dictée, on dit ce que
 * l'échec veut dire pour celui qui vérifie ; deux statuts gardent le motif
 * du serveur, écrit pour l'écran : le 422 (notes vides, passage collé trop
 * long) et le 503 (ce qui manque : la clé).
 *
 * - 422 : rien à relancer tel quel — il faut écrire, ou coller moins ;
 * - 502 : l'appel à Sophia a raté — on relance la même vérification ;
 * - 503 : indisponible — pas de relance, le bouton se grise de lui-même
 *   une fois l'état du compagnon relu ;
 * - serveur muet : on relance.
 */
export function reviewFailure(error: unknown): {
  message: string
  retry: boolean
} {
  if (!(error instanceof ApiError))
    return {
      message: 'Le serveur ne répond pas : la vérification n’est pas partie.',
      retry: true,
    }
  switch (error.status) {
    case 422:
      return { message: error.message, retry: false }
    case 502:
      return { message: 'La vérification n’a pas abouti.', retry: true }
    case 503:
      return {
        message: `Vérification indisponible : ${error.message}`,
        retry: false,
      }
    default:
      return {
        message: `La vérification a échoué (erreur ${error.status}).`,
        retry: true,
      }
  }
}

/**
 * Le message d'une réponse dans un fil qui n'a pas abouti
 * (`POST /review-comments/{id}/replies`), et si **ta** réponse est restée :
 * sur un 502, le serveur l'a enregistrée avant d'appeler Sophia — elle est
 * dans le fil, seule la réponse de Sophia manque ; sur un 503 ou sans
 * serveur, rien n'est parti — le texte revient dans le champ.
 */
export function replyFailure(error: unknown): {
  message: string
  kept: boolean
} {
  if (!(error instanceof ApiError))
    return {
      message: 'Le serveur ne répond pas : ta réponse n’est pas partie.',
      kept: false,
    }
  switch (error.status) {
    case 502:
      return {
        message: 'Sophia n’a pas pu répondre ; ta réponse est gardée.',
        kept: true,
      }
    case 503:
      return {
        message: `Sophia ne peut pas répondre : ${error.message}`,
        kept: false,
      }
    case 422:
      return { message: error.message, kept: false }
    default:
      return {
        message: `La réponse n’est pas partie (erreur ${error.status}).`,
        kept: false,
      }
  }
}
