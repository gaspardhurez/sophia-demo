import type { Activity } from '@/entities/activity'
import { cn } from '@/shared/lib/utils'

import type { LinkedItem } from '../model/decoration'
import { AllDayBody, CardCheck } from './card-body'

/**
 * La pastille d'une séance sans heure, dépliée au survol en carte — comme une
 * séance planifiée : emoji, titre en entier, « Toute la journée », ce qui y
 * est lié. Elle se déplie depuis la pastille, vers la droite et vers le bas,
 * jusqu'à la largeur de la colonne ; elle ne prend pas le clic, qui reste à
 * la pastille.
 *
 * Seulement dans un mode piloté (la préparation de la semaine) : ailleurs, la
 * pastille garde son infobulle.
 */
export function PillHoverCard({
  activity,
  color,
  inkClassName,
  emoji,
  width,
  note,
  linked,
}: {
  activity: Activity
  color: string
  inkClassName?: string
  emoji: string
  width: number
  note?: string
  linked: LinkedItem[]
}) {
  return (
    <span
      aria-hidden
      style={{ width }}
      className={cn(
        // Repliée sur la pastille (24 px), elle se déplie vers la droite et
        // vers le bas jusqu'à la carte entière — un dévoilement, pas un zoom.
        'pointer-events-none absolute top-0 left-0 z-40 rounded-md bg-card opacity-0 shadow-lg transition-[clip-path,opacity] duration-200 ease-out [clip-path:inset(0_calc(100%-24px)_calc(100%-24px)_0_round_6px)]',
        'group-hover/pill:opacity-100 group-hover/pill:[clip-path:inset(0_0_0_0_round_6px)]',
      )}
    >
      <span
        className={cn(
          'flex flex-col gap-0.5 rounded-md border px-2 py-1 text-xs',
          color,
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <AllDayBody
            done={activity.done}
            emoji={emoji}
            title={activity.title}
            check={
              <CardCheck done={activity.done} inkClassName={inkClassName} />
            }
          />
        </span>
        <span className="opacity-70">
          Toute la journée{note && ` · ${note}`}
        </span>
        {linked.map((l) => (
          <span key={l.key} className="flex min-w-0 items-center gap-1">
            <span>{l.emoji}</span>
            <span className="truncate">{l.label}</span>
          </span>
        ))}
      </span>
    </span>
  )
}
