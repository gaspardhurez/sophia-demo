import type { Activity } from '@/entities/activity'
import type { DomainColorClasses } from '@/entities/domain'
import { fmtTime } from '@/shared/lib/date'
import { cn } from '@/shared/lib/utils'
import { DoneMark } from '@/shared/ui'

/** La courbe de dépliage de la maquette (#59). */
const EASE = 'cubic-bezier(.2,.8,.2,1)'

/**
 * Les activités d'un jour survolé de « Cette semaine » (#59) : sous la rangée des jours,
 * une zone qui se déroule — hauteur, fondu, léger glissé — et garde le
 * contenu du dernier jour pendant qu'elle se referme. Une ligne par activité :
 * coche, emoji, titre, plage horaire ou « journée ».
 */
export function WeekDayDetail({
  open,
  title,
  activities,
  color,
  fallbackEmoji,
  dimDone,
}: {
  open: boolean
  /** « mardi · aujourd'hui » — capitalisé à l'affichage. */
  title: string
  /** Déjà triées : journée d'abord, puis par heure. */
  activities: Activity[]
  color: DomainColorClasses
  fallbackEmoji?: string | null
  /** Un jour passé : ce qui est fait s'estompe. */
  dimDone: boolean
}) {
  return (
    <div
      aria-hidden={!open}
      className="grid"
      style={{
        gridTemplateRows: open ? '1fr' : '0fr',
        opacity: open ? 1 : 0,
        marginTop: open ? 0 : -10,
        transition: `grid-template-rows 240ms ${EASE}, opacity 200ms ease, margin-top 240ms ${EASE}`,
      }}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          className="flex flex-col gap-0.5 rounded-lg bg-muted/60 px-2 py-1.5"
          style={{
            transform: open ? 'translateY(0)' : 'translateY(-4px)',
            transition: `transform 240ms ${EASE}`,
          }}
        >
          <span className="pb-0.5 text-[11px] font-semibold text-muted-foreground capitalize">
            {title}
          </span>
          {activities.map((a) => (
            <div
              key={a.id}
              className="flex min-h-6 items-center gap-1.5 text-xs"
            >
              {a.done ? (
                <DoneMark size="pill" className={color.ink} />
              ) : (
                <span
                  className={cn(
                    'size-3 shrink-0 rounded-full border border-dashed opacity-60',
                    color.text,
                    'border-current',
                  )}
                />
              )}
              <span>{a.emoji || fallbackEmoji}</span>
              <span
                className={cn(
                  'min-w-0 flex-1 truncate font-medium',
                  a.done && dimDone && 'opacity-55',
                )}
              >
                {a.title}
              </span>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {a.all_day || !a.start_at
                  ? 'journée'
                  : `${fmtTime(a.start_at)}${a.end_at ? `–${fmtTime(a.end_at)}` : ''}`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
