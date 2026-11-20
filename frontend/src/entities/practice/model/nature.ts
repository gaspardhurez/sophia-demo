import { CHIP_TONES } from '@/shared/ui'

import type { PracticeNature } from './types'

/** Les natures dans l'ordre des phases d'acquisition. */
export const PRACTICE_NATURES: readonly PracticeNature[] = [
  'isolated',
  'situation',
]

/**
 * Libellé et ton par nature.
 *
 * Le vocabulaire est celui du produit, pas celui du modèle : on ne dit pas
 * « isolé » à quelqu'un qui range un drill, on dit « Exercice ». Et surtout,
 * `situation` s'affiche « Mise en situation » — appeler un match un exercice
 * serait faux, c'est précisément ce qui la distingue.
 *
 * `hint` dit ce que chaque nature recouvre. La nature `contextual` a été retirée
 * le 15/09/2026 : elle nommait un **degré** de variabilité, qui se lit
 * maintenant dans la place de l'objet sur la rampe — les exercices de
 * discrimination sont ceux qu'on range en haut.
 */
export const PRACTICE_NATURE_META: Record<
  PracticeNature,
  { label: string; plural: string; hint: string; chipClassName: string }
> = {
  isolated: {
    label: 'Exercice',
    plural: 'Exercices',
    hint: 'Du geste en contexte stable au savoir face à ses voisins.',
    chipClassName: CHIP_TONES.sky,
  },
  situation: {
    label: 'Mise en situation',
    plural: 'Mises en situation',
    hint: 'Dans le réel, hors dispositif — le match, la vraie recette.',
    chipClassName: CHIP_TONES.amber,
  },
}
