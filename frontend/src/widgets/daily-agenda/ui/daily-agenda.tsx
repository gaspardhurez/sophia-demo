import { ChevronLeft, ChevronRight, Circle, X } from 'lucide-react'
import { type KeyboardEvent, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  type Activity,
  copyOf,
  isOverdueRecall,
  isPendingRecall,
  overdueSince,
  recallPlanOf,
  useActivities,
  useCreateActivity,
  useUpdateActivity,
} from '@/entities/activity'
import { useAllProjects } from '@/entities/project'
import {
  DeleteActivityDialog,
  useActivityDeletion,
} from '@/features/activity/delete'
import { ActivityPanel, useSessionCheck } from '@/features/activity/edit'
import { domainColor, useDomains } from '@/entities/domain'
import { useActivityTypes } from '@/entities/activity-type'
import { addDays, fmtTime, startOfDay, toLocalISO } from '@/shared/lib/date'
import { cn } from '@/shared/lib/utils'
import { DoneMark, toast } from '@/shared/ui'
import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui'

export function DailyAgenda({
  domainIds,
}: {
  /**
   * Les domaines à montrer (le filtre de l'accueil, #52) ; absent ou vide :
   * tous.
   */
  domainIds?: readonly string[]
} = {}) {
  const [day, setDay] = useState(() => startOfDay(new Date()))
  const update = useUpdateActivity()
  const createActivity = useCreateActivity()
  const { data: domains } = useDomains()
  const emojiOf = (id: string) => domains?.find((d) => d.id === id)?.emoji ?? ''
  const colorOf = (id: string) =>
    domainColor(domains?.find((d) => d.id === id)?.color).soft
  const inkOf = (id: string) =>
    domainColor(domains?.find((d) => d.id === id)?.color).ink

  const { data: activityTypes } = useActivityTypes()
  const start = toLocalISO(day)
  const end = toLocalISO(addDays(day, 1))
  const { data: fetched } = useActivities({ start, end })
  // Les interros en retard (#84) : non passées, d'un jour révolu. Elles
  // remontent en tête d'aujourd'hui jusqu'à passation ; les autres jours,
  // chacune reste sur le sien.
  const { data: fetchedOverdue } = useActivities({
    end: toLocalISO(startOfDay(new Date())),
    recallPending: true,
  })
  // Filtrées ici plutôt qu'au serveur : une seule lecture par jour, quel que
  // soit le filtre, et le cache reste celui des autres écrans.
  const keep = (a: Activity) =>
    !domainIds || domainIds.length === 0 || domainIds.includes(a.domain_id)
  const activities = useMemo(
    () => fetched?.filter(keep),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetched, domainIds],
  )
  const overdue = useMemo(
    () => (fetchedOverdue ?? []).filter((a) => keep(a) && !a.daily),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchedOverdue, domainIds],
  )
  const navigate = useNavigate()
  const { data: projects } = useAllProjects()

  // Panneau contextuel : le même que celui du calendrier, extrait en feature.
  const [panelFor, setPanelFor] = useState<Activity | null>(null)
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 })

  // Le panneau s'ouvre au point cliqué, pas à côté de l'élément : ici il n'y a
  // pas de colonne de jour à ne pas recouvrir, contrairement au calendrier.
  function openPanelAt(a: Activity, e: React.MouseEvent) {
    e.preventDefault()
    const W = 320
    const H = 440
    setPanelPos({
      top: Math.max(8, Math.min(e.clientY, window.innerHeight - H)),
      left: Math.max(8, Math.min(e.clientX, window.innerWidth - W - 8)),
    })
    setPanelFor(a)
  }

  // Cocher une séance d'apprentissage passe par sa modale (#140).
  const sessionCheck = useSessionCheck()
  function toggleDone(a: Activity) {
    sessionCheck.request(a, () =>
      update.mutate({ id: a.id, body: { done: !a.done } }),
    )
  }

  /** Cocher une interro non passée, c'est l'ouvrir pour la passer (#84) :
   *  `/plans/:id/interro` commence ou reprend la passation, dont la fin la
   *  marque passée (et coche la séance si elle n'est que l'interro) — à
   *  partir de son jour seulement, jamais en avance (#138). Une ligne
   *  ordinaire, ou dont l'interro est passée, se coche. */
  function check(a: Activity) {
    const reached =
      a.start_at !== null && startOfDay(new Date(a.start_at)) <= new Date()
    if (isPendingRecall(a) && !reached)
      return void toast("L'interro se passe à partir de son jour.")
    const planId = isPendingRecall(a) ? recallPlanOf(a) : null
    if (planId) navigate(`/plans/${planId}/interro`)
    else toggleDone(a)
  }

  // Menu secondaire du panneau. Le calendrier propose aussi Dupliquer/Copier,
  // qui supposent une grille où déposer le résultat : ici, seule la suppression
  // a du sens.
  const [menu, setMenu] = useState<{
    a: Activity
    x: number
    y: number
  } | null>(null)

  /** Même jour, même horaire : le duplicata recopie ce que recopie celui du
   *  calendrier (`copyOf`) — projets, activité type, savoir, exercice,
   *  valeurs —, pour compter comme la première dans la progression de chacun. */
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

  // Pas de pile d'annulation ici, contrairement au calendrier : la
  // confirmation est le seul filet avant que la séance et ses relevés partent.
  const deletion = useActivityDeletion({
    onError: () => toast.error('La suppression a échoué'),
  })

  async function removeActivity(a: Activity) {
    setMenu(null)
    setPanelFor(null)
    await deletion.request(a)
  }

  // Ferme au clic en dehors — `data-activity-ui` est posé par le panneau.
  // `pointerdown` précède `contextmenu` : un clic droit sur un autre item ferme
  // puis rouvre, ce qui donne bien le panneau du nouvel item.
  useEffect(() => {
    if (!panelFor) return
    function onDown(e: PointerEvent) {
      const t = e.target as HTMLElement
      if (
        t.closest('[data-activity-ui]') ||
        t.closest('[data-radix-popper-content-wrapper]') ||
        t.closest('[role="menu"]')
      )
        return
      setPanelFor(null)
      setMenu(null)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [panelFor])

  // La bande de pastilles : les cases du jour des activités types
  // quotidiennes (#37). Le reste, avec ou sans heure, est une ligne.
  const isDayCase = (a: Activity) => a.daily
  const isToday = day.getTime() === startOfDay(new Date()).getTime()
  const items = useMemo(
    () => [
      // En tête, et seulement aujourd'hui.
      ...(isToday ? overdue : []),
      ...[...(activities ?? [])]
        .filter((a) => !isDayCase(a))
        .sort((a, b) => {
          if (a.all_day !== b.all_day) return a.all_day ? -1 : 1
          return (a.start_at ?? '') < (b.start_at ?? '') ? -1 : 1
        }),
    ],
    [activities, overdue, isToday],
  )
  const habitItems = useMemo(
    () =>
      (activities ?? [])
        .filter(isDayCase)
        // Ordre stable d'un jour à l'autre : c'est ce qui permet de retenir la
        // position d'une pastille, seul intérêt d'une grille sans libellés.
        .sort((a, b) => a.title.localeCompare(b.title, 'fr')),
    [activities],
  )
  const habitDoneCount = habitItems.filter((a) => a.done).length
  const allHabitsDone =
    habitItems.length > 0 && habitDoneCount === habitItems.length

  // « Raté » = non fait sur un jour révolu. Purement dérivé : rien n'est stocké,
  // rien n'est irréversible — un clic coche encore. Ça distingue seulement
  // « pas encore » de « pas fait », que rien ne séparait jusqu'ici.
  const isPast = day.getTime() < startOfDay(new Date()).getTime()
  // Une activité qui porte une interro est ratée comme une autre : c'est
  // l'interro, pas l'activité, qui reste à passer (15/10).
  const missed = (a: Activity) => isPast && !a.done
  const label = isToday
    ? "Aujourd'hui"
    : day.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })

  // ←/→ = jour précédent / suivant, quand le focus est dans l'agenda (un
  // chevron cliqué, une ligne) — comme la semaine du calendrier. Un événement
  // remonté d'un portail (panneau, modale, menu) ou d'une saisie ne compte pas.
  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
    const target = e.target as HTMLElement
    if (!e.currentTarget.contains(target)) return
    if (
      target.closest('input, textarea, select, [contenteditable="true"]') ||
      target.closest('[role="menu"], [role="dialog"], [role="listbox"]')
    )
      return
    e.preventDefault()
    setDay((d) => addDays(d, e.key === 'ArrowLeft' ? -1 : 1))
  }

  return (
    <section onKeyDown={onKeyDown}>
      {sessionCheck.dialog}
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-heading text-sm font-semibold capitalize text-foreground">
          {label}
        </h2>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setDay((d) => addDays(d, -1))}
            aria-label="Jour précédent"
          >
            <ChevronLeft className="size-4" />
          </Button>
          {!isToday && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDay(startOfDay(new Date()))}
            >
              Aujourd'hui
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setDay((d) => addDays(d, 1))}
            aria-label="Jour suivant"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        {habitItems.length > 0 && (
          <div className="border-b p-3">
            {/* La bande a besoin d'un titre : sans lui, une pastille isolée se
                lit comme un orphelin plutôt que comme le premier d'un rang. */}
            <div className="mb-2.5 flex items-center justify-between">
              <span className="font-heading text-xs font-semibold text-muted-foreground">
                Quotidien
              </span>
              <span
                className={cn(
                  'text-xs font-medium tabular-nums transition-colors',
                  allHabitsDone && !isPast
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground',
                )}
              >
                {habitDoneCount}/{habitItems.length}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {habitItems.map((o) => (
                <Tooltip key={o.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-pressed={o.done}
                      aria-label={o.title}
                      onClick={() => toggleDone(o)}
                      onContextMenu={(e) => openPanelAt(o, e)}
                      className={cn(
                        'relative flex size-11 items-center justify-center rounded-xl border text-xl',
                        // `transition` couvre translate/scale/box-shadow et les
                        // couleurs — les propriétés autonomes de Tailwind v4 ne
                        // sont pas prises par `transition-transform` seul.
                        'transition duration-200',
                        'hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 active:scale-95',
                        'outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                        // Le fond ne bouge plus quand c'est fait : c'est
                        // `DoneMark` en coin qui le dit (changelog #16). Le
                        // remplissage saturé portait l'état avant, et se lisait
                        // comme une mise en avant plutôt qu'un accompli.
                        colorOf(o.domain_id),
                        missed(o) &&
                          'border-dashed opacity-50 grayscale hover:opacity-100 hover:grayscale-0',
                      )}
                    >
                      {o.emoji || '•'}
                      {o.done && (
                        <DoneMark
                          size="row"
                          className={cn(
                            'absolute -right-1 -bottom-1 ring-2 ring-card',
                            inkOf(o.domain_id),
                          )}
                        />
                      )}
                      {missed(o) && (
                        <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-muted-foreground text-background ring-2 ring-card">
                          <X className="size-2.5" strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  </TooltipTrigger>
                  {/* Sans libellé sous la pastille, l'infobulle est le seul
                      accès au sens : elle doit être immédiate. */}
                  <TooltipContent>{o.title}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>
        )}
        {items.length === 0 && habitItems.length === 0 && (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            Rien de prévu ce jour.
          </p>
        )}
        {items.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => check(a)}
            onContextMenu={(e) => openPanelAt(a, e)}
            className="flex w-full items-center gap-2.5 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/50"
          >
            {a.done ? (
              <DoneMark size="row" className={inkOf(a.domain_id)} />
            ) : missed(a) ? (
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/60 text-muted-foreground">
                <X className="size-2.5" strokeWidth={3} />
              </span>
            ) : (
              <Circle className="size-4 shrink-0 text-muted-foreground/40" />
            )}
            {/* L'emoji de la séance d'abord : c'est le sien. Celui du domaine
                n'est qu'un repli pour qu'une activité libre ne reste pas
                muette. */}
            {(a.emoji || emojiOf(a.domain_id)) && (
              <span className="shrink-0">
                {a.emoji || emojiOf(a.domain_id)}
              </span>
            )}
            <span
              className={cn(
                'flex-1 truncate',
                a.done && 'text-muted-foreground line-through',
                missed(a) && 'text-muted-foreground',
              )}
            >
              {a.title}
            </span>
            {isToday && isOverdueRecall(a) ? (
              <span className="shrink-0 text-xs font-medium text-[#dc2626] dark:text-red-400">
                {overdueSince(a)}
              </span>
            ) : (
              <span className="shrink-0 text-xs text-muted-foreground">
                {!a.all_day && a.start_at
                  ? fmtTime(a.start_at)
                  : a.all_day
                    ? 'journée'
                    : ''}
              </span>
            )}
          </button>
        ))}
      </div>

      {panelFor && (
        <ActivityPanel
          activity={panelFor}
          draft={null}
          pos={panelPos}
          domains={domains ?? []}
          projects={projects ?? []}
          activityTypes={activityTypes ?? []}
          onClose={() => setPanelFor(null)}
          onMenu={(e) => setMenu({ a: panelFor, x: e.clientX, y: e.clientY })}
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
