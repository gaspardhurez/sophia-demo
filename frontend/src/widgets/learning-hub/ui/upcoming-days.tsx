import { useState } from 'react'

import type { Activity } from '@/entities/activity'
import { type Domain, domainColorValues } from '@/entities/domain'
import type { OverviewItem } from '@/entities/learning'
import { toDateISO } from '@/shared/lib/date'
import { cn } from '@/shared/lib/utils'

import { type ChipSkill, nextDays, type PieceOpen } from '../model/rows'
import { OverviewRow } from './overview-row'

/**
 * « 7 prochains jours » (#155) :
 * sept onglets, demain → J+7, chacun avec un point de la couleur du savoir
 * par séance ; le jour choisi se liste dessous, **par activité** comme
 * Aujourd'hui — « activité · heure », puis ses pièces en étiquettes (#165),
 * sans geste au bout. Demain est ouvert à l'arrivée. Les onglets se
 * resserrent dans la demi-largeur.
 */
export function UpcomingDays({
  items,
  domainOf,
  onSkill,
  onActivity,
  onPiece,
  skillOf,
}: {
  items: OverviewItem[]
  domainOf: (skillId: string) => Domain | undefined
  onSkill: (skillId: string) => void
  onActivity: (activity: Activity, anchor: DOMRect) => void
  onPiece?: (piece: PieceOpen) => void
  skillOf: (skillId: string) => ChipSkill
}) {
  const days = nextDays()
  const [open, setOpen] = useState(0)
  const dayOf = (i: OverviewItem) => i.activity?.start_at?.slice(0, 10)
  const byDay = days.map((d) => {
    const iso = toDateISO(d)
    return items.filter((i) => dayOf(i) === iso)
  })
  const shown = byDay[open] ?? []

  return (
    <div className="flex flex-col gap-1.5 border-t pt-2.5">
      <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] gap-1">
        {days.map((d, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setOpen(i)}
            className={cn(
              'flex min-w-0 flex-col items-start gap-1.5 overflow-hidden rounded-lg border px-1.5 py-[7px] text-left',
              i === open
                ? 'border-foreground bg-foreground text-background'
                : 'bg-card hover:bg-muted',
            )}
          >
            <span className="text-[12.5px] font-semibold whitespace-nowrap">
              {d.toLocaleDateString('fr-FR', {
                weekday: 'short',
                day: 'numeric',
              })}
            </span>
            <span className="flex min-h-4 flex-wrap gap-[3px]">
              {byDay[i].map((s) => (
                <span
                  key={s.activity!.id}
                  className="size-2 rounded-full"
                  style={{
                    background: domainColorValues(domainOf(s.skill_id)?.color)
                      .base,
                  }}
                />
              ))}
            </span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">Aucune séance</p>
      ) : (
        <div className="flex flex-col">
          {shown.map((s) => (
            <OverviewRow
              key={s.activity!.id}
              item={s}
              domain={domainOf(s.skill_id)}
              onSkill={onSkill}
              onActivity={onActivity}
              onPiece={onPiece}
              skillOf={skillOf}
              gesture={false}
              variant="top"
            />
          ))}
        </div>
      )}
    </div>
  )
}
