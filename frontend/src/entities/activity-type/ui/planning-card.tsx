import { cn } from '@/shared/lib/utils'

import { activeDays, DAY_LETTERS } from '../lib/link'
import type { Planning } from '../model/types'

/** Les teintes du domaine, en valeurs CSS — fournies par l'appelant : une
 *  entité ne connaît aucune palette. */
export interface LinkColors {
  soft: string
  bord: string
  ink: string
}

/**
 * Une activité type et sa planification, en carte basse (#38,
 * `kit/Activites types`) : la tuile, le titre, la planification en petites
 * capitales et les sept jours où elle pose (rien pour une Manuelle). Le lien d'un projet (`LinkCard`) et
 * l'activité type de la page domaine, avec son repli, la partagent.
 */
export function PlanningCard({
  id,
  emoji,
  title,
  label,
  planning,
  weekdays,
  colors,
  onSelect,
  open,
}: {
  /** Retrouver la carte pour y ancrer un popover (`data-card-id`). */
  id: string
  emoji: string | null
  title: string
  /** En petites capitales sous le titre. */
  label: string
  planning: Planning
  weekdays: number[]
  colors: LinkColors
  /** Rend la carte cliquable — l'édition ouvre un popover. */
  onSelect?: (rect: DOMRect) => void
  /** Le popover est ouvert sur cette carte : le bord se fonce. */
  open?: boolean
}) {
  const days = activeDays(planning, weekdays)
  const Tag = onSelect ? 'button' : 'div'
  return (
    <Tag
      data-card-id={id}
      type={onSelect ? 'button' : undefined}
      onClick={
        onSelect
          ? (e: React.MouseEvent<HTMLElement>) =>
              onSelect(e.currentTarget.getBoundingClientRect())
          : undefined
      }
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg border border-border bg-card px-2.5 py-2 text-left',
        onSelect && 'cursor-pointer transition-colors hover:bg-muted/50',
        open && 'border-foreground/40',
      )}
    >
      <span
        className="grid size-[30px] shrink-0 place-items-center rounded-md text-[15px]"
        style={{ background: colors.soft }}
      >
        {emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span title={title} className="block truncate text-[13px] font-medium">
          {title}
        </span>
        <span className="block truncate text-[10px] font-semibold tracking-[.05em] text-muted-foreground uppercase">
          {label}
        </span>
      </span>
      {planning !== 'manual' && (
        <span className="flex shrink-0 gap-[2px]" aria-hidden>
          {DAY_LETTERS.map((letter, day) => {
            const on = days.includes(day)
            return (
              <span
                key={day}
                className={cn(
                  'relative grid size-[14px] place-items-center rounded-[3px] text-[9px] leading-none font-semibold',
                  !on && 'text-muted-foreground/45',
                )}
                style={
                  on
                    ? { background: colors.soft, color: colors.ink }
                    : undefined
                }
              >
                {letter}
              </span>
            )
          })}
        </span>
      )}
    </Tag>
  )
}
