import { useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  type Activity,
  copyOf,
  isOverdueRecall,
  OVERDUE_RING,
  useActivities,
  useCreateActivity,
  useUpdateActivity,
} from '@/entities/activity'
import { useActivityTypes } from '@/entities/activity-type'
import { domainColor, useDomains } from '@/entities/domain'
import { useAllProjects } from '@/entities/project'
import {
  DeleteActivityDialog,
  useActivityDeletion,
} from '@/features/activity/delete'
import {
  ActivityPanel,
  useSelectOrToggle,
  useSessionCheck,
} from '@/features/activity/edit'
import { panelPosBeside } from '@/shared/lib/panel-position'
import {
  addDays,
  fmtTime,
  sameDay,
  startOfDay,
  startOfWeek,
  toLocalISO,
} from '@/shared/lib/date'
import { cn } from '@/shared/lib/utils'
import { DoneMark, toast } from '@/shared/ui'

interface DayColumn {
  day: Date
  items: Activity[]
}

/** La journée d'abord, puis l'heure de début. */
const byTime = (a: Activity, b: Activity) => {
  if (a.all_day !== b.all_day) return a.all_day ? -1 : 1
  return (a.start_at ?? '') < (b.start_at ?? '') ? -1 : 1
}

/** « 9h », « 10h30 » : l'heure de début, au plus court. */
function shortHour(iso: string): string {
  const d = new Date(iso)
  const m = d.getMinutes()
  return `${d.getHours()}h${m ? String(m).padStart(2, '0') : ''}`
}

/**
 * La semaine de l'accueil (design #52, `prod/Accueil`) : sept colonnes du
 * lundi au dimanche, une chip d'une ligne par activité — coche, emoji, heure de
 * début. Le Quotidien n'y figure pas (la to-do du jour le porte), ni ce qui
 * n'est pas encore posé : la semaine montre ce qui existe.
 *
 * Un clic ouvre le panneau de l'activité, le même que sur le calendrier ; un
 * double-clic la coche. Les jours avant aujourd'hui s'effacent, et ce qui n'y
 * a pas été fait grise en plus.
 *
 * Une colonne vide ne dit rien : son vide suffit, et une mention « rien de
 * prévu » répétée sur sept colonnes pèserait plus que ce qui est prévu.
 */
