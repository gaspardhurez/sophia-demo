import { type ReactNode, useState } from 'react'

import type { Activity } from '@/entities/activity'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui'

import { dayLabel, type StripDay } from '../model/sessions'
import { PieceChip, StateMark } from './session-marks'
import { inkVar, type SessionColors } from './session-tone'

/**
 * La **liste du jour** (#160, `kit/Seances savoir`) : une case qui porte
 * plusieurs séances l'ouvre au clic, sous elle — au-dessus si elle ne tient
 * pas, bornée à la fenêtre. La date, puis par séance son état, son nom et ses
 * pièces ; une pièce ferme la liste et ouvre sa séance. Échap ferme.
 */
export function DayListPopover({
  day,
  colors,
  onOpenActivity,
  children,
}: {
  day: StripDay
  colors: SessionColors
  /** Une pièce cliquée : sa séance (la page l'ancre sur la case). */
  onOpenActivity: (activity: Activity) => void
  /** La case, qui ouvre la liste. */
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        collisionPadding={8}
        style={inkVar(colors)}
        className="flex max-h-[min(320px,var(--radix-popover-content-available-height))] w-[300px] flex-col gap-0.5 overflow-auto rounded-[10px] p-1.5"
      >
        <span className="px-1.5 py-1 text-xs font-semibold text-foreground/70">
          {dayLabel(day.date)}
        </span>
        {day.sessions.map((s) => (
          <div
            key={s.activity.id}
            className="flex flex-col gap-[5px] border-t border-border/60 p-1.5"
          >
            <span className="flex items-center gap-2">
              <StateMark state={s.state} small />
              <span className="min-w-0 text-[13px] font-semibold">
                {s.title}
              </span>
            </span>
            <span className="flex flex-wrap gap-1 pl-[22px]">
              {s.pieces.map((p) => (
                <PieceChip
                  key={p.key}
                  piece={p}
                  state={s.state}
                  colors={colors}
                  session={s.title}
                  onClick={() => {
                    setOpen(false)
                    onOpenActivity(s.activity)
                  }}
                />
              ))}
            </span>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  )
}
