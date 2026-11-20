import {
  ArrowUpRight,
  CalendarOff,
  Check,
  ChevronDown,
  Gauge,
  Hash,
  type LucideIcon,
  MoreHorizontal,
  Plus,
  Repeat,
  Sprout,
  Target,
  Trophy,
  X,
} from 'lucide-react'
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { Link } from 'react-router-dom'

import {
  type Activity,
  type ActivityActSet,
  type Draft,
  hasFeedback,
  useAddActivityAct,
  useCreateActivity,
  useLinkActivityAchievement,
  useRemoveActivityAct,
  useSetActFeedback,
  useUnlinkActivityAchievement,
  useUpdateActivity,
} from '@/entities/activity'
import type { ActivityType } from '@/entities/activity-type'
import { domainColorValues } from '@/entities/domain'
import { genericTitle } from '@/entities/plan'
import {
  useActivityMetricValues,
  useAddMetricValue,
  useDeleteMetricValue,
  useMetrics,
  useProjectsMetrics,
  useUpdateMetricValue,
} from '@/entities/metric'
import {
  currentStep as currentStepOf,
  type Project,
  principalDomainId,
} from '@/entities/project'
import { ApiError } from '@/shared/api'
import { toDateISO, toLocalISO } from '@/shared/lib/date'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmojiField,
  Input,
  Rule,
  toast,
} from '@/shared/ui'

import { type ActDraft, actSet, sameAct } from '../model/acts'
import {
  type LinkDraft,
  suggestedMetrics,
  suggestedUnits,
} from '../model/panel'
import { fitPanelTop } from '@/shared/lib/panel-position'
import {
  AchievementsSection,
  type LinkedAchievement,
} from './achievements-section'
import { DatesSection, type When } from './dates-section'
import { LearningSection } from './learning-section'
import { RemoveRatedDialog } from './pass-feedback'
import { useSessionCheck } from './session-check'
import {
  type ReadingLine,
  ResultsGroup,
  TotalsGroup,
  type ValueDraft,
} from './measures-section'
import { NotesSection } from './notes-section'
import { ProjectsSection } from './projects-section'

/** Ce que le « + » de l'en-tête peut ajouter, et la section qui le reçoit. */
type Addable = 'project' | 'learning' | 'total' | 'result' | 'achievement'

const ADDABLE: {
  key: Addable
  label: string
  icon: LucideIcon
  /** Sans domaine choisi, il n'y a rien à proposer. */
  needsDomain: boolean
}[] = [
  { key: 'project', label: 'Projet', icon: Target, needsDomain: true },
  { key: 'learning', label: 'Apprentissage', icon: Sprout, needsDomain: true },
  { key: 'total', label: 'Total', icon: Hash, needsDomain: false },
  { key: 'result', label: 'Résultat', icon: Gauge, needsDomain: true },
  {
    key: 'achievement',
    label: 'Réalisation',
    icon: Trophy,
    needsDomain: true,
  },
]

/**
 * Le panneau d'une activité (design #44 et #46, `kit/Panneau activite`) :
 * l'en-tête et Dates, toujours ; le reste — Projets, Apprentissage, Totaux,
 * Résultats, Réalisations — n'apparaît que s'il porte une valeur, ou le
 * temps de son ajout par le « + » de l'en-tête. Notes est toujours là
 * (19/11/2026, à l'essai).
 *
 * L'activité du rituel (`ritual_week_start`, #92) vit dans le domaine système,
 * que `domains` ne contient pas : ni domaine à choisir, ni sections sans
 * objet — l'en-tête (sans « + » : il n'a rien à y ajouter), Dates, « Ouvrir
 * la préparation » et Notes.
 *
 * Tout s'enregistre à la volée : un brouillon est créé dès qu'il a un titre et
 * un domaine, avec ses projets, ses valeurs et ses relevés en attente ; ses
 * actes d'apprentissage en attente s'y ajoutent juste après, un à un (#82). Les liens aux projets sont explicites : ce panneau les pose, rien
 * ne les réajuste ensuite.
 */
