import { CHIP_TONES } from '@/shared/ui'

import type { SkillStatus } from './types'

/** Les statuts dans l'ordre de progression — source unique pour badge et menu. */
export const SKILL_STATUSES: readonly SkillStatus[] = [
  'not_started',
  'in_progress',
  'acquired',
]

/**
 * Libellé et styles par statut — la pastille pleine en plus du badge.
 *
 * `dotClassName` sert là où le badge ne tient pas : sur un nœud d'arbre, le
 * libellé prenait une seconde ligne et doublait la hauteur de la carte. La
 * couleur porte la même information, se lit d'un coup d'œil sur soixante nœuds
 * là où soixante étiquettes se lisent une à une, et le mot reste au survol.
 */
export const SKILL_STATUS_META: Record<
  SkillStatus,
  { label: string; badgeClassName: string; dotClassName: string }
> = {
  not_started: {
    label: 'Non acquis',
    badgeClassName: CHIP_TONES.neutral,
    // Creuse et non pleine : « rien fait » ne doit pas peser autant qu'un état
    // atteint — sur un arbre neuf, soixante pastilles pleines feraient un mur.
    dotClassName: 'border border-muted-foreground/40',
  },
  in_progress: {
    label: 'En cours',
    badgeClassName: CHIP_TONES.amber,
    dotClassName: 'bg-amber-500',
  },
  acquired: {
    label: 'Acquis',
    badgeClassName: CHIP_TONES.emerald,
    dotClassName: 'bg-emerald-500',
  },
}
