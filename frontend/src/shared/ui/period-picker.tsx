import {
  ArrowRight,
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/shared/lib/utils'

import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'

/** Une plage déjà prise : hachurée. `blocked` : elle ne se choisit pas. */
export interface TakenRange {
  start: string
  end: string
  label: string
  blocked?: boolean
}

/** Ce qu'un choix ferait ailleurs : « Étape 2 · 1er oct. – 5 nov. → Sans dates ». */
export interface PeriodEffect {
  title: string
  before: string
  after: string
}

const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]
const SHORT = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
]
const WEEKDAYS = ['lu', 'ma', 'me', 'je', 've', 'sa', 'di']

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/** « 1er oct. », « 21 sept. » — une date de plage. */
export function shortDay(x: string): string {
  const [, m, d] = x.split('-').map(Number)
  return `${d === 1 ? '1er' : d} ${SHORT[m - 1]}`
}

const HATCH =
  'repeating-linear-gradient(135deg, var(--color-muted) 0 3px, var(--color-background) 3px 6px)'

/**
 * Un champ, deux mois, une traînée (kit § PeriodPicker, design #27).
 *
 * En plage, le premier clic pose le début, le second complète et ferme — pas
 * de bouton « Valider ». En date seule, un clic suffit. Les plages déjà prises
 * sont hachurées ; bloquées, elles ne se choisissent pas et se nomment au
 * survol. Les jours hors de la période de référence sont atténués mais
 * choisissables. Aujourd'hui n'est pas marqué.
 *
 * `effects` dit, pour la plage survolée, ce que le choix ferait ailleurs —
 * l'appelant sait ce que « ailleurs » veut dire ; le sélecteur l'affiche.
 *
 * `allowNoEnd` (la période d'un projet, #196) : une fois le début posé, « Pas
 * de fin » ferme avec `onChange(début, null)`. Sans fin, le champ lit
 * « Depuis le 28 sept. » et les jours après le début sont teintés ; un clic
 * repart d'un nouveau début, choisir une fin l'annule.
 */
