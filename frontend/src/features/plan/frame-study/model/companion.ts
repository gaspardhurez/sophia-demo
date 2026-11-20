import { useCompanionStatus } from '@/entities/companion'

/**
 * Ce que Sophia apporte au cadrage (#175) : les questions d'intention, le
 * périmètre proposé, la recherche de ressources — les actions `intention`,
 * `scope` et `resources` de `GET /companion` —, et la dictée dans le champ
 * du chat (`dictation`).
 */
export type FramingAction = 'intention' | 'scope' | 'resources' | 'dictation'

/** Ce qu'on dit quand l'état du compagnon ne se lit pas. */
const UNREADABLE = 'Impossible de savoir si Sophia est disponible.'

/**
 * Une aide de Sophia au cadrage est-elle possible, et sinon pourquoi
 * (`{ available, reason }`, comme `useCompanionAction` de la page des
 * notes). Indisponible, le temps se fait **à la main** (le parcours de la
 * phase 1), sa proposition grisée avec le motif. Tant que l'état n'est pas
 * lu : indisponible, sans motif.
 */
export function useFramingCompanion(action: FramingAction): {
  available: boolean
  reason: string | null
} {
  const { data, error } = useCompanionStatus()
  if (error) return { available: false, reason: UNREADABLE }
  if (!data) return { available: false, reason: null }
  return data[action]
}
