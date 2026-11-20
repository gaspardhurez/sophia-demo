import { Check, Redo2, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'

import {
  type Activity,
  type DraftSeed,
  countsFor,
  useActivities,
  useAddActivityAct,
  useLinkActivityAchievement,
  useRemoveActivityAct,
  useUnlinkActivityAchievement,
} from '@/entities/activity'
import { usePlanningPreview } from '@/entities/activity-type'
import { domainColorValues, useDomains } from '@/entities/domain'
import { useAddMetricValue } from '@/entities/metric'
import { useAllProjects } from '@/entities/project'
import {
  useInvalidatePreparations,
  usePreparationProjects,
  useStartWeekPreparation,
  useValidateWeekPreparation,
  useWeekPreparation,
  type WeekSteps,
} from '@/entities/preparation'
import { DeleteActivityDialog } from '@/features/activity/delete'
import { ApiError } from '@/shared/api'
import { startOfDay, toDateISO, toLocalISO } from '@/shared/lib/date'
import { useDocumentTitle } from '@/shared/lib/document-title'
import { useUndoStack } from '@/shared/lib/undo-stack'
import { Button, toast } from '@/shared/ui'
import {
  ActivityCalendar,
  type BlockDecoration,
  type Decorate,
  type LinkedItem,
} from '@/widgets/activity-calendar'

import { type Arm, sameAct, useArm } from '../model/arm'
import { preparationCards } from '../model/cards'
import {
  PreparationContext,
  type PreparationContextValue,
} from '../model/context'
import { usePreparationGestures } from '../model/gestures'
import { linkedOf, targetsBySession } from '../model/linked'
import {
  fmtDayRange,
  parseWeekParam,
  type PreparationWeek,
  preparationWeeks,
  WEEK_NAME,
} from '../model/weeks'
import { WeekPreparationPanel } from './week-preparation-panel'

/** Pendant une liaison, ce qui ne se choisit pas s'efface davantage. */
const ARM_DIMMED = 0.25

const fail = (err: unknown, fallback = 'Échec') =>
  toast.error(err instanceof ApiError ? err.message : fallback)

/**
 * Le mode « Préparation de la semaine » du calendrier (#92) :
 * `/calendar/preparation/:week`, où `:week` est le lundi de la semaine
 * préparée (N+1).
 *
 * L'URL porte aussi la semaine affichée (`?semaine=prochaine`, la semaine
 * écoulée sinon) et le projet ouvert (`?projet=…`). Tout geste s'écrit en
 * base : quitter puis revenir reprend là où on en était.
 *
 * La page compose : son panneau à gauche, le calendrier réduit aux deux
 * semaines à droite, piloté par elle — sa semaine, ce qu'il estompe, ce qu'il
 * montre sur les séances, le mode liaison.
 */
export function WeekPreparationPage() {
  const { week } = useParams()
  const nextStart = parseWeekParam(week)
  useDocumentTitle('Préparation de la semaine')
  if (!nextStart) return <Navigate to="/calendar" replace />
  return <Preparation key={week} nextStart={nextStart} />
}

function Preparation({ nextStart }: { nextStart: Date }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  // `nextStart` est stable : la page se remonte quand la semaine change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const weeks = useMemo(() => preparationWeeks(nextStart), [])
  const weekKey = toDateISO(weeks.next.start)
  const shown: PreparationWeek =
    params.get('semaine') === 'prochaine' ? 'next' : 'past'
  const focusId = params.get('projet')
  const { data: domains } = useDomains()
  const { data: projects } = useAllProjects()
  const invalidate = useInvalidatePreparations()

  /** Réécrit un paramètre de l'URL ; `push` pour ce qui se défait par
   *  « précédent » (ouvrir un projet), sinon on remplace. */
  const setParam = useCallback(
    (name: string, value: string | null, push = false) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (value === null) next.delete(name)
          else next.set(name, value)
          return next
        },
        { replace: !push },
      ),
    [setParams],
  )

  // Entrer dans le mode **démarre** la préparation : le serveur la crée si
  // elle manque et pose jusqu'à son dimanche les replis des domaines (ce qui
  // ne relève d'aucun projet) ; chaque projet pose les siens à son tour.
  // Idempotent : revenir reprend.
  const start = useStartWeekPreparation()
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    start.mutate(weekKey, {
      onError: (err) => fail(err, 'La préparation a échoué'),
    })
  }, [start, weekKey])
  const { data: preparation } = useWeekPreparation(weekKey)
  const reviewed = useMemo(
    () => new Set(preparation?.reviewed.map((r) => r.project_id) ?? []),
    [preparation],
  )
  const validate = useValidateWeekPreparation()

  // Les cartes : projets en cours sur les deux semaines (cf. `cards.ts`).
  // Le prévu se cumule depuis aujourd'hui : une préparation faite à l'avance
  // lit aussi ce qui sépare d'ici la semaine prochaine.
  const today = startOfDay(new Date())
  const from = today < weeks.past.start ? today : weeks.past.start
  const { data: activities } = useActivities({
    start: toLocalISO(from),
    end: toLocalISO(weeks.next.end),
  })
  const { data: ghosts } = usePlanningPreview(
    toDateISO(today),
    toDateISO(weeks.next.end),
    weeks.next.end > today,
  )
  // L'étape choisie par projet, quand une semaine en croise plusieurs
  // (#183) : elle borne le panneau, hachure au calendrier les autres jours.
  const [steps, setSteps] = useState<Record<string, WeekSteps>>({})
  const cards = useMemo(
    () =>
      preparationCards(
        projects ?? [],
        activities ?? [],
        ghosts ?? [],
        weeks,
        new Date(),
        steps,
      ),
    [projects, activities, ghosts, weeks, steps],
  )

  // Ce que chaque projet prévoit (cibles posées) : les séances le montrent.
  const preparations = usePreparationProjects(
    weekKey,
    useMemo(() => cards.map((c) => c.project.id), [cards]),
    steps,
  )
  // Les jours de l'étape choisie, quand la semaine du projet ouvert en
  // croise plusieurs : les autres se hachurent, l'aimant n'y pose pas.
  const focusPrep = preparations.find((p) => p.project_id === focusId)
  const stepDays = (week: PreparationWeek) => {
    const w = focusPrep?.[week]
    const span =
      w && w.steps.length > 1
        ? w.steps.find((s) => s.step_id === w.step_id)
        : undefined
    return span
      ? (d: Date) => {
          const k = toDateISO(d)
          return k < span.first_day || k > span.last_day
        }
      : undefined
  }
  const outsideNext = stepDays('next')
  const targets = useMemo(() => targetsBySession(preparations), [preparations])

  // Une pile d'annulation pour le calendrier et le panneau : ⌘Z défait les
  // gestes des deux, dans l'ordre.
  const undo = useUndoStack()
  const gestures = usePreparationGestures(undo)
  const [hovered, setHovered] = useState<string | null>(null)
  const arm = useArm()

  // --- Le mode liaison : ce qu'un clic sur une séance fait ----------------
  const addValue = useAddMetricValue()
  const linkAchievement = useLinkActivityAchievement()
  const unlinkAchievement = useUnlinkActivityAchievement()
  const addAct = useAddActivityAct()
  const removeAct = useRemoveActivityAct()

  /** Lier (ou délier) la séance choisie. Maj-clic : la liaison reste
   *  armée, pour en lier plusieurs d'un passage. */
  async function pick(a: Activity, keep = false) {
    const cur = arm.arm
    if (!cur || !a.start_at) return
    if (!keep) arm.done()
    const s = cur.subject
    try {
      if (s.kind === 'target')
        await addValue.mutateAsync({
          metricId: s.metricId,
          value: s.value,
          measuredAt: toDateISO(new Date(a.start_at)),
          activityId: a.id,
        })
      else if (s.kind === 'achievement') {
        if (a.achievements.some((x) => x.id === s.achievementId))
          await unlinkAchievement.mutateAsync({
            id: a.id,
            achievementId: s.achievementId,
          })
        else
          await linkAchievement.mutateAsync({
            id: a.id,
            achievementId: s.achievementId,
          })
      } else {
        const existing = a.acts.find((x) => sameAct(x, s.act))
        if (existing)
          await removeAct.mutateAsync({ id: a.id, actId: existing.id })
        else await addAct.mutateAsync({ id: a.id, act: s.act })
      }
    } catch (err) {
      fail(err)
    } finally {
      invalidate()
    }
  }

  /** Ce qu'une séance créée pendant la liaison porte d'emblée. */
  const seedOf = (cur: Arm): DraftSeed => {
    const s = cur.subject
    if (s.kind === 'target')
      return { readings: [{ metric_id: s.metricId, value: s.value }] }
    if (s.kind === 'achievement') {
      const found = (projects ?? [])
        .flatMap((o) => o.achievements)
        .find((x) => x.id === s.achievementId)
      return found
        ? {
            achievements: [
              {
                id: found.id,
                project_id: found.project_id,
                title: found.title,
                emoji: found.emoji,
                done: found.done,
              },
            ],
          }
        : {}
    }
    return { acts: [s.act] }
  }

  /** Déjà liée à ce qu'on lie : un clic la délie (l'acte, la réalisation). */
  const isPicked = (a: Activity, cur: Arm) => {
    const s = cur.subject
    if (s.kind === 'act') return a.acts.some((x) => sameAct(x, s.act))
    if (s.kind === 'achievement')
      return a.achievements.some((x) => x.id === s.achievementId)
    return false
  }

  const accentOf = (domainId: string) =>
    domainColorValues(domains?.find((d) => d.id === domainId)?.color).base

  // --- L'habillage des séances ------------------------------------------
  const inNext = (a: { start_at: string | null }) =>
    a.start_at !== null &&
    new Date(a.start_at) >= weeks.next.start &&
    new Date(a.start_at) < weeks.next.end
  const decorate: Decorate = (item) => {
    const cur = arm.arm
    if (cur) {
      // Liaison : les séances du projet, la semaine prochaine, se
      // soulèvent ; le reste s'efface.
      if (item.kind === 'ghost') return { opacity: ARM_DIMMED }
      const a = item.activity
      if (
        !inNext(a) ||
        !countsFor(a, cur.projectId) ||
        a.ritual_week_start !== null ||
        (cur.projectId === focusId &&
          a.start_at !== null &&
          outsideNext?.(new Date(a.start_at)))
      )
        return { opacity: ARM_DIMMED }
      return {
        raised: true,
        picked: isPicked(a, cur),
        accent: accentOf(a.domain_id),
        onPick: (e) => void pick(a, e.shiftKey),
      }
    }
    // Le focus sur le projet ouvert est celui du calendrier (`projectId`) :
    // le reste estompé et figé, les fantômes des autres projets masqués —
    // le calendrier se construit au fil de la préparation.
    if (item.kind === 'ghost') return undefined
    const a = item.activity
    const deco: BlockDecoration = {}
    if (a.postponed_from) deco.note = 'reportée'
    if (focusId) {
      if (!countsFor(a, focusId)) return deco
      if (hovered === a.id) deco.highlighted = true
      // Une non faite de la semaine écoulée : halo rouge, et ses gestes sur
      // le bloc (pas de menu contextuel). Qu'elle porte une interro n'y
      // change rien.
      const missed =
        !a.done &&
        a.start_at !== null &&
        new Date(a.start_at) >= weeks.past.start &&
        new Date(a.start_at) < weeks.past.end
      if (missed) {
        deco.alert = true
        deco.actions = [
          {
            key: 'done',
            label: 'Faite',
            icon: <Check />,
            onClick: () => void gestures.markDone(a),
          },
          {
            key: 'postpone',
            label: 'Reporter à la semaine prochaine',
            icon: <Redo2 />,
            onClick: () => void gestures.postpone(a),
          },
          {
            key: 'delete',
            label: 'Supprimer',
            icon: <Trash2 />,
            onClick: () => gestures.remove(a),
          },
        ]
      }
    }
    return Object.keys(deco).length > 0 ? deco : undefined
  }

  // Sur les séances de la semaine prochaine, ce qui y est lié — emojis, puis
  // noms au survol. Seulement dans ce mode.
  const linkedItems = (a: Activity): LinkedItem[] =>
    inNext(a)
      ? linkedOf(
          a,
          targets,
          domains?.find((d) => d.id === a.domain_id)?.emoji ?? '',
          projects,
        )
      : []

  const span = weeks[shown]
  const leave = () => navigate('/calendar')
  const ctx: PreparationContextValue = {
    weekKey,
    weeks,
    arm,
    hover: setHovered,
    gestures,
    steps,
    chooseStep: (projectId, week, stepId) => {
      arm.cancel()
      setSteps((s) => ({
        ...s,
        [projectId]: { ...s[projectId], [week]: stepId },
      }))
    },
  }

  return (
    <PreparationContext.Provider value={ctx}>
      <main className="flex h-[calc(100svh-var(--header-h))]">
        <WeekPreparationPanel
          weeks={weeks}
          shown={shown}
          cards={cards}
          projects={projects ?? []}
          focusId={focusId}
          onFocus={(id, week) => {
            arm.cancel()
            setHovered(null)
            // Un geste, une entrée d'historique : le projet et sa semaine
            // changent ensemble.
            setParams(
              (prev) => {
                const next = new URLSearchParams(prev)
                if (id === null) next.delete('projet')
                else next.set('projet', id)
                if (week === 'past') next.delete('semaine')
                if (week === 'next') next.set('semaine', 'prochaine')
                return next
              },
              { replace: id === null },
            )
          }}
          onShowWeek={(week) => {
            arm.cancel()
            setParam('semaine', week === 'next' ? 'prochaine' : null)
          }}
          reviewed={reviewed}
          validating={validate.isPending}
          loading={!projects || !activities}
          onValidate={() =>
            validate.mutate(weekKey, {
              onSuccess: () => {
                toast.success('Semaine préparée')
                leave()
              },
              onError: (err) => fail(err),
            })
          }
        />
        <div className="min-w-0 flex-1">
          <ActivityCalendar
            projectId={focusId ?? undefined}
            view={{
              weekStart: span.start,
              onWeekStartChange: (d) => {
                arm.cancel()
                setParam('semaine', d >= weeks.next.start ? 'prochaine' : null)
              },
              min: weeks.past.start,
              max: weeks.next.start,
              caption: (
                <span className="flex items-baseline gap-2.5 text-[13px] whitespace-nowrap">
                  <span className="font-medium">{WEEK_NAME[shown]}</span>
                  <span className="text-muted-foreground">
                    {fmtDayRange(span.start, span.end)}
                  </span>
                </span>
              ),
              actions: (
                <Button variant="ghost" size="sm" onClick={leave}>
                  <X className="size-4" />
                  Quitter la préparation
                </Button>
              ),
            }}
            undoStack={undo}
            outsideDays={stepDays(shown)}
            decorate={decorate}
            linkedItems={linkedItems}
            picking={
              arm.arm
                ? {
                    label: (
                      <>
                        <span className="text-[13px] leading-none">
                          {arm.arm.emoji}
                        </span>
                        {arm.arm.text}
                      </>
                    ),
                    onCancel: arm.cancel,
                    // Une séance créée pendant la liaison (double-clic,
                    // cliquer-glisser) porte d'emblée ce qu'on lie : le
                    // panneau le montre et l'enregistre à la création ; il
                    // reste à clore la liaison.
                    draftSeed: seedOf(arm.arm),
                    onCreated: () => {
                      arm.done()
                      invalidate()
                    },
                  }
                : undefined
            }
          />
        </div>
      </main>
      {gestures.checkDialog}
      <DeleteActivityDialog
        pending={gestures.deletion.pending}
        isPending={gestures.deletion.isPending}
        onConfirm={gestures.deletion.confirm}
        onCancel={gestures.deletion.cancel}
      />
    </PreparationContext.Provider>
  )
}
