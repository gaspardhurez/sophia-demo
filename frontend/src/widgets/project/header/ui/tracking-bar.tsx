import type { DomainColorClasses } from '@/entities/domain'
import { LEARNING_TINT } from '@/entities/project'
import { ResultThreadBar } from '@/features/project/result'
import type { TrackingChip } from '@/features/project/tracking'
import { cn } from '@/shared/lib/utils'

/**
 * La barre de 4 px en pied de l'en-tête : elle suit la chip choisie. Pour
 * l'Apprentissage, une rangée de blocs, un par savoir visé, teintés comme la
 * mosaïque de la carte ; pour un Résultat, son fil (`ResultBar`). Sans chip
 * suivie, elle reste, vide.
 */
export function TrackingBar({
  chip,
  color,
}: {
  chip: TrackingChip | undefined
  color: DomainColorClasses
}) {
  if (chip?.kind === 'learning')
    return (
      <span className="flex h-1 gap-0.5 bg-card">
        {chip.levels.map((level, i) => (
          <span
            key={i}
            className={cn(
              'flex-1',
              level === 0 && 'bg-muted',
              level > 0 && level < 4 && color.dot,
              level === 4 && color.ink,
            )}
            style={
              level > 0 && level < 4
                ? { opacity: LEARNING_TINT[level] }
                : undefined
            }
          />
        ))}
      </span>
    )
  // Le fil du Résultat (design #36) : même pièce que le panneau des relevés.
  if (chip?.kind === 'result')
    return (
      <ResultThreadBar
        pct={chip.pct}
        start={chip.start}
        record={chip.record}
        target={chip.target}
        reached={chip.reached}
        color={color}
      />
    )
  const pct = chip?.kind === 'total' ? chip.pct : 0
  return (
    <span className="flex h-1 bg-muted">
      <span
        className={cn('transition-[width] duration-250', color.dot)}
        style={{ width: `${pct}%` }}
      />
    </span>
  )
}
