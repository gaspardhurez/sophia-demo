import type { components } from '@/shared/api'

import type { AcquisitionPlan } from './types'

/**
 * L'objet de la bibliothèque lu **sur le contrat** : `entities/practice` est
 * une slice voisine, on ne l'importe pas.
 */
type LibraryItem = components['schemas']['PracticeItemRead']

/**
 * Un objet **dans la rampe d'un cycle** : l'objet de la bibliothèque, plus ce
 * que le cycle en dit — sa place, son verdict, sa rétention, ses passes dans
 * ce cycle. Un même exercice repris par deux cycles y a deux verdicts.
 */
export type RampItem = Omit<LibraryItem, 'sessions'> & {
  rank: number
  /** Le verdict à la main (« Exercice réussi »). */
  done: boolean
  /** Maîtrisé (#157) : verdict à la main, ou critère rempli. C'est lui qui
   *  valide l'objet dans sa phase. */
  mastered: boolean
  in_retention: boolean
  /** Passes faites **dans ce cycle**. */
  sessions: number
  /** Le critère de maîtrise : `criterion_passes` passes à `criterion_level`
   *  sur 5 au moins (défaut 3 × 5/5), au total dans le cycle. */
  criterion_passes: number
  criterion_level: number
  /** Les passes du cycle au niveau du critère ou au-dessus. */
  passes_at_level: number
}

/**
 * La rampe d'un cycle, jointe à la bibliothèque : par nature (exercices, puis
 * applications), puis par rang. Un objet absent de la bibliothèque chargée
 * (requête en retard) est sauté plutôt qu'affiché vide.
 */
export function rampOf(
  plan: AcquisitionPlan | undefined,
  library: LibraryItem[],
): RampItem[] {
  if (!plan) return []
  const byId = new Map(library.map((i) => [i.id, i]))
  const order = { isolated: 0, situation: 1 } as const
  return plan.items
    .flatMap((link) => {
      const item = byId.get(link.item_id)
      if (!item) return []
      return [
        {
          ...item,
          rank: link.rank,
          done: link.done,
          mastered: link.mastered,
          in_retention: link.in_retention,
          sessions: link.sessions,
          criterion_passes: link.criterion_passes,
          criterion_level: link.criterion_level,
          passes_at_level: link.passes_at_level,
        },
      ]
    })
    .sort(
      (a, b) =>
        order[a.nature] - order[b.nature] ||
        a.rank - b.rank ||
        a.created_at.localeCompare(b.created_at),
    )
}
