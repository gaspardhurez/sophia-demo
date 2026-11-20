import type { PracticeItem } from '@/entities/practice'

/**
 * Les trois sortes d'objet que le menu propose, avec le nom qu'il leur donne :
 * un exercice manuel, un exercice intégré, une application.
 */
export type PickNature = 'exo' | 'int' | 'app'

export const PICK_LABEL: Record<PickNature, string> = {
  exo: 'Exo manuel',
  int: 'Intégré',
  app: 'Mise en situation',
}

/** La sorte d'un objet de la bibliothèque. */
export function pickNatureOf(item: PracticeItem): PickNature {
  if (item.nature === 'situation') return 'app'
  return item.kind === 'integrated' ? 'int' : 'exo'
}
