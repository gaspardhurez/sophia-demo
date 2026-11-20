import { cn } from '@/shared/lib/utils'

/** « 2 passes à 5/5 sur 3 » : ce que les pastilles disent au survol. */
function criterionLabel(
  reached: number,
  passes: number,
  level: number,
): string {
  return `${reached} passe${reached > 1 ? 's' : ''} à ${level}/5 sur ${passes}`
}

/**
 * Le **critère** d'une pièce de Pratique ou de Mise en situation (#157,
 * `kit/Phases cycle`, `kit/Fiche piece`) : une pastille par passe à
 * atteindre, pleine pour chaque passe faite au niveau. Une pièce maîtrisée
 * (critère rempli ou « Exercice réussi ») les a toutes pleines — `reached`
 * arrive déjà plafonné.
 *
 * `tile` : la ligne d'une tuile de phase (7 px, pleine à l'encre du domaine).
 * `sheet` : le rail de la fiche, à l'encre (9 px, pleine en blanc).
 */
export function CriterionPips({
  passes,
  level,
  reached,
  variant,
  ink,
  times,
  className,
}: {
  passes: number
  level: number
  reached: number
  variant: 'tile' | 'sheet'
  /** `tile` : l'encre du domaine, pour les pastilles pleines. */
  ink?: string
  /** `tile` : les passes dans le cycle, ajoutées à l'infobulle (« · 3 fois »). */
  times?: number
  className?: string
}) {
  const tile = variant === 'tile'
  const tip =
    criterionLabel(reached, passes, level) +
    (times != null ? ` · ${times} fois` : '')
  return (
    <span
      title={tip}
      role="img"
      aria-label={tip}
      className={cn('flex shrink-0', tile ? 'gap-[3px]' : 'gap-1', className)}
    >
      {Array.from({ length: passes }, (_, i) => {
        const full = i < reached
        return (
          <span
            key={i}
            aria-hidden
            className={cn(
              'shrink-0 rounded-full',
              tile ? 'size-[7px]' : 'size-[9px]',
              !full && 'border-[1.5px]',
              !full && (tile ? 'border-ring' : 'border-white/45'),
              full && !tile && 'bg-white',
            )}
            style={full && tile ? { background: ink } : undefined}
          />
        )
      })}
    </span>
  )
}
