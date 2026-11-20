import { CHIP_TONES } from '@/shared/ui'

import type { PracticeKind } from './types'

/**
 * Comment l'objet s'exécute — la chip qui suit son titre.
 *
 * Le **bleu** dit qu'un exercice se fait dans Sophia (le **violet** reste
 * réservé à la théorie : l'interro, qui n'est plus un objet de pratique). Le
 * manuel n'a pas de couleur propre : il prend celle du domaine, comme tout ce
 * qui se fait dehors.
 *
 * Attention au faux ami : la modale appelle « Nature » ce couple manuel/intégré,
 * alors que le modèle appelle `nature` le triplet isolé/contextualisé/situation.
 */
export const PRACTICE_KIND_META: Record<
  PracticeKind,
  { label: string; chipClassName: string }
> = {
  manual: { label: 'Manuel', chipClassName: CHIP_TONES.neutral },
  integrated: { label: 'Intégré', chipClassName: CHIP_TONES.sky },
}
