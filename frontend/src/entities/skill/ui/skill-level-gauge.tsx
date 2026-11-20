import { cn } from '@/shared/lib/utils'

const PHASES = ['Étude', 'Pratique', 'Mise en situation', 'Rétention'] as const

/**
 * La jauge à quatre crans d'un savoir — un cran par phase du cycle.
 *
 * `level` est celui de l'API (`SkillRead.level`, `learning` d'un projet) :
 * 0 rien, 1 à 3 la sous-phase en cours, 4 acquis. Les crans passés prennent
 * l'encre du domaine, le cran en cours son fond doux cerné, les suivants le
 * gris. Rien à 0 : un savoir vierge n'a pas de jauge.
 *
 * Les teintes arrivent en valeurs CSS (`domainColorValues`) : une entité ne
 * connaît pas le domaine.
 */
export function SkillLevelGauge({
  level,
  colors,
  className,
}: {
  level: number
  colors: { ink: string; soft: string; bord: string }
  className?: string
}) {
  if (level <= 0) return null
  const current = Math.min(level, 4) - 1
  const title = level >= 4 ? 'Acquis' : `${PHASES[current]} en cours`
  return (
    <span
      title={title}
      aria-label={title}
      className={cn('flex w-10 shrink-0 gap-0.5', className)}
    >
      {PHASES.map((p, k) => (
        <span
          key={p}
          className="h-[5px] flex-1 rounded-[2px]"
          style={
            k < current
              ? { background: colors.ink }
              : k === current
                ? {
                    background: colors.soft,
                    boxShadow: `inset 0 0 0 1px ${colors.bord}`,
                  }
                : { background: 'var(--color-border)' }
          }
        />
      ))}
    </span>
  )
}
