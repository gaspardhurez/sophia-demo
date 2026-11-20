import { cn } from '@/shared/lib/utils'

import type { CycleStage } from '../model/cycle'

/**
 * La marque d'état d'un cycle (design #65 et #66, `kit/Onglets cycles`) : ✓
 * plein acquis, anneau en cours, pointillé prévu, gris abandonné — à la
 * couleur du domaine.
 */
export function CycleMark({
  stage,
  color,
  size = 'md',
}: {
  stage: CycleStage
  /** La couleur du domaine (CSS). */
  color: string
  size?: 'sm' | 'md'
}) {
  const open = stage === 'active' || stage === 'toClose'
  return (
    <span
      aria-hidden
      className={cn(
        'box-border grid shrink-0 place-items-center rounded-full font-bold text-white',
        size === 'md' ? 'size-3 text-[8px]' : 'size-[11px] text-[7px]',
        stage === 'planned' &&
          'border-[1.5px] border-dashed border-muted-foreground/70',
        stage === 'abandoned' && 'bg-muted-foreground/45',
        open && 'border-2 bg-card',
      )}
      style={
        stage === 'acquired'
          ? { background: color }
          : open
            ? { borderColor: color }
            : undefined
      }
    >
      {stage === 'acquired' && '✓'}
    </span>
  )
}
