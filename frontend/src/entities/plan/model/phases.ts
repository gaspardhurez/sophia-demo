import type { components } from '@/shared/api'

import type { AcquisitionPlan } from './types'

/**
 * La nature d'un objet de pratique, **lue sur le contrat** et non importée de
 * `entities/practice` : deux slices d'une même couche ne s'importent pas. Le
 * contrat OpenAPI est le terrain commun, c'est exactement son rôle.
 */
type PracticeNature = components['schemas']['PracticeNature']

/** La clé d'activation d'une sous-phase sur le plan. */
export type PhaseKey = 'study' | PracticeNature | 'retention'

/**
 * Les quatre phases, dans l'ordre canonique — toujours affiché en entier.
 *
 * Les libellés sont ceux de l'**interface**, pas du modèle. Depuis le
 * 15/09/2026 il n'y a plus de faux ami : la phase « Contexte » a disparu, et
 * modèle comme écran disent « pratique » de la même chose.
 *
 * `nature` dit quels objets remplissent la phase. L'étude n'en a pas — son
 * contenu, ce sont les notes — et la rétention non plus : elle ne se remplit
 * pas, elle **garde** des objets venus des autres phases.
 */
export const PHASES: readonly {
  key: PhaseKey
  label: string
  /** Ce que la phase est, en trois mots — sous son nom en mode édition. */
  short: string
  hint: string
  nature?: PracticeNature
}[] = [
  {
    key: 'study',
    label: 'Étude',
    short: 'La théorie',
    hint: 'La théorie, et les notes qui la portent.',
  },
  {
    key: 'isolated',
    label: 'Pratique',
    short: 'La rampe',
    hint: 'Du contexte stable jusqu’au plus proche du réel.',
    nature: 'isolated',
  },
  {
    key: 'situation',
    label: 'Mise en situation',
    short: 'Dans le réel',
    hint: 'Dans le réel, hors dispositif — c’est toi qui juges.',
    nature: 'situation',
  },
  {
    key: 'retention',
    label: 'Rétention',
    short: "Après l'acquis",
    hint: 'Les items reviennent ensemble, à une échéance commune.',
  },
]

/** Les natures de pratique que ce cycle mobilise. */
export function activeNatures(plan: AcquisitionPlan): PracticeNature[] {
  return PHASES.filter((p) => p.nature && plan[p.key]).map(
    (p) => p.nature as PracticeNature,
  )
}
