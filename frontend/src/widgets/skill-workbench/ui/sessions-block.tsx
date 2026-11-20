import {
  type ComponentProps,
  type CSSProperties,
  forwardRef,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

import type { Activity } from '@/entities/activity'
import type { AcquisitionPlan } from '@/entities/plan'
import { toDateISO } from '@/shared/lib/date'
import { cn } from '@/shared/lib/utils'

import {
  dayLabel,
  dayPieceCount,
  type GridCell,
  gridWeeks,
  journal,
  type JournalEntry,
  stripDays,
  weekLabel,
} from '../model/sessions'
import { DayListPopover } from './day-list-popover'
import { PieceChip, StateMark } from './session-marks'
import { inkVar, type SessionColors, tone } from './session-tone'

/** La hauteur visée d'une ligne du journal : le journal en tient un nombre
 *  entier dans la hauteur de la grille (le kit). */
const ROW_TARGET = 37
/** Le défilement (en px de molette) qui fait glisser le journal d'une ligne. */
const WHEEL_STEP = 40
/** La grille avant sa première mesure : en-tête et six semaines (le kit). */
const GRID_FALLBACK = 206
/** La place gardée pour « +n », et l'écart entre deux étiquettes. */
const PLUS_WIDTH = 34
const CHIP_GAP = 4

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

type OpenActivity = (activity: Activity, anchor: DOMRect) => void

/** L'id de la séance « virtuelle » d'une interro due que rien ne porte. */
const RECALL_STANDIN = 'recall-standin'

/**
 * L'interro due que **aucune séance** ne porte (sa séance supprimée, ou
 * déplacée) : sans elle, une interro en retard n'a plus aucun visuel dans les
 * Séances. Elle paraît à son jour dû comme une séance — en retard (rouge) si
 * le jour est passé, à venir (pointillé) sinon —, et ouvre la fiche de
 * l'interro. Nulle si une séance non faite porte déjà l'interro du cycle, si
 * la courbe ne court pas, ou si le cycle n'est pas en cours.
 */
function recallStandIn(
  activities: Activity[],
  plan: AcquisitionPlan,
): Activity | null {
  const due = plan.recall_next_due_at
  if (!due || plan.state !== 'active' || plan.recall_finished) return null
  const carried = activities.some(
    (a) =>
      !a.done &&
      a.acts.some(
        (x) => x.kind === 'recall' && x.plan_id === plan.id && !x.passed_on,
      ),
  )
  if (carried) return null
  const at = `${due}T00:00:00`
  return {
    id: RECALL_STANDIN,
    title: 'Interro',
    emoji: '🧠',
    all_day: true,
    start_at: at,
    end_at: at,
    done: false,
    acts: [
      {
        id: `${RECALL_STANDIN}-act`,
        skill_id: plan.skill_id,
        kind: 'recall',
        plan_id: plan.id,
        practice_item_id: null,
        skill_name: '',
        item_title: null,
        item_emoji: null,
        nature: null,
        passed_on: null,
        level: null,
        feedback: null,
      },
    ],
  } as unknown as Activity
}

/**
 * Les **séances** d'un cycle (#160, `kit/Seances savoir`, dans `prod/Savoir`
 * sous les phases) : à gauche la grille des six dernières semaines — une case
 * par jour, l'emoji de sa première pièce, une pastille quand le jour en porte
 * plusieurs, aujourd'hui cerclé de rouge ; à droite le journal, de la plus
 * récente à la plus ancienne, à la hauteur de la grille. Une ligne : la date,
 * les pièces en étiquettes entières — autant qu'il en tient, puis « +n », qui
 * déplie la ligne (⌃ la replie) —, la marque d'état. Au survol du bloc, ⌃ ⌄
 * à droite du titre font glisser le journal d'une page ; survoler une ligne
 * fait ressortir sa case, et l'inverse — une case hors vue amène sa ligne.
 *
 * Une pièce ouvre sa séance ; une case aussi, ou, si le jour en porte
 * plusieurs, la liste du jour (`DayListPopover`). Ne charge rien : la page
 * lui passe les séances du savoir, le bloc ne garde que les actes de ce cycle
 * ou d'aucun.
 */
export function SessionsBlock({
  activities,
  plan,
  colors,
  domainEmoji,
  onOpenActivity: openActivity,
  onOpenRecall,
}: {
  /** Les séances du savoir ; les non datées sont ignorées. */
  activities: Activity[]
  /** Le cycle affiché. */
  plan: AcquisitionPlan
  /** Les teintes du domaine (`domainColorValues`). */
  colors: SessionColors
  /** L'emoji d'une pièce ou d'une séance qui n'en a pas. */
  domainEmoji: string
  /** La séance à ouvrir, et l'élément cliqué (pour y ancrer le panneau). */
  onOpenActivity: OpenActivity
  /** L'interro due que rien ne porte : ouvrir sa fiche. */
  onOpenRecall?: () => void
}) {
  const onOpenActivity: OpenActivity = (a, anchor) =>
    a.id === RECALL_STANDIN ? onOpenRecall?.() : openActivity(a, anchor)
  const todayKey = toDateISO(new Date())
  const { weeks, entries } = useMemo(() => {
    const today = new Date(`${todayKey}T00:00:00`)
    const standIn = recallStandIn(activities, plan)
    const days = stripDays({
      activities: standIn ? [...activities, standIn] : activities,
      skillId: plan.skill_id,
      planId: plan.id,
      today,
      domainEmoji,
    })
    return { weeks: gridWeeks(days, today), entries: journal(days) }
  }, [activities, plan, domainEmoji, todayKey])

  /** Le jour survolé (une case ou une ligne) : clé `YYYY-MM-DD`. */
  const [hovered, setHovered] = useState<string | null>(null)
  /** La première ligne visible du journal. */
  const [offset, setOffset] = useState(0)
  /** La ligne dépliée (une à la fois), et sa hauteur mesurée. */
  const [openId, setOpenId] = useState<string | null>(null)
  const [openHeight, setOpenHeight] = useState(0)

  // Le journal a la hauteur de la grille : on la mesure.
  const gridRef = useRef<HTMLDivElement>(null)
  const [gridHeight, setGridHeight] = useState(0)
  useLayoutEffect(() => {
    const el = gridRef.current
    if (!el) return
    const measure = () => setGridHeight(el.offsetHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const height = gridHeight || GRID_FALLBACK
  const visible = Math.max(1, Math.round(height / ROW_TARGET))
  const row = height / visible
  const maxOffset = Math.max(0, entries.length - visible)
  const shown = Math.min(offset, maxOffset)
  const extra = openId != null ? Math.max(0, openHeight - row) : 0

  /** Amène la ligne `i` dans la fenêtre du journal, au plus court. */
  function bringIntoView(i: number) {
    if (i < shown) setOffset(i)
    else if (i >= shown + visible)
      setOffset(Math.min(maxOffset, i - visible + 1))
  }

  function hoverDay(key: string) {
    setHovered(key)
    const i = entries.findIndex((e) => e.day.key === key)
    if (i >= 0) bringIntoView(i)
  }

  function page(direction: 1 | -1) {
    setOffset(Math.max(0, Math.min(maxOffset, shown + direction * visible)))
    setOpenId(null)
  }

  // La molette (ou le trackpad) sur le journal le fait glisser d'une ligne par
  // cran ; en butée, elle rend la main à la page. Écouteur natif non passif :
  // celui de React l'est, et ne peut pas retenir le défilement de la page.
  const journalRef = useRef<HTMLDivElement>(null)
  const wheel = useRef({ acc: 0, shown, maxOffset })
  wheel.current.shown = shown
  wheel.current.maxOffset = maxOffset
  useEffect(() => {
    const el = journalRef.current
    if (!el) return
    function onWheel(e: WheelEvent) {
      const w = wheel.current
      const down = e.deltaY > 0
      if (down ? w.shown >= w.maxOffset : w.shown <= 0) {
        w.acc = 0
        return
      }
      e.preventDefault()
      w.acc += e.deltaY
      const steps = Math.trunc(w.acc / WHEEL_STEP)
      if (steps === 0) return
      w.acc -= steps * WHEEL_STEP
      setOffset(Math.max(0, Math.min(w.maxOffset, w.shown + steps)))
      setOpenId(null)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <div
      className="group/sessions flex flex-col gap-3"
      style={inkVar(colors)}
      onMouseLeave={() => setHovered(null)}
    >
      <div className="flex min-h-6 items-center gap-2">
        <span className="font-heading text-sm font-semibold">Séances</span>
        {maxOffset > 0 && (
          <span className="pointer-events-none flex gap-0.5 opacity-0 transition-opacity group-focus-within/sessions:pointer-events-auto group-focus-within/sessions:opacity-100 group-hover/sessions:pointer-events-auto group-hover/sessions:opacity-100">
            <PageButton
              label="Plus récentes"
              disabled={shown <= 0}
              onClick={() => page(-1)}
            >
              <ChevronUp className="size-3.5" strokeWidth={2.2} />
            </PageButton>
            <PageButton
              label="Plus anciennes"
              disabled={shown >= maxOffset}
              onClick={() => page(1)}
            >
              <ChevronDown className="size-3.5" strokeWidth={2.2} />
            </PageButton>
          </span>
        )}
      </div>

      <div className="flex items-start gap-6">
        <div ref={gridRef} className="flex shrink-0 flex-col gap-1">
          <div className="grid grid-cols-[44px_repeat(7,28px)] gap-[3px] text-[10.5px] text-muted-foreground">
            <span />
            {WEEKDAYS.map((d, i) => (
              <span key={i} className="text-center">
                {d}
              </span>
            ))}
          </div>
          {weeks.map((w) => (
            <div
              key={w.start.getTime()}
              className="grid grid-cols-[44px_repeat(7,28px)] items-center gap-[3px]"
            >
              <span className="text-[10.5px] whitespace-nowrap text-muted-foreground">
                {weekLabel(w.start)}
              </span>
              {w.cells.map((cell) => (
                <DayCell
                  key={cell.key}
                  cell={cell}
                  colors={colors}
                  isToday={cell.key === todayKey}
                  hovered={hovered === cell.key}
                  onHover={() => hoverDay(cell.key)}
                  onLeave={() => setHovered(null)}
                  onOpenActivity={onOpenActivity}
                />
              ))}
            </div>
          ))}
        </div>

        <div
          ref={journalRef}
          className="min-w-0 flex-1 overflow-hidden"
          style={{ height: height + extra }}
          // Une étiquette atteinte au clavier ne doit pas faire défiler la
          // fenêtre : c'est le glissement qui la montre.
          onScroll={(e) => {
            e.currentTarget.scrollTop = 0
          }}
        >
          <div
            className="flex flex-col transition-transform duration-[350ms] ease-[cubic-bezier(.2,.7,.2,1)] motion-reduce:transition-none"
            style={{ transform: `translateY(${-shown * row}px)` }}
          >
            {entries.map((entry, i) => {
              const id = entry.session.activity.id
              return (
                <JournalRow
                  key={id}
                  entry={entry}
                  height={row}
                  colors={colors}
                  open={openId === id}
                  highlighted={hovered === entry.day.key}
                  onHover={() => setHovered(entry.day.key)}
                  onLeave={() => setHovered(null)}
                  onFocus={() => bringIntoView(i)}
                  onToggle={(open) => setOpenId(open ? id : null)}
                  onHeight={setOpenHeight}
                  onOpenActivity={onOpenActivity}
                />
              )
            })}
            {entries.length === 0 && (
              <span className="flex h-[37px] items-center border-t px-1.5 text-[13px] text-muted-foreground">
                Aucune séance
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-6 cursor-pointer place-items-center rounded-md text-foreground/75 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

/**
 * Une case de la grille. Sans séance : fond gris, inerte. Avec : la teinte de
 * sa première séance, l'emoji de sa première pièce, la pastille du nombre de
 * pièces s'il y en a plus d'une. Une séance : le clic l'ouvre ; plusieurs, la
 * liste du jour.
 */
function DayCell({
  cell,
  colors,
  isToday,
  hovered,
  onHover,
  onLeave,
  onOpenActivity,
}: {
  cell: GridCell
  colors: SessionColors
  isToday: boolean
  hovered: boolean
  onHover: () => void
  onLeave: () => void
  onOpenActivity: OpenActivity
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const { day } = cell
  if (!day)
    return (
      <span
        className="h-7 rounded-md bg-muted"
        style={isToday ? { boxShadow: 'inset 0 0 0 1.5px #ef4444' } : undefined}
      />
    )

  const first = day.sessions[0]
  const t = tone(first.state, colors)
  const count = dayPieceCount(day)
  const button = (
    <CellButton
      ref={ref}
      className={t.className}
      style={{
        ...t.style,
        boxShadow: hovered
          ? `0 0 0 2px ${colors.ink}`
          : isToday
            ? 'inset 0 0 0 1.5px #ef4444'
            : undefined,
      }}
      title={day.sessions
        .flatMap((s) => s.pieces.map((p) => `${p.emoji} ${p.title}`))
        .join(' · ')}
      label={`${dayLabel(day.date)} · ${day.sessions.map((s) => s.title).join(', ')}`}
      emoji={first.pieces[0].emoji}
      count={count}
      onHover={onHover}
      onLeave={onLeave}
      onClick={
        day.sessions.length === 1
          ? (e) =>
              onOpenActivity(
                first.activity,
                e.currentTarget.getBoundingClientRect(),
              )
          : undefined
      }
    />
  )
  if (day.sessions.length === 1) return button
  return (
    <DayListPopover
      day={day}
      colors={colors}
      onOpenActivity={(a) => {
        const rect = ref.current?.getBoundingClientRect()
        if (rect) onOpenActivity(a, rect)
      }}
    >
      {button}
    </DayListPopover>
  )
}

/** Le bouton d'une case ; `forwardRef` et le reste des props (ARIA, clic)
 *  pour que la liste du jour s'y ancre (`PopoverTrigger asChild`). */
const CellButton = forwardRef<
  HTMLButtonElement,
  Omit<ComponentProps<'button'>, 'children'> & {
    style: CSSProperties
    label: string
    emoji: string
    count: number
    onHover: () => void
    onLeave: () => void
  }
>(function CellButton(
  { className, label, emoji, count, onHover, onLeave, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      data-session-open
      aria-label={label}
      {...rest}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onFocus={onHover}
      onBlur={onLeave}
      className={cn(
        'relative grid h-7 cursor-pointer place-items-center rounded-md border border-transparent text-xs leading-none transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        className,
      )}
    >
      {emoji}
      {count > 1 && (
        <span className="absolute -top-1 -right-1 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-foreground px-[3px] text-[9px] leading-none font-bold text-background">
          {count}
        </span>
      )}
    </button>
  )
})

/**
 * Une ligne du journal : la date, les étiquettes des pièces — autant qu'il en
 * tient entières, la place de « +n » gardée s'il en reste —, la marque d'état.
 * Dépliée, toutes les pièces passent à la ligne et elle grandit.
 */
function JournalRow({
  entry,
  height,
  colors,
  open,
  highlighted,
  onHover,
  onLeave,
  onFocus,
  onToggle,
  onHeight,
  onOpenActivity,
}: {
  entry: JournalEntry
  height: number
  colors: SessionColors
  open: boolean
  highlighted: boolean
  onHover: () => void
  onLeave: () => void
  onFocus: () => void
  onToggle: (open: boolean) => void
  /** La hauteur de la ligne dépliée : la fenêtre grandit d'autant. */
  onHeight: (height: number) => void
  onOpenActivity: OpenActivity
}) {
  const { day, session } = entry
  const pieces = session.pieces
  const rowRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(pieces.length)

  // Combien d'étiquettes entières tiennent (en gardant la place de « +n »
  // s'il en reste) ; au moins une, quitte à la tronquer.
  useLayoutEffect(() => {
    const box = boxRef.current
    const measure = measureRef.current
    if (open || !box || !measure) return
    const compute = () => {
      const width = box.clientWidth
      const widths = [...measure.children].map(
        (c) => (c as HTMLElement).offsetWidth,
      )
      let k = 0
      let x = 0
      for (let j = 0; j < widths.length; j++) {
        const w = x + (j ? CHIP_GAP : 0) + widths[j]
        const rest = widths.length - j - 1
        if (w + (rest ? CHIP_GAP + PLUS_WIDTH : 0) > width) break
        x = w
        k = j + 1
      }
      setFit(Math.max(1, k))
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(box)
    ro.observe(measure)
    return () => ro.disconnect()
  }, [open, pieces])

  useLayoutEffect(() => {
    const el = rowRef.current
    if (!open || !el) return
    const report = () => onHeight(el.offsetHeight)
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open, onHeight])

  const k = open ? pieces.length : Math.min(pieces.length, fit)
  const rest = pieces.slice(k)
  const open_ = (e: MouseEvent<HTMLButtonElement>) =>
    onOpenActivity(session.activity, e.currentTarget.getBoundingClientRect())

  return (
    <div
      ref={rowRef}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onFocus={onFocus}
      className={cn(
        'grid shrink-0 grid-cols-[76px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md border-t px-1.5',
        open && 'py-1.5',
        highlighted && 'bg-muted',
      )}
      style={open ? { minHeight: height } : { height }}
    >
      <span
        className={cn(
          'text-[12.5px] whitespace-nowrap text-muted-foreground tabular-nums',
          session.state === 'late' && 'text-red-700 dark:text-red-400',
          day.isToday && 'font-semibold text-foreground',
        )}
      >
        {day.isToday ? "aujourd'hui" : dayLabel(day.date)}
      </span>
      <div className="relative min-w-0">
        <div
          ref={boxRef}
          className={cn(
            'flex min-w-0 gap-1',
            open ? 'flex-wrap' : 'overflow-hidden',
          )}
        >
          {pieces.slice(0, k).map((p) => (
            <PieceChip
              key={p.key}
              piece={p}
              state={session.state}
              colors={colors}
              session={session.title}
              onClick={open_}
            />
          ))}
          {rest.length > 0 && (
            <button
              type="button"
              title={rest.map((p) => `${p.emoji} ${p.title}`).join('\n')}
              aria-label={`Afficher ${rest.length} pièce${rest.length > 1 ? 's' : ''} de plus`}
              onClick={() => onToggle(true)}
              className="inline-flex h-6 shrink-0 cursor-pointer items-center rounded-md bg-muted px-[7px] text-xs font-semibold text-foreground/75 tabular-nums hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              +{rest.length}
            </button>
          )}
          {open && (
            <button
              type="button"
              aria-label="Replier"
              title="Replier"
              onClick={() => onToggle(false)}
              className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md bg-muted text-foreground/75 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <ChevronUp className="size-[13px]" strokeWidth={2.2} />
            </button>
          )}
        </div>
        {/* Les étiquettes à leur largeur naturelle, invisibles : la mesure. */}
        <div
          ref={measureRef}
          aria-hidden
          className="pointer-events-none invisible absolute top-0 left-0 flex gap-1 whitespace-nowrap"
        >
          {pieces.map((p) => (
            <span
              key={p.key}
              className="inline-flex h-6 shrink-0 items-center gap-[5px] rounded-md border border-transparent pr-2 pl-1.5 text-[12.5px]"
            >
              <span className="text-[13px]">{p.emoji}</span>
              {p.title}
            </span>
          ))}
        </div>
      </div>
      <StateMark state={session.state} />
    </div>
  )
}
