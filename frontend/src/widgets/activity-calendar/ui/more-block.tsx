import { CELL_H, DAY_START } from '../model/constants'
import { laneStyle, type MoreBox } from '../model/overlap'

/** Une activité masquée, telle que la liste du « +n » la montre. */
export interface MoreItem {
  key: string
  emoji: string
  title: string
  /** `HH:MM`. */
  start: string
  /** Absent pour un fantôme : il n'y a rien à ouvrir. */
  onOpen?: (rect: DOMRect) => void
}

/**
 * Au-delà de quatre colonnes (#55) : la quatrième devient une case « +n » sur
 * le créneau des masquées. Son survol ouvre leur liste en pleine largeur ; un
 * clic sur une ligne ouvre le panneau de l'activité.
 */
export function MoreBlock({
  box,
  items,
  inset,
  open,
  onEnter,
  onLeave,
}: {
  box: MoreBox
  items: MoreItem[]
  inset: number
  open: boolean
  onEnter: () => void
  onLeave: () => void
}) {
  const top = (box.start - DAY_START) * CELL_H + 1
  return (
    <>
      <div
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        className="absolute z-[12] flex cursor-pointer justify-center rounded-md border bg-card pt-[3px] text-[11px] font-semibold text-foreground/80 tabular-nums"
        style={{
          top,
          height: (box.end - box.start) * CELL_H - 2,
          ...laneStyle({ col: 3, cols: 4, span: 1 }, inset),
        }}
      >
        +{items.length}
      </div>
      {open && (
        <div
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
          className="absolute z-30 flex flex-col gap-0.5 rounded-md border bg-card p-1 shadow-lg"
          style={{ top, left: inset, right: inset }}
        >
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              disabled={!it.onOpen}
              onClick={(e) => {
                e.stopPropagation()
                it.onOpen?.(e.currentTarget.getBoundingClientRect())
              }}
              className="flex min-w-0 items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] leading-4 not-disabled:cursor-pointer not-disabled:hover:bg-muted disabled:opacity-45"
            >
              <span className="shrink-0">{it.emoji}</span>
              <span className="min-w-0 flex-1 truncate font-medium">
                {it.title}
              </span>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {it.start}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}