export function WeekBoard({
  domainIds,
  calendarHref,
}: {
  /** Les domaines à montrer ; absent ou vide : tous. */
  domainIds?: readonly string[]
  calendarHref: string
}) {
  const today = startOfDay(new Date())
  const weekStart = startOfWeek(today)
  const weekEnd = addDays(weekStart, 7)

  const { data: domains } = useDomains()
  const domainOf = (id: string) => domains?.find((d) => d.id === id)
  const { data: projects } = useAllProjects()
  const { data: activityTypes } = useActivityTypes()

  const { data: activities } = useActivities({
    start: toLocalISO(weekStart),
    end: toLocalISO(weekEnd),
  })
  const update = useUpdateActivity()
  const createActivity = useCreateActivity()
  const queryClient = useQueryClient()

  const columns = useMemo<DayColumn[]>(() => {
    const keep = (domainId: string) =>
      !domainIds || domainIds.length === 0 || domainIds.includes(domainId)
    const cols = Array.from({ length: 7 }, (_, i) => ({
      day: addDays(weekStart, i),
      items: [] as Activity[],
    }))
    for (const a of activities ?? []) {
      if (!a.start_at || a.daily || !keep(a.domain_id)) continue
      const i = Math.floor(
        (startOfDay(new Date(a.start_at)).getTime() - weekStart.getTime()) /
          86_400_000 +
          0.5,
      )
      cols[i]?.items.push(a)
    }
    for (const c of cols) c.items.sort(byTime)
    return cols
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activities, domainIds, weekStart.getTime()])

  // Le panneau d'activité — le même que celui du calendrier, ancré à côté de
  // la chip cliquée.
  const [selected, setSelected] = useState<Activity | null>(null)
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 })
  const [menu, setMenu] = useState<{
    a: Activity
    x: number
    y: number
  } | null>(null)

  function closePanel() {
    setSelected(null)
    setMenu(null)
  }

  // Ferme au clic en dehors. Viser une chip n'est pas « cliquer à côté » :
  // c'est son propre geste qui tranche (ouvrir ailleurs, ne rien faire si le
  // panneau est déjà sur elle, cocher au double-clic) — cf. le calendrier.
  useEffect(() => {
    if (!selected) return
    function onDown(e: PointerEvent) {
      const t = e.target as HTMLElement
      if (
        t.closest('[data-activity-ui]') ||
        t.closest('[data-activity-block]') ||
        t.closest('[data-radix-popper-content-wrapper]') ||
        t.closest('[role="menu"]')
      )
        return
      closePanel()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [selected])

  // Cocher une séance d'apprentissage passe par sa modale (#140).
  const sessionCheck = useSessionCheck()
  function toggleDone(a: Activity) {
    sessionCheck.request(a, () => applyDone(a))
  }

  /** Optimiste : la coche réagit avant la réponse, comme au calendrier. */
  async function applyDone(a: Activity) {
    const patch = (done: boolean) =>
      queryClient.setQueriesData<Activity[]>(
        { queryKey: ['activities'] },
        (old) => old?.map((x) => (x.id === a.id ? { ...x, done } : x)),
      )
    patch(!a.done)
    try {
      await update.mutateAsync({ id: a.id, body: { done: !a.done } })
    } catch {
      patch(a.done)
      toast.error('Échec')
    }
  }

  // Menu secondaire du panneau, celui de la to-do : Copier et Coller
  // supposent une grille où déposer le résultat, pas une semaine sans heures.
  async function duplicateActivity(a: Activity) {
    setMenu(null)
    try {
      await createActivity.mutateAsync(
        copyOf(a, {
          all_day: a.all_day,
          start_at: a.start_at,
          end_at: a.end_at,
        }),
      )
    } catch {
      toast.error('La duplication a échoué')
    }
  }
  const deletion = useActivityDeletion({
    onError: () => toast.error('La suppression a échoué'),
  })
  async function removeActivity(a: Activity) {
    closePanel()
    await deletion.request(a)
  }

  return (
    <section className="flex min-w-0 flex-col gap-3">
      {sessionCheck.dialog}
      <div className="flex min-h-7 items-center gap-2">
        <h2 className="font-heading text-sm font-semibold text-foreground">
          La semaine
        </h2>
        <Link
          to={calendarHref}
          aria-label="Ouvrir le calendrier"
          className="ml-auto grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowUpRight className="size-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-7 overflow-hidden rounded-lg border bg-card">
        {columns.map((col, i) => {
          const isToday = sameDay(col.day, today)
          const isPast = col.day < today
          return (
            <div
              key={col.day.toISOString()}
              className={cn(
                'flex min-w-0 flex-col',
                i > 0 && 'border-l',
                isToday && 'bg-muted/50',
              )}
            >
              <div className="flex items-center gap-1 px-2 pt-2 pb-1.5">
                <span className="text-[11px] text-muted-foreground">
                  {col.day.toLocaleDateString('fr-FR', { weekday: 'short' })}
                </span>
                <span
                  className={cn(
                    'inline-grid h-5 min-w-5 place-items-center rounded-[5px] px-[3px] text-xs font-semibold',
                    isToday && 'bg-red-500 text-white',
                  )}
                >
                  {col.day.getDate()}
                </span>
              </div>

              <div className="flex flex-col gap-1 px-1.5 pb-2">
                {col.items.map((a) => {
                  const domain = domainOf(a.domain_id)
                  return (
                    <WeekChip
                      key={a.id}
                      activity={a}
                      emoji={a.emoji || domain?.emoji || ''}
                      color={domainColor(domain?.color)}
                      past={isPast}
                      panelOpen={selected?.id === a.id}
                      onSelect={(rect) => {
                        setMenu(null)
                        setSelected(a)
                        // À gauche pour les deux derniers jours, comme au
                        // calendrier.
                        setPanelPos(
                          panelPosBeside(rect, i >= 5 ? 'left' : 'right'),
                        )
                      }}
                      onToggleDone={() => toggleDone(a)}
                      onClosePanel={closePanel}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {selected && (
        <ActivityPanel
          // Remonté à chaque activité : le panneau initialise ses états depuis
          // `activity` au montage et ne les relit pas.
          key={selected.id}
          activity={selected}
          draft={null}
          pos={panelPos}
          domains={domains ?? []}
          projects={projects ?? []}
          activityTypes={activityTypes ?? []}
          onClose={closePanel}
          onMenu={(e) => setMenu({ a: selected, x: e.clientX, y: e.clientY })}
        />
      )}

      {menu && (
        <div
          data-activity-ui
          style={{ top: menu.y, left: menu.x }}
          className="fixed z-50 min-w-40 overflow-hidden rounded-lg border border-border bg-popover py-1 text-sm shadow-md"
        >
          <button
            type="button"
            onClick={() => duplicateActivity(menu.a)}
            className="block w-full px-3 py-1.5 text-left hover:bg-muted/60"
          >
            Dupliquer
          </button>
          <button
            type="button"
            onClick={() => removeActivity(menu.a)}
            className="block w-full px-3 py-1.5 text-left text-destructive hover:bg-muted/60"
          >
            Supprimer
          </button>
        </div>
      )}

      <DeleteActivityDialog
        pending={deletion.pending}
        isPending={deletion.isPending}
        onConfirm={deletion.confirm}
        onCancel={deletion.cancel}
      />
    </section>
  )
}

/**
 * Une activité de la semaine : une ligne de 22px — coche, emoji, heure de
 * début (rien pour une journée entière). Au survol, la chip se déplie sur son
 * titre et sa plage, et l'heure de la première ligne s'efface.
 *
 * Teinte du domaine au repos ; fait = `DoneMark` à l'encre du domaine, à faire
 * = cercle pointillé. Un jour révolu l'efface à 45 %, et grise ce qui n'y a pas
 * été fait — sans pointillés : l'effacement suffit à dire « passé ».
 *
 * L'activité qui porte une interro (#84) a sa teinte, violet pâle, et, en
 * retard, un liseré rouge ; pour le reste c'est une activité comme une autre
 * (effacée, grisée si non faite).
 */
function WeekChip({
  activity: a,
  emoji,
  color,
  past,
  panelOpen,
  onSelect,
  onToggleDone,
  onClosePanel,
}: {
  activity: Activity
  emoji: string
  color: ReturnType<typeof domainColor>
  past: boolean
  panelOpen: boolean
  onSelect: (rect: DOMRect) => void
  onToggleDone: () => void
  onClosePanel: () => void
}) {
  // Un clic ouvre le panneau, deux cochent — cf. `useSelectOrToggle`.
  const clicOuCoche = useSelectOrToggle(
    onSelect,
    onToggleDone,
    panelOpen,
    onClosePanel,
  )
  const range = a.all_day
    ? 'journée'
    : a.start_at
      ? `${fmtTime(a.start_at)}${a.end_at ? `–${fmtTime(a.end_at)}` : ''}`
      : ''

  return (
    <button
      type="button"
      data-activity-block
      aria-label={a.title}
      aria-pressed={a.done}
      onClick={clicOuCoche.onClick}
      onDoubleClick={clicOuCoche.onDoubleClick}
      className={cn(
        'group flex max-h-[22px] min-w-0 flex-col overflow-hidden rounded-md px-[5px] text-left text-[11px] select-none',
        'transition-[max-height,opacity,filter] duration-200 ease-out outline-none',
        // Le dépliage suit le survol sans délai, comme au calendrier (#56).
        'hover:max-h-[200px] focus-visible:max-h-[200px] focus-visible:ring-3 focus-visible:ring-ring/50',
        color.soft,
        isOverdueRecall(a) && OVERDUE_RING,
        past && 'opacity-45 hover:opacity-100 focus-visible:opacity-100',
        past &&
          !a.done &&
          'grayscale hover:grayscale-0 focus-visible:grayscale-0',
      )}
    >
      <span className="flex h-[22px] w-full shrink-0 items-center gap-1">
        {a.done ? (
          <DoneMark size="pill" className={color.ink} />
        ) : (
          <span className="block size-3 shrink-0 rounded-full border border-dashed border-current opacity-60" />
        )}
        <span className="shrink-0 text-xs leading-none">{emoji}</span>
        {!a.all_day && a.start_at && (
          <span
            className={cn(
              'ml-auto min-w-0 overflow-hidden text-[10px] tracking-[-0.02em] whitespace-nowrap tabular-nums opacity-80 transition-opacity duration-150',
              'group-hover:opacity-0 group-focus-visible:opacity-0',
            )}
          >
            {shortHour(a.start_at)}
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-col gap-px pb-[5px] pl-4">
        <span
          lang="fr"
          className="leading-tight font-semibold [overflow-wrap:break-word] hyphens-auto text-pretty"
        >
          {a.title}
        </span>
        <span className="text-[10px] tabular-nums opacity-75">{range}</span>
      </span>
    </button>
  )
}
