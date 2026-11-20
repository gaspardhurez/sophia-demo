import type { DomainColorClasses } from '@/entities/domain'

/**
 * Le rendu **neutre** d'une séance dont le domaine n'est pas dans la liste :
 * l'activité du rituel de semaine (#92), qui vit dans le domaine système —
 * absent de `useDomains`, sans couleur. Un gris plutôt que la teinte par
 * défaut d'un domaine : elle se lirait comme une séance d'un domaine « Ciel ».
 */
export const NEUTRAL_CLASSES: Pick<
  DomainColorClasses,
  'soft' | 'solid' | 'dot' | 'ink'
> = {
  soft: 'border-zinc-400/40 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
  solid: 'border-zinc-600 bg-zinc-600 text-white',
  dot: 'bg-zinc-500',
  ink: 'bg-zinc-700',
}

/** La même base en valeur CSS (le point du défilement). */
export const NEUTRAL_BASE = 'var(--color-zinc-500)'
