import { cn } from '@/shared/lib/utils'

import { LEVELS, levelLabel } from '../model/feedback'

/** Le niveau d'un retour (#139) : « 4/5 », le libellé en infobulle — ou en
 *  clair avec `withLabel` (« 4/5 · Avec effort », la coche d'une séance,
 *  #140). `dense` : la ligne serrée de la semaine écoulée. */
export function LevelChip({
  level,
  dense = false,
  withLabel = false,
}: {
  level: number
  dense?: boolean
  withLabel?: boolean
}) {
  return (
    <span
      title={levelLabel(level)}
      className={cn(
        'inline-flex shrink-0 items-center rounded-full bg-muted font-semibold whitespace-nowrap text-foreground/80 tabular-nums',
        dense ? 'h-[18px] px-1.5 text-[11px]' : 'h-5 px-[7px] text-[11.5px]',
      )}
    >
      {level}/5
      {withLabel && (
        <>
          <span className="ml-[5px] font-normal opacity-50">·</span>
          <span className="ml-[5px] font-medium">
            {LEVELS[level - 1]?.label}
          </span>
        </>
      )}
    </span>
  )
}
