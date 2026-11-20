import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'

import type { DomainColorValues } from '@/entities/domain'
import { cn } from '@/shared/lib/utils'

import { dayLabel, tint } from '../model/format'

/** Une section du panneau : son titre suivi d'un filet, puis son contenu. */
export function FocusSection({
  title,
  aside,
  children,
}: {
  title: string
  /** À droite du filet (« 1/3 placés », « 3 séances · 2 sans heure »). */
  aside?: ReactNode
  children?: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className="font-heading text-base font-semibold">{title}</h3>
        <span className="h-px flex-1 bg-border" />
        {aside && (
          <span className="text-xs text-muted-foreground">{aside}</span>
        )}
      </div>
      {children}
    </section>
  )
}

/** Un intertitre en petites capitales (« TOTAUX », « NON FAITES »), avec un
 *  compteur à droite. */
export function SubTitle({
  children,
  count,
}: {
  children: ReactNode
  count?: ReactNode
}) {
  return (
    <div className="flex items-center text-[11px] font-semibold tracking-[.06em] text-muted-foreground uppercase">
      {children}
      {count != null && (
        <span className="ml-auto font-normal tracking-normal tabular-nums">
          {count}
        </span>
      )}
    </div>
  )
}

/**
 * La jauge d'un savoir, en quatre crans (Étude, Pratique, Application,
 * acquis) : ceux passés à l'encre du domaine, le cran en cours en pâle.
 * Acquis, tous les crans sont pleins.
 */
export function LevelGauge({
  level,
  colors,
  small = false,
}: {
  level: number
  colors: DomainColorValues
  /** La jauge des pièces d'un savoir (`kit/Pieces savoir`) : 12 × 4. */
  small?: boolean
}) {
  return (
    <span
      className={cn('flex shrink-0', small ? 'gap-0.5' : 'gap-[3px]')}
      aria-label={`Niveau ${level}/4`}
    >
      {[1, 2, 3, 4].map((k) => (
        <span
          key={k}
          className={cn('rounded-[2px]', small ? 'h-1 w-3' : 'h-1.5 w-[18px]')}
          style={{
            background:
              level >= 4 || k < level
                ? colors.ink
                : k === level
                  ? tint(colors.base, 35)
                  : 'var(--color-muted)',
          }}
        />
      ))}
    </span>
  )
}

/** La tuile d'une séance : son emoji sur la teinte du domaine. */
export function SessionTile({
  emoji,
  colors,
  size = 26,
  dashed = false,
  className,
  style,
  children,
}: {
  emoji: string
  colors: DomainColorValues
  size?: number
  dashed?: boolean
  className?: string
  style?: CSSProperties
  children?: ReactNode
}) {
  return (
    <span
      className={cn(
        'relative grid shrink-0 place-items-center rounded-[7px] border text-[13px] leading-none',
        className,
      )}
      style={{
        width: size,
        height: size,
        background: colors.soft,
        borderColor: colors.bord,
        borderStyle: dashed ? 'dashed' : 'solid',
        ...style,
      }}
    >
      {emoji}
      {children}
    </span>
  )
}

/** Le bouton pointillé gris d'un ajout (« + Cible », « + Cette semaine »,
 *  « + Autre savoir »). */
export function DashedButton({
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-dashed border-foreground/25 px-2.5 text-[13px] whitespace-nowrap text-foreground hover:border-foreground/45 hover:bg-muted/50',
        className,
      )}
    >
      {children}
    </button>
  )
}

/** Un geste en icône bordée (✓ Faite, ↻ Reporter) ; plein une fois choisi. */
export function IconAction({
  label,
  on = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string
  on?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'grid size-7 shrink-0 place-items-center rounded-md border disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5',
        on
          ? 'border-transparent bg-foreground text-background'
          : 'border-border bg-background text-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  )
}

/** Une séance d'une liste par jour : son jour, sa ligne, ce qui se déplie. */
export interface DayListItem {
  key: string
  day: Date
  emoji: string
  title: string
  /** À droite, en gris : l'heure (« 9:30 », « 19:00 – 20:30 ») ; vide sans
   *  heure. */
  hour: string
  /** Sous la ligne : la note, ce qui est lié. */
  details?: ReactNode
}

/**
 * Les séances de la préparation **groupées par jour** (#145, `prod/Preparation
 * de la semaine`) : une rangée par jour qui en a, un filet fin entre les
 * jours, le jour à gauche (« lun. 28 », 48 px), une ligne par séance —
 * emoji, titre (qui passe à la ligne), l'heure à droite en gris — et
 * `details` toujours dessous. Ni dépliage ni mise en avant au calendrier au
 * survol (24/10).
 * Les séances arrivent dans l'ordre voulu.
 */
export function DayList({ items }: { items: DayListItem[] }) {
  const days: { label: string; items: DayListItem[] }[] = []
  for (const it of items) {
    const label = dayLabel(it.day)
    const last = days.at(-1)
    if (last?.label === label) last.items.push(it)
    else days.push({ label, items: [it] })
  }
  return (
    <div className="flex flex-col">
      {days.map((d) => (
        <div
          key={d.label}
          className="flex gap-2 border-t border-border/60 py-1"
        >
          <span className="w-12 shrink-0 pt-[3px] text-[11.5px] font-semibold whitespace-nowrap">
            {d.label}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {d.items.map((it) => (
              <div key={it.key} className="flex flex-col text-xs">
                <div className="flex min-h-[22px] items-start gap-1.5 py-[3px]">
                  <span className="text-xs">{it.emoji}</span>
                  <span className="min-w-0 font-medium text-pretty">
                    {it.title}
                  </span>
                  <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
                    {it.hour}
                  </span>
                </div>
                {it.details && (
                  <div className="pb-0.5 pl-5 leading-[1.4] text-pretty text-muted-foreground">
                    {it.details}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