export function PeriodPicker({
  mode = 'range',
  start,
  end = null,
  onChange,
  placeholder = 'Période',
  taken = [],
  period,
  suggestStart,
  suggestEnd,
  effects,
  invalid,
  variant = 'field',
  align = 'start',
  allowNoEnd = false,
  className,
  'aria-label': ariaLabel,
}: {
  mode?: 'range' | 'single'
  start: string | null
  end?: string | null
  onChange: (start: string | null, end: string | null) => void
  placeholder?: string
  taken?: TakenRange[]
  /** Période de référence : les jours hors d'elle sont atténués. */
  period?: { start: string | null; end: string | null }
  suggestStart?: string | null
  suggestEnd?: string | null
  effects?: (start: string, end: string) => PeriodEffect[]
  invalid?: boolean
  /** `field` : le champ de formulaire (280px) ; `compact` : le bouton des
   *  cartes du plan (34px, à la largeur de sa date). */
  variant?: 'field' | 'compact'
  align?: 'start' | 'end'
  /** Propose « Pas de fin » ; une plage sans fin se lit alors comme telle. */
  allowNoEnd?: boolean
  className?: string
  'aria-label'?: string
}) {
  const single = mode === 'single'
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<{
    start: string | null
    end: string | null
  }>({ start, end })
  const [hover, setHover] = useState<string | null>(null)
  const anchor = (
    start ??
    suggestStart ??
    iso(new Date().getFullYear(), new Date().getMonth(), 1)
  )
    .split('-')
    .map(Number)
  const [view, setView] = useState({ y: anchor[0], m: anchor[1] - 1 })

  // Sans fin : une plage posée dont la fin est nulle, tant qu'un clic ne
  // repart pas d'un nouveau début.
  const [draftNoEnd, setDraftNoEnd] = useState(false)
  const noEnd =
    !single &&
    allowNoEnd &&
    (open ? draftNoEnd : start !== null && end === null)
  const a = open ? draft.start : start
  const b = single ? null : open ? draft.end : end
  const picking = !single && !noEnd && a !== null && b === null
  const suggestion = single
    ? null
    : !a || b || noEnd
      ? suggestStart
      : suggestEnd

  function openWith(o: boolean) {
    setOpen(o)
    setHover(null)
    if (o) {
      setDraft({ start, end })
      setDraftNoEnd(allowNoEnd && start !== null && end === null)
      setView({ y: anchor[0], m: anchor[1] - 1 })
    }
  }

  function pick(x: string) {
    if (single) {
      onChange(x, null)
      openWith(false)
      return
    }
    if (!draft.start || draft.end || draftNoEnd) {
      setDraft({ start: x, end: null })
      setDraftNoEnd(false)
      return
    }
    const [s, e] = x < draft.start ? [x, draft.start] : [draft.start, x]
    onChange(s, e)
    openWith(false)
  }

  const candidate: [string, string] | null = hover
    ? single
      ? [hover, hover]
      : picking
        ? hover < a!
          ? [hover, a!]
          : [a!, hover]
        : [hover, end && end > hover ? end : hover]
    : null
  const shownEffects =
    effects && candidate && !(single && hover === start)
      ? effects(candidate[0], candidate[1])
      : []

  // Pendant le choix, le champ suit la plage en cours : « 20 sept. → — ».
  const label = single
    ? a
      ? shortDay(a)
      : placeholder
    : a && noEnd
      ? `Depuis le ${shortDay(a)}`
      : a && b
        ? `${shortDay(a)} → ${shortDay(b)}`
        : a
          ? `${shortDay(a)} → —`
          : placeholder

  const panes = [0, 1].map((k) => {
    const first = new Date(view.y, view.m + k, 1)
    const y = first.getFullYear()
    const m = first.getMonth()
    const lead = (first.getDay() + 6) % 7
    const rows = new Date(y, m, 1 - lead + 35).getMonth() === m ? 6 : 5
    const days = Array.from({ length: rows * 7 }, (_, i) => {
      const dt = new Date(y, m, 1 - lead + i)
      const x = iso(dt.getFullYear(), dt.getMonth(), dt.getDate())
      return { x, n: dt.getDate(), out: dt.getMonth() !== m, col: i % 7 }
    })
    return { key: k, label: `${MONTHS[m]} ${y}`, days }
  })

  return (
    <Popover open={open} onOpenChange={openWith}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          aria-invalid={invalid}
          className={cn(
            'flex items-center rounded-md border bg-card text-left outline-none transition-shadow',
            variant === 'field'
              ? 'h-9 w-[280px] gap-2 px-2.5 text-sm'
              : 'h-[34px] gap-1.5 px-2.5 text-xs font-semibold text-foreground/75 hover:bg-muted',
            open
              ? 'border-ring ring-3 ring-ring/25'
              : cn(
                  'border-input',
                  // Le bouton des cartes ne change que de fond au survol.
                  variant === 'field' && 'hover:border-ring/60',
                ),
            invalid && 'border-destructive',
            className,
          )}
        >
          {variant === 'field' ? (
            <CalendarDays className="size-[15px] shrink-0 text-muted-foreground" />
          ) : (
            <Calendar className="size-[13px] shrink-0" />
          )}
          <span
            className={cn(
              'min-w-0 truncate tabular-nums',
              !a && 'text-muted-foreground',
            )}
          >
            {label}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="flex w-auto flex-col gap-3 rounded-[10px] p-3.5 shadow-[0_8px_24px_-8px_color-mix(in_oklab,var(--color-foreground)_20%,transparent)]"
        onMouseLeave={() => setHover(null)}
      >
        <div className="flex items-start gap-5">
          {panes.map((pane) => (
            <div key={pane.key} className="flex flex-col gap-1.5">
              <div className="flex h-[26px] items-center gap-1">
                {pane.key === 0 && (
                  <button
                    type="button"
                    aria-label="Mois précédents"
                    onClick={() =>
                      setView((v) => ({
                        y: v.m === 0 ? v.y - 1 : v.y,
                        m: (v.m + 11) % 12,
                      }))
                    }
                    className="grid size-[26px] shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted"
                  >
                    <ChevronLeft className="size-3.5" />
                  </button>
                )}
                <span className="min-w-0 flex-1 text-center font-heading text-[13px] font-semibold capitalize">
                  {pane.label}
                </span>
                {pane.key === 1 && (
                  <button
                    type="button"
                    aria-label="Mois suivants"
                    onClick={() =>
                      setView((v) => ({
                        y: v.m === 11 ? v.y + 1 : v.y,
                        m: (v.m + 1) % 12,
                      }))
                    }
                    className="grid size-[26px] shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted"
                  >
                    <ChevronRight className="size-3.5" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-[repeat(7,34px)]">
                {WEEKDAYS.map((w) => (
                  <span
                    key={w}
                    className="pb-1 text-center text-[11px] text-muted-foreground"
                  >
                    {w}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-[repeat(7,34px)] gap-y-0.5 tabular-nums">
                {pane.days.map((d) => {
                  const hit = d.out
                    ? undefined
                    : taken.find((r) => d.x >= r.start && d.x <= r.end)
                  if (hit?.blocked)
                    return (
                      <Tooltip key={d.x}>
                        <TooltipTrigger asChild>
                          <span
                            className="grid h-[34px] cursor-not-allowed place-items-center text-[13px] text-muted-foreground/60"
                            style={{ background: HATCH }}
                          >
                            {d.n}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{hit.label}</TooltipContent>
                      </Tooltip>
                    )
                  const edge = d.x === a || d.x === b
                  const inside = a && b && d.x > a && d.x < b
                  const inRange = Boolean(a && b && (inside || edge))
                  const outPeriod =
                    !d.out &&
                    period &&
                    ((period.start && d.x < period.start) ||
                      (period.end && d.x > period.end))
                  // Sans fin : les jours après le début, légèrement teintés.
                  const after = noEnd && a !== null && d.x > a && !d.out
                  const roundL =
                    !after && (!inRange || d.x === a || d.col === 0)
                  const roundR =
                    !after && (!inRange || d.x === b || d.col === 6)
                  return (
                    <button
                      key={d.x}
                      type="button"
                      title={hit && !inRange ? hit.label : undefined}
                      onClick={() => pick(d.x)}
                      onMouseEnter={() => setHover(d.x)}
                      onMouseLeave={() => setHover(null)}
                      className={cn(
                        'relative grid h-[34px] place-items-center text-[13px] hover:shadow-[inset_0_0_0_1px_var(--color-ring)]',
                        roundL && 'rounded-l-lg',
                        roundR && 'rounded-r-lg',
                        edge
                          ? 'bg-primary font-semibold text-primary-foreground'
                          : inside
                            ? 'bg-muted'
                            : after
                              ? 'bg-gradient-to-r from-muted/70 to-muted/30'
                              : outPeriod
                                ? 'text-muted-foreground/50'
                                : d.out
                                  ? 'text-muted-foreground/40'
                                  : hit
                                    ? 'rounded-none text-foreground/80'
                                    : '',
                        suggestion === d.x && !edge && 'font-semibold',
                      )}
                      style={
                        hit && !inRange && !edge
                          ? { background: HATCH }
                          : undefined
                      }
                    >
                      {d.n}
                      {suggestion === d.x && !edge && (
                        <span className="absolute bottom-[5px] left-1/2 h-0.5 w-3.5 -translate-x-1/2 bg-foreground" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {(suggestion || (allowNoEnd && !single && a)) && (
          <div className="flex flex-wrap items-center gap-2">
            {suggestion && (
              <button
                type="button"
                onClick={() => pick(suggestion)}
                className="inline-flex h-7 items-center gap-2 rounded-md border bg-background px-2.5 text-xs text-muted-foreground hover:bg-muted"
              >
                {!a || b || noEnd ? 'Début suggéré' : 'Fin suggérée'}
                <strong className="font-semibold text-foreground tabular-nums">
                  {shortDay(suggestion)}
                </strong>
              </button>
            )}
            {allowNoEnd && !single && a && (
              <button
                type="button"
                aria-pressed={noEnd}
                onClick={() => {
                  onChange(a, null)
                  openWith(false)
                }}
                className={cn(
                  'ml-auto inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold',
                  noEnd
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-background hover:bg-muted',
                )}
              >
                <ArrowRight aria-hidden className="size-[13px]" />
                Pas de fin
              </button>
            )}
          </div>
        )}

        {shownEffects.length > 0 && (
          <div className="flex w-0 min-w-full flex-col rounded-lg bg-muted px-2.5 py-1">
            {shownEffects.map((e) => (
              <div
                key={e.title}
                className="flex h-[26px] min-w-0 items-center gap-2 text-xs tabular-nums"
              >
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {e.title}
                </span>
                <span className="shrink-0 text-muted-foreground line-through">
                  {e.before}
                </span>
                <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
                <span className="shrink-0 font-semibold">{e.after}</span>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