export function ActivityPanel({
  activity,
  draft,
  scopeDomainId,
  scopeProjectId,
  lockLinks = false,
  pos,
  domains,
  projects,
  activityTypes,
  onClose,
  onCreated,
  onMenu,
  onUnavailability,
}: {
  activity: Activity | null
  draft: Draft | null
  scopeDomainId?: string
  scopeProjectId?: string
  /** Calendrier en focus sur un projet : le domaine et les projets de
   *  l'activité ne se modifient pas — le focus les a posés. */
  lockLinks?: boolean
  pos: { top: number; left: number }
  domains: {
    id: string
    name: string
    emoji: string | null
    color?: string | null
  }[]
  projects: Project[]
  /** Pour nommer l'activité type d'une activité et suggérer son unité. */
  activityTypes?: ActivityType[]
  onClose: () => void
  onCreated?: (created: Activity) => void
  onMenu?: (e: React.MouseEvent) => void
  /** Un brouillon devient une indisponibilité aux mêmes dates : l'option en
   *  tête du choix du domaine. Absent, pas d'option. */
  onUnavailability?: (period: {
    allDay: boolean
    start: Date
    end: Date
  }) => void
}) {
  const create = useCreateActivity()
  const update = useUpdateActivity()
  const addAct = useAddActivityAct()
  const removeAct = useRemoveActivityAct()
  const setFeedback = useSetActFeedback()
  // La passe qu'on retire alors qu'elle a un retour : confirmée d'abord.
  const [dropping, setDropping] = useState<ActDraft | null>(null)
  const linkAchievement = useLinkActivityAchievement()
  const unlinkAchievement = useUnlinkActivityAchievement()
  const addReading = useAddMetricValue()
  const updateReading = useUpdateMetricValue()
  const deleteReading = useDeleteMetricValue()

  const isEdit = Boolean(activity)

  // Une activité typée prend domaine, titre et emoji de son activité type : le
  // domaine reste en lecture seule ici, il appartient au type. Ses projets,
  // eux, se corrigent à la main comme pour n'importe quelle activité.
  const activityType = activity?.activity_type_id
    ? activityTypes?.find((t) => t.id === activity.activity_type_id)
    : undefined
  const isOccurrence = Boolean(activity?.activity_type_id)
  // L'activité du rituel : son domaine (système) n'est pas parmi `domains`.
  const ritualWeek = activity?.ritual_week_start ?? null

  // La date vit ici : l'activité reçue est un instantané du calendrier, que
  // nos propres enregistrements ne rafraîchissent pas.
  const [when, setWhen] = useState<When>(() => ({
    allDay: activity?.all_day ?? draft?.allDay ?? false,
    start: activity?.start_at
      ? new Date(activity.start_at)
      : (draft?.start ?? new Date()),
    end: activity?.end_at
      ? new Date(activity.end_at)
      : (draft?.end ?? new Date()),
  }))
  const day = toDateISO(when.start)

  const scopeProject = scopeProjectId
    ? projects.find((o) => o.id === scopeProjectId)
    : undefined
  const effScopeDomainId =
    scopeDomainId ?? (scopeProject && principalDomainId(scopeProject))

  const [title, setTitle] = useState(activity?.title ?? '')
  const [domainId, setDomainId] = useState(
    activity?.domain_id ?? draft?.domainId ?? effScopeDomainId ?? '',
  )

  // Les liens de l'activité ; pour un brouillon, le projet du contexte (le
  // calendrier centré sur lui, la prépa) à son étape en cours — lui seul,
  // même sans étape. Un domaine seul ne rattache plus rien (27/10) : deviner
  // le projet prenait un projet clos qui gardait une étape ouverte.
  const [links, setLinks] = useState<LinkDraft[]>(() => {
    if (activity)
      return activity.projects.map(({ project_id, step_id }) => ({
        project_id,
        step_id,
      }))
    const scopeStep = scopeProject
      ? (currentStepOf(scopeProject, day)?.id ?? '')
      : ''
    const stepId = draft?.stepId ?? scopeStep
    const stepOwner = stepId
      ? projects.find((o) => o.steps.some((s) => s.id === stepId))?.id
      : undefined
    const projectId = stepOwner ?? scopeProjectId
    return projectId ? [{ project_id: projectId, step_id: stepId || null }] : []
  })
  const [values, setValues] = useState<ValueDraft[]>(
    activity?.values.map((v) => ({ unit_id: v.unit_id, value: v.value })) ?? [],
  )
  const [emoji, setEmoji] = useState(activity?.emoji ?? null)
  const [notes, setNotes] = useState(activity?.notes ?? '')
  // Les actes d'apprentissage (#82) : ceux de l'activité, ou en attente sur
  // un brouillon. Un acte d'un cycle apporte ses projets (côté back).
  const [acts, setActs] = useState<ActDraft[]>(
    activity?.acts ?? draft?.seed?.acts ?? [],
  )
  const [done, setDone] = useState(activity?.done ?? false)
  // Les réalisations que la séance prépare (#92) : celles de l'activité, ou en
  // attente sur un brouillon, liées juste après sa création.
  const [achievements, setAchievements] = useState<LinkedAchievement[]>(
    activity?.achievements ?? draft?.seed?.achievements ?? [],
  )
  // Relevés saisis sur un brouillon : ils partent à sa création.
  const [pendingReadings, setPendingReadings] = useState<ReadingLine[]>(() =>
    (draft?.seed?.readings ?? []).map((r) => ({ ...r, id: null })),
  )
  // La section que le « + » de l'en-tête est en train d'ajouter (#46).
  const [adding, setAdding] = useState<Addable | null>(null)
  const doneAdding = () => setAdding(null)
  // Le choix du « + » n'ouvre sa saisie qu'une fois le menu refermé : ouverte
  // pendant, le menu reprendrait le focus en se fermant (champ, recherche).
  const chosenRef = useRef<Addable | null>(null)

  const selDomain = domains.find((d) => d.id === domainId)
  const colors = domainColorValues(selDomain?.color)
  const domainEmoji = selDomain?.emoji ?? ''
  const linkedProjects = links.flatMap((l) => {
    const o = projects.find((x) => x.id === l.project_id)
    return o ? [o] : []
  })

  const { data: savedReadings } = useActivityMetricValues(activity?.id ?? null)
  const { data: domainMetrics } = useMetrics(domainId || undefined)
  const { data: results } = useProjectsMetrics(links.map((l) => l.project_id))
  const readings: ReadingLine[] = activity
    ? (savedReadings ?? []).map((r) => ({
        id: r.id,
        metric_id: r.metric_id,
        value: r.value,
      }))
    : pendingReadings

  async function chooseDomain(id: string) {
    if (id === domainId) return
    // Les actes tombent avec le domaine : le back refuse un savoir étranger
    // plutôt que de le délier en silence, on les retire donc d'abord.
    if (activity) {
      try {
        for (const act of acts)
          if (act.id)
            await removeAct.mutateAsync({ id: activity.id, actId: act.id })
        // Les réalisations aussi : elles sont celles des projets qui partent.
        for (const a of achievements)
          await unlinkAchievement.mutateAsync({
            id: activity.id,
            achievementId: a.id,
          })
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Échec')
        return
      }
    }
    setActs([])
    setAchievements([])
    setDomainId(id)
    // Nouveau domaine : aucun projet d'office (27/10) — on le rattache
    // depuis la section Projet.
    setLinks([])
    setPendingReadings([])
    persist({ domainId: id, links: [], acts: [] })
  }

  function chooseLinks(next: LinkDraft[]) {
    setLinks(next)
    persist({ links: next })
    // Une réalisation n'est liée qu'avec son projet : retirer le projet la
    // délie.
    const kept = new Set(next.map((l) => l.project_id))
    for (const a of achievements)
      if (!kept.has(a.project_id)) void dropAchievement(a)
  }

  async function chooseAchievement(a: LinkedAchievement) {
    if (achievements.some((x) => x.id === a.id)) return
    if (!activity) {
      // Brouillon : la réalisation attend la création.
      setAchievements((prev) => [...prev, a])
      return
    }
    try {
      const saved = await linkAchievement.mutateAsync({
        id: activity.id,
        achievementId: a.id,
      })
      setAchievements(saved.achievements)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Échec')
    }
  }

  async function dropAchievement(a: LinkedAchievement) {
    if (!activity) {
      setAchievements((prev) => prev.filter((x) => x.id !== a.id))
      return
    }
    try {
      const saved = await unlinkAchievement.mutateAsync({
        id: activity.id,
        achievementId: a.id,
      })
      setAchievements(saved.achievements)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Échec')
    }
  }

  /** L'activité telle que le serveur la rend après un geste sur ses actes :
   *  ses actes, et ses projets — un acte d'un cycle en apporte. */
  function takeActs(saved: Activity) {
    setActs(saved.acts)
    setLinks(
      saved.projects.map(({ project_id, step_id }) => ({
        project_id,
        step_id,
      })),
    )
  }

  async function chooseAct(act: ActivityActSet) {
    if (acts.some((a) => sameAct(a, act))) return
    if (!activity) {
      // Brouillon : l'acte attend la création, qui l'emporte s'il a un titre.
      const next = [...acts, act]
      setActs(next)
      persist({ acts: next })
      return
    }
    try {
      takeActs(await addAct.mutateAsync({ id: activity.id, act }))
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Échec')
    }
  }

  async function dropAct(act: ActDraft, confirmed = false) {
    if (hasFeedback(act) && !confirmed) {
      setDropping(act)
      return
    }
    if (!activity || !act.id) {
      setActs((prev) => prev.filter((a) => a !== act))
      return
    }
    try {
      // Retirer un acte ne retire rien d'autre : les projets restent.
      setActs(
        (await removeAct.mutateAsync({ id: activity.id, actId: act.id })).acts,
      )
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Échec')
    }
  }

  async function rateAct(
    act: ActDraft,
    level: number | null,
    feedback: string | null,
  ): Promise<boolean> {
    if (!activity || !act.id) return false
    try {
      takeActs(
        await setFeedback.mutateAsync({
          id: activity.id,
          actId: act.id,
          level,
          feedback,
        }),
      )
      return true
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Échec')
      return false
    }
  }

  function chooseValues(next: ValueDraft[]) {
    setValues(next)
    persist({ values: next })
  }

  // Auto-save : PATCH si l'activité existe, sinon POST dès qu'on a un titre et
  // un domaine (le parent bascule alors le brouillon en sélection).
  async function persist(over?: {
    title?: string
    links?: LinkDraft[]
    domainId?: string
    acts?: ActDraft[]
    values?: ValueDraft[]
    readings?: ReadingLine[]
  }) {
    const t = (over?.title ?? title).trim()
    const dId = over?.domainId ?? domainId
    const projectsBody = (over?.links ?? links).map((l) => ({
      project_id: l.project_id,
      step_id: l.step_id || null,
    }))
    const vals = over?.values ?? values
    const id = activity?.id
    try {
      if (id) {
        if (!t) return
        await update.mutateAsync({
          id,
          body: {
            title: t,
            projects: projectsBody,
            values: vals,
            ...(over?.domainId ? { domain_id: over.domainId } : {}),
          },
        })
      } else {
        if (!t || !dId) return
        const created = await create.mutateAsync({
          emoji,
          domain_id: dId,
          projects: projectsBody,
          title: t,
          all_day: when.allDay,
          done: false,
          start_at: toLocalISO(when.start),
          end_at: toLocalISO(when.end),
          values: vals,
          notes: notes.trim() || null,
        })
        for (const r of over?.readings ?? pendingReadings)
          await addReading.mutateAsync({
            metricId: r.metric_id,
            value: r.value,
            measuredAt: toDateISO(when.start),
            activityId: created.id,
          })
        // Les actes en attente s'ajoutent un à un, comme sur une activité :
        // chacun d'un cycle apporte ses projets.
        let born = created
        for (const act of over?.acts ?? acts)
          born = await addAct.mutateAsync({ id: created.id, act: actSet(act) })
        if (born !== created) takeActs(born)
        // Puis les réalisations en attente — celles d'un projet encore lié.
        const kept = new Set(born.projects.map((l) => l.project_id))
        for (const a of achievements)
          if (kept.has(a.project_id))
            born = await linkAchievement.mutateAsync({
              id: created.id,
              achievementId: a.id,
            })
        if (achievements.length) setAchievements(born.achievements)
        onCreated?.(born)
      }
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Échec de l'enregistrement",
      )
    }
  }

  async function chooseWhen(next: When) {
    const before = when
    setWhen(next)
    if (!activity) return
    try {
      // Changer de DATE déplace aussi les relevés (côté back) ; l'heure seule,
      // non.
      await update.mutateAsync({
        id: activity.id,
        body: {
          all_day: next.allDay,
          start_at: toLocalISO(next.start),
          end_at: toLocalISO(next.end),
        },
      })
    } catch (err) {
      setWhen(before)
      toast.error(err instanceof ApiError ? err.message : 'Échec')
    }
  }

  async function onAddReading(metricId: string, value: number) {
    if (!activity) {
      const next = [
        ...pendingReadings,
        { id: null, metric_id: metricId, value },
      ]
      setPendingReadings(next)
      return
    }
    try {
      await addReading.mutateAsync({
        metricId,
        value,
        measuredAt: day,
        activityId: activity.id,
      })
    } catch {
      toast.error("Le relevé n'a pas pu être ajouté")
    }
  }

  async function onUpdateReading(r: ReadingLine, value: number) {
    if (!r.id) {
      setPendingReadings((p) => p.map((x) => (x === r ? { ...x, value } : x)))
      return
    }
    try {
      await updateReading.mutateAsync({ id: r.id, value })
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Échec')
    }
  }

  function onRemoveReading(r: ReadingLine) {
    if (!r.id) {
      setPendingReadings((p) => p.filter((x) => x !== r))
      return
    }
    deleteReading.mutate({ id: r.id })
  }

  /** Les notes se sauvent seules, à la sortie du champ **et au démontage**.
   *
   *  Le démontage compte autant que le blur : le panneau se ferme sur le
   *  `pointerdown` extérieur, qui le retire de l'arbre AVANT que le champ
   *  ait perdu le focus. D'où les refs : au démontage, l'état du dernier rendu
   *  n'est plus lisible dans la closure de l'effet.
   */
  const notesRef = useRef(notes)
  notesRef.current = notes
  const titleRef = useRef(title)
  titleRef.current = title
  // La valeur du serveur, relue à chaque rendu : après un enregistrement
  // réussi elle rattrape la nôtre, et le filet ne repatche pas pour rien.
  const serverTitleRef = useRef(activity?.title ?? '')
  serverTitleRef.current = activity?.title ?? ''
  const savedNotesRef = useRef(activity?.notes ?? '')
  const activityIdRef = useRef(activity?.id)
  activityIdRef.current = activity?.id
  const updateRef = useRef(update)
  updateRef.current = update

  async function saveNotes() {
    const id = activityIdRef.current
    if (!id) return
    const next = notesRef.current.trim()
    if (next === savedNotesRef.current) return
    savedNotesRef.current = next
    try {
      await updateRef.current.mutateAsync({ id, body: { notes: next || null } })
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Échec')
    }
  }

  /** Le titre a exactement le même problème que les notes, et le même filet. */
  async function saveTitle() {
    const id = activityIdRef.current
    if (!id) return
    const next = titleRef.current.trim()
    if (!next || next === serverTitleRef.current) return
    try {
      await updateRef.current.mutateAsync({ id, body: { title: next } })
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Échec')
    }
  }

  useEffect(() => {
    return () => {
      void saveTitle()
      void saveNotes()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * L'emoji propre à l'activité — écrit tout de suite, comme la coche.
   * Éditable aussi sur une occurrence : il n'est copié qu'une fois, à la
   * création, le personnaliser tient.
   */
  async function chooseEmoji(choix: string | null) {
    // En base, « pas d'emoji » se dit `null` : le repli sur celui du domaine.
    const next = choix || null
    setEmoji(next)
    if (!activity) return
    try {
      await update.mutateAsync({ id: activity.id, body: { emoji: next } })
    } catch (err) {
      setEmoji(activity.emoji ?? null)
      toast.error(err instanceof ApiError ? err.message : 'Échec')
    }
  }

  // Cocher une séance d'apprentissage passe par sa modale (#140) : elle
  // part de ce que le panneau tient, et ses changements reviennent avec la
  // réponse.
  const sessionCheck = useSessionCheck()
  function handleToggleDone() {
    if (!activity) return
    sessionCheck.request(
      {
        ...activity,
        done,
        acts: savedActs(acts),
        projects: links,
        values,
        achievements,
        notes: notes.trim() || null,
      },
      () => applyDone(activity.id),
    )
  }

  async function applyDone(id: string) {
    const next = !done
    setDone(next) // optimiste : la case réagit sans fermer le panneau
    try {
      // La coche a pu écrire valeurs, réalisations et notes : le panneau les
      // reprend, sans quoi son prochain enregistrement les déferait.
      const saved = await update.mutateAsync({ id, body: { done: next } })
      takeActs(saved)
      setValues(
        saved.values.map((v) => ({ unit_id: v.unit_id, value: v.value })),
      )
      setAchievements(saved.achievements)
      savedNotesRef.current = saved.notes ?? ''
      setNotes(saved.notes ?? '')
    } catch (err) {
      setDone(!next)
      toast.error(err instanceof ApiError ? err.message : 'Échec')
    }
  }

  // Le haut suit la hauteur **réelle** du panneau : ancré sur l'activité, il
  // ne remonte que de ce qui dépasserait la fenêtre (une section qui s'ajoute
  // le fait remonter d'autant).
  const panelRef = useRef<HTMLDivElement>(null)
  const [top, setTop] = useState(pos.top)
  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el) return
    const fit = () => setTop(fitPanelTop(pos.top, el.scrollHeight))
    fit()
    const observer = new ResizeObserver(fit)
    for (const child of Array.from(el.children)) observer.observe(child)
    return () => observer.disconnect()
  })

  /**
   * Échap sort d'abord du champ en cours (titre, notes, une valeur : chacun
   * s'enregistre à sa sortie), puis ferme le panneau. Un menu, un sélecteur
   * ou une fenêtre ouverts se ferment seuls, d'abord ; une saisie ailleurs dans
   * la page n'est pas la sienne.
   */
  const close = useEffectEvent(onClose)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (
        document.querySelector(
          '[data-radix-popper-content-wrapper], [role="dialog"], [role="alertdialog"]',
        )
      )
        return
      const field = (e.target as HTMLElement | null)?.closest<HTMLElement>(
        'input, textarea, select, [contenteditable="true"]',
      )
      if (field) {
        if (panelRef.current?.contains(field)) field.blur()
        return
      }
      close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      ref={panelRef}
      data-activity-ui
      // La hauteur se borne à ce qui tient **sous** le panneau : le contenu qui
      // dépasse défile dedans.
      style={{
        top,
        left: pos.left,
        maxHeight: `calc(100vh - ${top}px - 12px)`,
      }}
      className="fixed z-50 flex w-80 flex-col overflow-y-auto overflow-x-hidden rounded-xl border border-border bg-background/80 p-3 shadow-xl backdrop-blur-xl"
    >
      {sessionCheck.dialog}
      {/* En-tête : domaine, fait, actions, fermer. */}
      <div className="flex items-center justify-end gap-0.5 text-muted-foreground">
        {ritualWeek ? (
          // Le domaine système ne se montre ni ne se quitte.
          <span className="mr-auto" />
        ) : isOccurrence || lockLinks ? (
          // Le domaine appartient à l'activité type, ou au focus du
          // calendrier : non éditable ici.
          <span className="mr-auto truncate px-1.5 py-1 text-sm">
            {selDomain?.name ?? 'Domaine'}
          </span>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="mr-auto flex items-center gap-1 rounded px-1.5 py-1 text-sm hover:bg-muted/60 hover:text-foreground"
              >
                <span className="truncate">{selDomain?.name ?? 'Domaine'}</span>
                <ChevronDown className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {/* Un brouillon (un clic, un glisser) peut devenir une
                  indisponibilité : ses dates sont déjà là. */}
              {!isEdit && onUnavailability && (
                <>
                  <DropdownMenuItem onSelect={() => onUnavailability(when)}>
                    <CalendarOff className="size-4 text-muted-foreground" />
                    <span className="flex-1 truncate">Indisponibilité</span>
                  </DropdownMenuItem>
                  <div aria-hidden className="-mx-1 my-1 h-px bg-border" />
                </>
              )}
              {domains.map((d) => (
                <DropdownMenuItem
                  key={d.id}
                  onSelect={() => void chooseDomain(d.id)}
                >
                  <span className="w-5 text-center">{d.emoji ?? ''}</span>
                  <span className="flex-1 truncate">{d.name}</span>
                  {d.id === domainId && (
                    <Check className="size-4 text-primary" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {/* Le « + » : une liste fixe, même quand la section existe déjà
            (un deuxième projet, une autre valeur). Le rituel n'a rien à
            y ajouter : Notes est toujours là. */}
        {!ritualWeek && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Ajouter"
                title="Ajouter"
                className="rounded p-1 hover:bg-muted/60 hover:text-foreground data-[state=open]:bg-muted/60 data-[state=open]:text-foreground"
              >
                <Plus className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-[200px]"
              // Le focus va à la saisie qui s'ouvre, pas au « + ».
              onCloseAutoFocus={(e) => {
                e.preventDefault()
                if (chosenRef.current) setAdding(chosenRef.current)
                chosenRef.current = null
              }}
            >
              {(lockLinks
                ? ADDABLE.filter((a) => a.key !== 'project')
                : ADDABLE
              ).map(({ key, label, icon: Icon, needsDomain }) => (
                <DropdownMenuItem
                  key={key}
                  disabled={needsDomain && !domainId}
                  onSelect={() => {
                    chosenRef.current = key
                  }}
                >
                  <Icon className="size-[15px] text-muted-foreground" />
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {isEdit && (
          <button
            type="button"
            onClick={handleToggleDone}
            aria-label={done ? 'Marquer non fait' : 'Marquer fait'}
            className="rounded p-1 hover:bg-muted/60 hover:text-foreground"
          >
            {done ? (
              <span className="flex size-4 items-center justify-center rounded bg-primary text-primary-foreground">
                <Check className="size-3" />
              </span>
            ) : (
              <span className="block size-4 rounded border border-muted-foreground/50" />
            )}
          </button>
        )}
        {isEdit && (
          <button
            type="button"
            aria-label="Actions"
            onClick={(e) => onMenu?.(e)}
            className="rounded p-1 hover:bg-muted/60 hover:text-foreground"
          >
            <MoreHorizontal className="size-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="rounded p-1 hover:bg-muted/60 hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Titre, précédé de l'emoji de l'activité (à défaut, celui du domaine). */}
      <div className="flex items-center gap-2 px-1 pt-0.5 pb-1.5">
        <EmojiField
          value={emoji ?? selDomain?.emoji ?? undefined}
          onChange={chooseEmoji}
          aria-label="Emoji de l'activité"
          className="size-8 shrink-0 text-base"
        />
        <Input
          autoFocus={!isEdit}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          onBlur={() => persist()}
          placeholder="Titre de l'activité"
          className="h-8 rounded-md border-transparent bg-transparent px-1.5 text-base font-medium hover:border-input focus:border-foreground/45"
        />
      </div>

      {/* L'activité type, nommée ; sa flèche mène à la page de son domaine,
          où elle se règle (design #51). */}
      {activityType && (
        <Link
          to={`/domains/${activityType.domain_id}`}
          onClick={onClose}
          className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted/60"
        >
          <Repeat className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-foreground">
            {activityType.emoji ? `${activityType.emoji} ` : ''}
            {activityType.title}
          </span>
          <ArrowUpRight className="size-3.5 shrink-0" />
        </Link>
      )}

      <Rule />
      <DatesSection when={when} onChange={chooseWhen} />
      {ritualWeek ? (
        // Le rituel n'a ni projets, ni apprentissage, ni mesures : il mène
        // à sa préparation, et garde ses notes. La semaine qu'il prépare se
        // lit d'abord : il peut se faire un autre jour que son dimanche.
        <>
          <p className="mx-2 mt-1 text-xs text-muted-foreground">
            Prépare la semaine du {ritualWeekLabel(ritualWeek)}
          </p>
          <Link
            to={`/calendar/preparation/${ritualWeek}`}
            onClick={onClose}
            className="mx-2 mt-1.5 mb-0.5 grid h-[30px] place-items-center rounded-[7px] bg-foreground text-xs font-semibold text-background"
          >
            Ouvrir la préparation
          </Link>
          <NotesSection notes={notes} onChange={setNotes} onSave={saveNotes} />
        </>
      ) : (
        <>
          {/* Chaque section suivante porte son filet : il n'y en a qu'entre
          sections visibles. */}
          <ProjectsSection
            readOnly={lockLinks}
            adding={adding === 'project'}
            onDone={doneAdding}
            links={links}
            projects={projects}
            domainId={domainId}
            domainEmoji={domainEmoji}
            color={colors.base}
            counted={{
              activity_type_id: activity?.activity_type_id ?? null,
              acts,
            }}
            day={day}
            onChange={chooseLinks}
            onNavigate={onClose}
          />
          <LearningSection
            adding={adding === 'learning'}
            onDone={doneAdding}
            domainId={domainId}
            domainLabel={{ emoji: domainEmoji, name: selDomain?.name ?? '' }}
            colors={colors}
            links={links}
            projects={projects}
            day={day}
            acts={acts}
            done={done}
            onAdd={(act) => void chooseAct(act)}
            onRemove={(act) => void dropAct(act)}
            onFeedback={rateAct}
            onNavigate={onClose}
          />
          {dropping && (
            <RemoveRatedDialog
              title={
                dropping.item_title ??
                (dropping.nature ? genericTitle(dropping.nature) : '')
              }
              level={dropping.level ?? null}
              feedback={dropping.feedback ?? null}
              pending={removeAct.isPending}
              onCancel={() => setDropping(null)}
              onConfirm={() => {
                const act = dropping
                setDropping(null)
                void dropAct(act, true)
              }}
            />
          )}
          <TotalsGroup
            adding={adding === 'total'}
            onDone={doneAdding}
            values={values}
            suggested={suggestedUnits(activityType, linkedProjects, {
              activity_type_id: activity?.activity_type_id ?? null,
              acts,
            })}
            onChange={chooseValues}
          />
          <ResultsGroup
            adding={adding === 'result'}
            onDone={doneAdding}
            readings={readings}
            targets={!done}
            metrics={domainMetrics ?? []}
            suggested={suggestedMetrics(results)}
            onAdd={onAddReading}
            onUpdate={onUpdateReading}
            onRemove={onRemoveReading}
          />
          <AchievementsSection
            adding={adding === 'achievement'}
            onDone={doneAdding}
            achievements={achievements}
            projects={linkedProjects}
            color={colors.ink}
            onAdd={(a) => void chooseAchievement(a)}
            onRemove={(a) => void dropAchievement(a)}
          />
          {/* Sur un brouillon, la note part avec sa création. */}
          <NotesSection notes={notes} onChange={setNotes} onSave={saveNotes} />
        </>
      )}
    </div>
  )
}

/** « 12 → 18 oct. » : la semaine que prépare l'activité du rituel. */
function ritualWeekLabel(weekStart: string): string {
  const monday = new Date(`${weekStart}T00:00:00`)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const fmt = (d: Date, withMonth: boolean) =>
    d.toLocaleDateString('fr-FR', {
      day: 'numeric',
      ...(withMonth ? { month: 'short' } : {}),
    })
  const sameMonth = monday.getMonth() === sunday.getMonth()
  return `${fmt(monday, !sameMonth)} → ${fmt(sunday, true)}`
}

/** Les actes enregistrés que le panneau tient (ceux d'une activité qui
 *  existe le sont tous) : ce que la coche reprend (#140). */
function savedActs(list: ActDraft[]): Activity['acts'] {
  return list.filter((a): a is Activity['acts'][number] => Boolean(a.id))
}
