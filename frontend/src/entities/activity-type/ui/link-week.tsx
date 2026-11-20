import { useMemo } from 'react'

import { DAY_LETTERS } from '../lib/link'
import { weekSlots } from '../lib/week'
import type { ActivityTypeLink } from '../model/types'
import { LinkCard } from './link-card'
import type { LinkColors } from './planning-card'

/**
 * La semaine type d'un projet, en lecture (#85, `kit/Activites types`, vue
 * Semaine) : sept colonnes L → D, une carte par créneau (emoji, heure), rien
 * un jour sans créneau ; dessous, une
 * carte basse par lien, Manuelles comprises. Sans aucun créneau (que des
 * Manuelles), les colonnes et leurs lettres ne s'affichent pas.
 *
 * Sans fond ni marge : l'appelant la pose dans son cadre.
 */
export function LinkWeek({
  links,
  colors,
}: {
  links: ActivityTypeLink[]
  colors: LinkColors
}) {
  const days = useMemo(() => weekSlots(links), [links])
  const anySlot = days.some((slots) => slots.length > 0)
  return (
    <div className="flex flex-col gap-2.5">
      {anySlot && (
        <div className="grid grid-cols-7 gap-1">
          {days.map((slots, day) => (
            <div key={day} className="flex min-w-0 flex-col gap-1">
              <span className="h-4 text-center text-[10px] leading-4 font-semibold text-muted-foreground">
                {DAY_LETTERS[day]}
              </span>
              {slots.map((slot) => (
                <div
                  key={slot.link.activity_type_id}
                  title={slot.tip}
                  className="relative flex h-10 flex-col items-center justify-center gap-[3px] rounded-md"
                  style={{
                    background: colors.soft,
                    boxShadow: `inset 0 0 0 1px ${colors.bord}`,
                    color: colors.ink,
                  }}
                >
                  <span className="text-sm leading-none">
                    {slot.link.emoji}
                  </span>
                  {slot.hour && (
                    <span className="text-[9.5px] leading-none font-semibold tabular-nums">
                      {slot.hour}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-1.5">
        {links.map((link) => (
          <LinkCard key={link.activity_type_id} link={link} colors={colors} />
        ))}
      </div>
    </div>
  )
}
