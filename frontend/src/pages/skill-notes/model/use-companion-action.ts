import { useCompanionStatus } from '@/entities/companion'

/** Les actions de Sophia que la page des notes offre. */
type CompanionAction = 'dictation' | 'review' | 'reply' | 'ideas'

/** Ce qu'on dit quand l'état du compagnon ne se lit pas. */
const UNREADABLE: Record<CompanionAction, string> = {
  dictation: 'Impossible de savoir si la dictée est disponible.',
  review: 'Impossible de savoir si la vérification est disponible.',
  reply: 'Impossible de savoir si Sophia peut répondre.',
  ideas: 'Impossible de savoir si les suggestions sont disponibles.',
}

/**
 * Une action de Sophia est-elle possible, et sinon pourquoi
 * (`GET /companion`) : une action indisponible reste **visible mais
 * grisée, son motif en infobulle** (décision du 29/10, #173). Tant que
 * l'état n'est pas lu, elle est grisée sans motif ; illisible, elle le dit.
 */
export function useCompanionAction(action: CompanionAction): {
  available: boolean
  reason: string | null
} {
  const { data, error } = useCompanionStatus()
  if (error) return { available: false, reason: UNREADABLE[action] }
  if (!data) return { available: false, reason: null }
  return data[action]
}

/** Le motif d'une dictée sans curseur : elle écrit là où il est. */
export const NO_CURSOR = 'Place le curseur dans les notes pour dicter.'

/**
 * La dictée est-elle possible **ici** : le compagnon la permet, et un
 * éditeur a un curseur où écrire (`hasCursor`, cf. `useDictation`). Le
 * motif du compagnon passe d'abord : il ne se règle pas d'un clic.
 */
export function useDictationAction(hasCursor: boolean): {
  available: boolean
  reason: string | null
} {
  const companion = useCompanionAction('dictation')
  if (!companion.available) return companion
  if (!hasCursor) return { available: false, reason: NO_CURSOR }
  return companion
}
