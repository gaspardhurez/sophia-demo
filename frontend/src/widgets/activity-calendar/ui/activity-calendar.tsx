import {
  type CollisionDetection,
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowUpRight,
  CalendarCheck,
  CalendarOff,
  CalendarPlus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link } from 'react-router-dom'

import {
  type Activity,
  type ActivityUpdate,
  type Draft,
  actLines,
  countsFor,
  copyOf,
  isPendingRecall,
  linksOf,
  useActivities,
  useCreateActivity,
  useDeleteActivities,
  useDeleteActivity,
  useMergeActivity,
  useMoveActivities,
  useRemoveActivityAct,
  useUpdateActivity,
} from '@/entities/activity'
import {
  domainColor,
  domainColorValues,
  isDomainActive,
  useDomains,
} from '@/entities/domain'
import {
  type Ghost,
  useActivityTypes,
  usePlanningLevel,
  usePlanningPreview,
  usePreparePlanning,
} from '@/entities/activity-type'
import {
  currentStep,
  sequenceRank,
  useAllProjects,
  principalDomainId,
} from '@/entities/project'
import {
  defaultRitualSlot,
  usePlanWeekPreparationActivity,
  useWeekPreparation,
} from '@/entities/preparation'
import {
  DeleteActivitiesDialog,
  DeleteActivityDialog,
  useActivitiesDeletion,
  useActivityDeletion,
  useRestoreActivity,
} from '@/features/activity/delete'
import { ApiError } from '@/shared/api'
import {
  addDays,
  daysBetween,
  fmtHour,
  hourOf,
  sameDay,
  startOfDay,
  startOfWeek,
  toDateISO,
  toLocalISO,
} from '@/shared/lib/date'
import { unitLabel } from '@/shared/lib/units'
import { type UndoStack, useUndoStack } from '@/shared/lib/undo-stack'
import { useElementWidth } from '@/shared/lib/use-element-width'
import { ActivityPanel, useSessionCheck } from '@/features/activity/edit'
import { UnavailabilityPanel } from '@/features/unavailability/edit'
import { panelPosBeside } from '@/shared/lib/panel-position'
import { cn } from '@/shared/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  toast,
} from '@/shared/ui'

import {
  at,
  blockHeight,
  CELL_H,
  clamp,
  DAY_END,
  DAY_START,
  HOURS,
  isCompactBlock,
  isThinBlock,
  snap,
  snapDragToQuarter,
  titleLinesFor,
} from '../model/constants'
import {
  ALERT_PILL_CLASS,
  type BlockDecoration,
  type CalendarView,
  type Decorate,
  type LinkedItem,
  FOCUS_DIMMED,
  isQuiet,
  type Picking,
  pillStyle,
} from '../model/decoration'
import { NEUTRAL_BASE, NEUTRAL_CLASSES } from '../model/neutral'
import {
  HOST_REVEAL_DELAY,
  type Lane,
  layoutDay,
  type Span,
} from '../model/overlap'
import {
  clampHourShift,
  clampResize,
  resized,
  shiftSlot,
  type HourSpan,
} from '../model/group-move'
import { useCalendarDrag } from '../model/use-calendar-drag'
import { useHoverExpand } from '../model/use-hover-expand'
import { useLasso } from '../model/use-lasso'
import { useSelection } from '../model/use-selection'
import { useNow } from '../model/use-now'
import { useUnavailabilityLayer } from '../model/use-unavailability'
import { AllDayDrop, AllDayPill, DailyOverflow, DailyPill } from './all-day'
import { NowLine } from './now-line'
import { AllDayBody, CardCheck, TimedCardBody } from './card-body'
import { DayColumn } from './day-column'
import { GhostBlock, GhostPill } from './ghost'
import { HabitTile } from './habit-tile'
import { MoreBlock, type MoreItem } from './more-block'
import { MergeAsk } from './merge-ask'
import { PickFloat } from './pick-float'
import { PillHoverCard } from './pill-hover-card'
import { DomainTabs } from './domain-tabs'
import { CalendarSidebar } from './sidebar'
import { TimedBlock } from './timed-block'
import { RangeAsk } from './range-ask'
import { UnavailabilityLayer } from './unavailability-layer'

interface ActivityCalendarProps {
  domainId?: string
  /** Ne montre que les activités rattachées à une étape de ce projet. */
  projectId?: string
  /** Affiche le panneau latéral (projets + to-do du jour) — global uniquement. */
  showSidebar?: boolean
  /** Un bloc fourni par la page, sous les onglets de la colonne (Envies et
   *  Engagements, #215). */
  sidebarNote?: ReactNode
  /** Les domaines choisis dans les onglets de la colonne (ordre du choix) :
   *  la page les tient, son bloc les suit aussi. */
  domainFilter?: string[]
  onDomainFilter?: (ids: string[]) => void
  /** Mode embarqué : hauteur bornée + scroll interne (pour insertion en page). */
  embedded?: boolean
  /** Nombre de jours affichés. 7 = semaine (défaut) ; ex. 3 pour un mini-cal. */
  dayCount?: number
  /** Heures laissées au-dessus de maintenant à l'ouverture (3 par défaut). */
  scrollLead?: number
  /**
   * En-tête compact (colonne de la page projet) : le mois, les deux flèches
   * et un lien vers le calendrier — sans « Aujourd'hui ».
   */
  calendarHref?: string
  /**
   * Calendrier complet : « Préparer la semaine » ouvre la préparation de la
   * semaine affichée (#92) au lieu de poser seulement. Il se montre sur la
   * semaine en cours et sur la suivante, tant que leur préparation n'est pas
   * validée.
   */
  onPrepareWeek?: (weekStart: Date) => void
  /**
   * Vue **pilotée** (mode préparation) : la semaine appartient à l'appelant,
   * la navigation est bornée, l'en-tête prend sa légende et ses actions.
   */
  view?: CalendarView
  /** La pile d'annulation de l'écran qui compose le calendrier (⌘Z défait
   *  aussi ses gestes) ; à défaut, le calendrier tient la sienne. */
  undoStack?: UndoStack
  /** Calendrier complet : un clic sur une carte de projet de la colonne le
   *  met en focus (`null` l'en sort). */
  onFocusProject?: (projectId: string | null) => void
  /** Habillage séance par séance d'un mode piloté (estompage, mise en
   *  avant, liaison) — cf. `Decorate`. */
  decorate?: Decorate
  /** Ce qui est lié à une séance, montré dessus (mode préparation). */
  linkedItems?: (activity: Activity) => LinkedItem[]
  /** Le mode liaison en cours : la chip qui suit le curseur, l'annulation
   *  par un clic ailleurs dans le calendrier — cf. `Picking`. */
  picking?: Picking
  /** Les jours **hors de l'étape** choisie (préparation, #183) : hachurés,
   *  leur numéro estompé. */
  outsideDays?: (day: Date) => boolean
}

/** La trame d'un jour hors de l'étape (#183, `prod/Preparation de la
 *  semaine`) : des rayures à 135°, 4 px. */
const OUTSIDE_DAY =
  'bg-[repeating-linear-gradient(135deg,var(--color-muted)_0_4px,transparent_4px_8px)]'

/**
 * Ce qu'on vise, c'est **là où est la souris** — pas là où est la carte.
 *
 * Par défaut dnd-kit classe les cibles par aire d'intersection avec le
 * rectangle traîné. Une séance de cinq heures fait cinq fois la hauteur d'une
 * cellule : même le pointeur posé en plein dans la bande « jour », la carte
 * continue de recouvrir la colonne horaire sur l'essentiel de sa hauteur, et
 * la colonne l'emporte. Déposer une longue activité en « toute la journée »
 * devenait donc impossible, alors que le geste était juste.
 *
 * `pointerWithin` répond à la seule question qui compte — quelle cible est
 * sous le curseur — et la taille de ce qu'on traîne cesse de peser. Le repli
 * sur `rectIntersection` sert les cas où le pointeur ne survole aucune cible
 * (la gouttière des heures, un bord) : on garde alors le comportement d'avant
 * plutôt que d'annuler le dépôt.
 */
const collisionDetection: CollisionDetection = (args) => {
  const sousLeCurseur = pointerWithin(args)
  return sousLeCurseur.length > 0 ? sousLeCurseur : rectIntersection(args)
}

/** En deçà (px), un bord pris puis relâché est un clic. */
const RESIZE_CLICK_SLOP = 3

export function ActivityCalendar({
  domainId,
  projectId,
  showSidebar = false,
  sidebarNote,
  domainFilter = [],
  onDomainFilter,
  embedded = false,
  dayCount = 7,
  scrollLead = 3,
  calendarHref,
  onPrepareWeek,
  view,
  undoStack: sharedUndo,
  onFocusProject,
  decorate,
  linkedItems,
  picking,
  outsideDays,
}: ActivityCalendarProps) {
  // Début de vue : lundi pour une semaine, aujourd'hui pour une fenêtre courte.
  const viewStart = () =>
    dayCount === 7 ? startOfWeek(new Date()) : startOfDay(new Date())
  const [ownWeekStart, setOwnWeekStart] = useState(viewStart)
  // Vue pilotée : la semaine vient de l'appelant, et chaque déplacement —
  // flèches, clavier, bord de grille pendant un glisser — lui est demandé,
  // borné à ce qu'il permet.
  const weekStart = view?.weekStart ?? ownWeekStart
  const viewRef = useRef(view)
  const weekStartRef = useRef(weekStart)
  useEffect(() => {
    viewRef.current = view
    weekStartRef.current = weekStart
  })
  const setWeekStart: Dispatch<SetStateAction<Date>> = useCallback((next) => {
    const v = viewRef.current
    if (!v) {
      setOwnWeekStart(next)
      return
    }
    const cur = weekStartRef.current
    let d = typeof next === 'function' ? next(cur) : next
    if (d < v.min) d = v.min
    if (d > v.max) d = v.max
    if (d.getTime() !== cur.getTime()) v.onWeekStartChange(d)
  }, [])
  const weekEnd = addDays(weekStart, dayCount)
  const days = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => addDays(weekStart, i)),
    [weekStart, dayCount],
  )
  // Index d'un jour dans la vue courante (remplace weekdayIndex, générique).
  const dayIndexOf = (d: Date) => daysBetween(weekStart, d)
  const now = useNow() // heure courante (rafraîchie chaque minute)
  const today = now
  // Indicateur « maintenant » : visible seulement si aujourd'hui est dans la vue.
  const nowVisible = now >= weekStart && now < weekEnd

  const { data: domains } = useDomains()
  const { data: projects } = useAllProjects()
  const { data: activityTypes } = useActivityTypes()
  /**
   * **Une seule lecture**, élargie quand le panneau latéral en a besoin.
   *
   * Il en fallait deux : celle de la semaine affichée, et celle du cumul
   * prévisionnel depuis aujourd'hui. Du temps où lire une fenêtre écrivait
   * (génération à la lecture, avant #37), les deux se doublaient leurs
   * insertions ; lire n'écrit plus rien, mais la règle est restée : on demande
   * la plage la plus large utile, et la grille filtre ce qui la regarde.
   *
   * Rien en base n'interdit deux occurrences d'une activité type le même jour,
   * et c'est voulu — la déposer deux fois est un geste légitime.
   */
  const todayStart = startOfDay(now)
  const besoinDuCumul = showSidebar && weekEnd > todayStart
  const fetchStart =
    besoinDuCumul && todayStart < weekStart ? todayStart : weekStart
  // Focus sur un projet (`projectId`) : tout le calendrier se lit — on
  // voit le reste de la semaine, estompé et figé (cf. `decorationOf`). Seul
  // un domaine (`domainId`) filtre encore.
  const { data: fetchedActivities } = useActivities({
    domainId,
    start: toLocalISO(fetchStart),
    end: toLocalISO(weekEnd),
  })
  /** Ce que la vue montre : la fenêtre demandée, pas la plage lue. */
  const rawActivities = useMemo(
    () =>
      (fetchedActivities ?? []).filter(
        (a) =>
          !a.start_at ||
          (new Date(a.start_at) >= weekStart && new Date(a.start_at) < weekEnd),
      ),
    [fetchedActivities, weekStart, weekEnd],
  )
  // Routage (#37) : la case du jour d'une activité type **quotidienne** vit
  // dans la rangée « quotidien ». Tout le reste (avec une heure, une case
  // hebdomadaire ou manuelle, une journée posée à la main) va dans la grille
  // et sa bande « journée ».
  const isDayCase = (a: Activity) => a.daily
  const activities = useMemo(
    () => (rawActivities ?? []).filter((a) => !isDayCase(a)),
    [rawActivities],
  )
  // Les cases du jour, indexées par jour de la vue.
  const dailyByDay = useMemo(() => {
    const byDay = new Map<number, Activity[]>()
    for (const a of rawActivities ?? []) {
      if (!isDayCase(a) || !a.start_at) continue
      const idx = dayIndexOf(new Date(a.start_at))
      if (idx < 0 || idx >= dayCount) continue
      const list = byDay.get(idx) ?? []
      list.push(a)
      byDay.set(idx, list)
    }
    // Ordre stable d'un jour à l'autre, comme dans la to-do.
    for (const list of byDay.values())
      list.sort((a, b) => a.title.localeCompare(b.title, 'fr'))
    return byDay
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawActivities, weekStart, dayCount])

  // Au-delà de « posé jusqu'au », les fantômes (#37, §6) : ce que la
  // planification poserait, lu sans rien écrire. Seulement ce qui relève du
  // périmètre affiché — le projet, sinon le domaine.
  const { data: planning } = usePlanningLevel()
  const prepare = usePreparePlanning()
  const posedUntil = planning?.posed_until ?? null
  const firstDayISO = toLocalISO(weekStart).slice(0, 10)
  const lastDayISO = toLocalISO(addDays(weekStart, dayCount - 1)).slice(0, 10)
  const beyondPosed = posedUntil === null || lastDayISO > posedUntil
  // Lus depuis aujourd'hui, et non depuis la semaine affichée : le
  // prévisionnel du panneau est cumulatif, il compte aussi les semaines
  // intermédiaires pas encore posées.
  const { data: previewed } = usePlanningPreview(
    toLocalISO(todayStart).slice(0, 10),
    toLocalISO(weekEnd).slice(0, 10),
    beyondPosed,
  )
  const ghosts = useMemo(
    () =>
      (previewed ?? []).filter(
        (g) =>
          (projectId
            ? countsFor(g, projectId)
            : domainId
              ? g.domain_id === domainId
              : true) && !decorate?.({ kind: 'ghost', ghost: g })?.hidden,
      ),
    [previewed, projectId, domainId, decorate],
  )
  /** Les fantômes lus comme des activités à venir : le prévisionnel du
   *  panneau compte aussi ce qui n'est pas encore posé (#37, §6). */
  const ahead = useMemo(
    () => [
      ...(fetchedActivities ?? []),
      ...(previewed ?? []).map((g) => ({
        ...g,
        done: false,
        acts: [],
        values: [],
      })),
    ],
    [fetchedActivities, previewed],
  )
  const ghostsByDay = useMemo(() => {
    const timed = new Map<number, Ghost[]>()
    const daily = new Map<number, Ghost[]>()
    const allDay = new Map<number, Ghost[]>()
    for (const g of ghosts) {
      const idx = dayIndexOf(new Date(g.start_at))
      if (idx < 0 || idx >= dayCount) continue
      const into = g.daily ? daily : g.all_day ? allDay : timed
      into.set(idx, [...(into.get(idx) ?? []), g])
    }
    return { timed, daily, allDay }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghosts, weekStart, dayCount])
  // « Préparer la semaine » du calendrier complet (#92) : sur la semaine en
  // cours (le rituel fait en retard la prépare) et sur celle qui vient (le
  // cas normal, le dimanche) — rien au-delà ni avant —, tant que la
  // préparation de la semaine affichée n'est pas validée.
  const thisMonday = startOfWeek(now)
  const preparable =
    Boolean(onPrepareWeek) &&
    dayCount === 7 &&
    (sameDay(weekStart, thisMonday) ||
      sameDay(weekStart, addDays(thisMonday, 7)))
  const { data: shownPreparation } = useWeekPreparation(
    toDateISO(weekStart),
    preparable,
  )
  const showPrepare = preparable && shownPreparation?.state !== 'validated'
  // Le chevron : planifier un créneau pour préparer la semaine affichée, tant
  // que son rituel n'a pas d'activité (une seule par rituel).
  const planRitual = usePlanWeekPreparationActivity()
  const ritualPlanned = Boolean(shownPreparation?.activity_id)
  function planRitualSlot() {
    const { start, end } = defaultRitualSlot(weekStart, new Date())
    planRitual.mutate(
      {
        weekStart: toDateISO(weekStart),
        startAt: toLocalISO(start),
        endAt: toLocalISO(end),
      },
      {
        onSuccess: () =>
          toast.success(
            `Créneau posé ${start.toLocaleDateString('fr-FR', {
              weekday: 'short',
              day: 'numeric',
            })} à ${start.getHours()} h — déplace-le au calendrier.`,
          ),
        onError: (err) =>
          toast.error(
            err instanceof ApiError
              ? err.message
              : 'Le créneau n’a pas été posé',
          ),
      },
    )
  }
  /** « Préparer la semaine » juste après ce qui est posé ; plus loin,
   *  « Préparer jusqu'à cette semaine » — ce qui est posé n'a pas de trou. */
  const prepareLabel =
    posedUntil !== null &&
    toLocalISO(addDays(new Date(`${posedUntil}T00:00:00`), 1)).slice(0, 10) ===
      firstDayISO
      ? 'Préparer la semaine'
      : "Préparer jusqu'à cette semaine"

  // Largeur réelle d'une colonne-jour, prise sur une sonde posée dans la
  // grille (voir le rendu de la bande). On mesure, on n'estime pas : la
  // recalculer depuis la bande obligeait à rejouer la gouttière, le
  // `columnGap` et les arrondis — et un terme oublié se paie en pixels.
  const [colRef, colWidth] = useElementWidth<HTMLDivElement>()

  /**
   * Disposition d'une journée : combien de créneaux tiennent sur la ligne, et
   * quel côté fait chacun.
   *
   * Le nombre se déduit d'un côté **minimal** de 28px ; ensuite les créneaux se
   * partagent la colonne en entier, marges et gouttières déduites. La pastille
   * reste **carrée** — la largeur gagnée est reprise en hauteur, sinon les
   * emojis s'étalent dans des rectangles.
   *
   * `Infinity` tant que rien n'est mesuré : au premier rendu on montre tout
   * plutôt que d'amputer une journée sur une largeur qu'on ne connaît pas.
   */
  const dayLayout = useMemo(() => {
    // **Un côté fixe, en pixels entiers.** Il se déduisait de la largeur de
    // colonne pour que les créneaux la remplissent exactement, et valait donc
    // 22,531px : sur un écran sans densité double, un carré posé sur des
    // demi-pixels fait rééchantillonner sa bordure ET son emoji, qui se met à
    // croustiller. Le reste part maintenant à la droite de la cellule. Ce que
    // ça coûtait autrefois — une rangée qui « paraissait mal calée » — ne
    // coûte plus rien depuis que la bande dessine ses cellules : du vide à
    // droite dans une cellule bordée se lit comme une cellule peu remplie, pas
    // comme un alignement raté.
    //
    // 24px : deux rangées de gros carrés repoussaient la grille horaire, mais
    // sous 24 l'emoji (13px) mangeait tout le carré.
    const SIZE = 24
    const GAP = 4 // `gap-1` entre deux créneaux
    const PAD = 8 // `px-1` de part et d'autre de la cellule
    // La rangée fait la hauteur d'un carré plus son air : elle n'accueille
    // jamais qu'une ligne, et sa hauteur ne doit donc rien au contenu.
    const rowHeight = SIZE + 8
    if (colWidth === 0)
      return { slots: Number.POSITIVE_INFINITY, size: SIZE, rowHeight }
    const avail = colWidth - PAD
    const slots = Math.max(1, Math.floor((avail + GAP) / (SIZE + GAP)))
    return { slots, size: SIZE, rowHeight }
  }, [colWidth])

  /** `activities` + les occurrences quotidiennes : tout ce qui est déplaçable. */
  const draggableActivities = useMemo(
    () => [...activities, ...Array.from(dailyByDay.values()).flat()],
    [activities, dailyByDay],
  )

  // Domaine de scope : explicite, sinon déduit du projet filtré, sinon le
  // domaine choisi dans la bande s'il est seul (20/11) — une activité créée
  // à la main l'a pour domaine de départ ; plusieurs choisis : rien.
  const scopeDomainId =
    domainId ??
    principalDomainId(
      projects?.find((o) => o.id === projectId) ?? { domain_ids: [] },
    ) ??
    (domainFilter.length === 1 ? domainFilter[0] : undefined)
  const updateActivity = useUpdateActivity()
  const createActivity = useCreateActivity()
  // Suppression **directe**, réservée à l'annulation d'une création : la
  // séance vient de naître, elle ne porte rien, il n'y a rien à confirmer.
  // Toute autre suppression passe par `deletion.request`.
  const deleteActivity = useDeleteActivity()
  const queryClient = useQueryClient()
  const justResizedRef = useRef(false)
  // Ce que ⌘C a copié : une activité, ou toute une sélection.
  const clipboardRef = useRef<Activity[] | null>(null)
  // Pile d'annulation : chaque action réversible empile son inverse (⌘Z / Z).
  // Celle de l'écran qui compose le calendrier s'il en fournit une (la
  // préparation y empile aussi ses gestes), sinon la sienne.
  const ownUndo = useUndoStack()
  const undoStack = sharedUndo ?? ownUndo
  const restoreActivity = useRestoreActivity()
  const mergeActivity = useMergeActivity()
  const moveActivities = useMoveActivities()
  const deleteActivities = useDeleteActivities()
  const removeAct = useRemoveActivityAct()
  // Une séance lâchée sur une autre qu'elle peut rejoindre : le choix en
  // attente (fusionner, ou poser ici — le déplacement retenu).
  const [mergeAsk, setMergeAsk] = useState<{
    x: number
    y: number
    source: Activity
    target: Activity
    place: () => void
  } | null>(null)
  const [menu, setMenu] = useState<{
    x: number
    y: number
    activity: Activity | null
    slot: { day: Date; hour: number } | null
  } | null>(null)

  // Update optimiste du cache (évite le flash à l'ancienne position avant refetch).
  const patchCache = (id: string, patch: Partial<Activity>) =>
    queryClient.setQueriesData<Activity[]>(
      { queryKey: ['activities'] },
      (old) => old?.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    )

  const [selected, setSelected] = useState<Activity | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  // Les indisponibilités (#105) : sous les activités, dans toutes les grilles.
  // Un seul panneau à la fois — ouvrir l'une ferme l'autre.
  const unavailability = useUnavailabilityLayer({
    weekStart,
    dayCount,
    closeActivityPanel: () => closePanel(),
  })
  const closeUnavailability = unavailability.close
  useEffect(() => {
    if (selected || draft) closeUnavailability()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, draft])
  /** Le brouillon ouvert, lu par une annulation différée (mode liaison). */
  const draftRef = useRef<Draft | null>(null)
  useEffect(() => {
    draftRef.current = draft
  }, [draft])
  // Un brouillon qui devient activité garde son panneau (même clé) : ce qu'on
  // y avait ouvert — une section en cours d'ajout, un menu — reste en place.
  // Chaque nouveau brouillon a sa propre clé.
  const [draftSeq, setDraftSeq] = useState(0)
  const [bornId, setBornId] = useState<string | null>(null)
  // Mode liaison : l'annulation d'un clic simple attend de savoir s'il ouvre
  // un brouillon (double-clic, cliquer-glisser).
  const pickCancelRef = useRef<number | undefined>(undefined)
  const [panelPos, setPanelPos] = useState<{ top: number; left: number }>({
    top: 80,
    left: 80,
  })
  const [resize, setResize] = useState<{
    id: string
    /** Par quel bord on tire : le haut déplace le début, le bas la fin. */
    edge: 'top' | 'bottom'
    origStartH: number
    origDur: number
    startClientY: number
    /** Les séances à heure que le geste emmène — la sélection si le bloc en
     *  fait partie, sinon lui seul —, chacune à sa place de départ. */
    members: { a: Activity; span: HourSpan }[]
  } | null>(null)
  // L'écart (heures) appliqué au bord tiré de chaque membre, borné pour tous.
  const [resizeDelta, setResizeDelta] = useState(0)
  const resizeDeltaRef = useRef(0)
  /** L'aperçu d'un bloc pendant le geste, s'il en est. */
  const resizeOf = (id: string): HourSpan | null => {
    const m = resize?.members.find((x) => x.a.id === id)
    return m && resize ? resized(m.span, resize.edge, resizeDelta) : null
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  // Sélection multiple : Maj + clic, ou le lasso (Maj + glisser dans la
  // grille). Coupée pendant une liaison, où Maj + clic lie plusieurs séances.
  const selection = useSelection()
  const selectable = !picking
  const gridRef = useRef<HTMLDivElement>(null)

  // Au montage : centre la vue sur l'heure actuelle (~3 h de marge au-dessus).
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = Math.max(
      0,
      (hourOf(new Date()) - DAY_START - scrollLead) * CELL_H,
    )
    // Au montage seulement : un défilement ne se rejoue pas en cours d'usage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Pointeur live (viewport) : source fiable au scroll pour placer une tuile
  // d'activité type au bon créneau (le pointeur dérivé de dnd-kit décalait).
  const pointerRef = useRef({ x: 0, y: 0 })
  /**
   * Option enfoncée — lue au dépôt, pas au début du geste.
   *
   * `activatorEvent` fige l'état du clavier à l'instant où le drag commence :
   * appuyer sur Option en cours de route ne se verrait pas. On suit donc la
   * touche en direct, au pointeur comme au clavier — le pointeur suffit
   * pendant un drag, le clavier couvre l'appui sans mouvement.
   */
  const altRef = useRef(false)
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY }
      altRef.current = e.altKey
    }
    const onKey = (e: KeyboardEvent) => {
      altRef.current = e.altKey
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    }
  }, [])

  // Geste de drag (quoi/où + paging au bord) ; l'effet du dépôt est `onDrop`.
  const {
    activeId,
    draggingActivity,
    draggingHabitId,
    dragDelta,
    overId,
    pointerY,
    overTopRef,
    onDragStart,
    onDragMove,
    onDragEnd,
    onDragCancel,
  } = useCalendarDrag({
    activities: draggableActivities,
    scrollRef,
    setWeekStart,
    dayCount,
    onDrop,
    onDropHabit,
  })

  /**
   * Activités types de la bande d'un calendrier filtré : celles du projet
   * ou du domaine. La bande sert à ajouter une séance à la main (« une séance
   * de plus »), n'importe quel jour. Le calendrier complet les range, lui,
   * dans sa colonne (#57).
   *
   * Tri : par domaine puis par titre — la couleur code le domaine, autant que
   * les pastilles d'un même domaine se suivent.
   */
  const scopedTypes = useMemo(() => {
    let scoped = activityTypes ?? []
    if (showSidebar && !projectId) {
      // Calendrier complet, sans projet en focus (#217, 19/11) : celles des
      // domaines choisis dans la bande, dans l'ordre du choix — toutes,
      // celles des projets comprises. Rien de choisi : la bande n'est pas
      // là. En focus sur un projet, celles du projet seul (plus bas, 20/11).
      return domainFilter.flatMap((d) =>
        scoped
          .filter((t) => t.domain_id === d)
          .sort((a, b) => a.title.localeCompare(b.title, 'fr')),
      )
    }
    if (projectId) {
      // Focus : les activités types du projet ; réparties sur des étapes,
      // seulement celles allumées sur son étape en cours.
      const focus = projects?.find((o) => o.id === projectId)
      const step = focus ? currentStep(focus, toDateISO(new Date())) : null
      const off = new Set(
        (focus?.activity_types ?? [])
          .filter((l) => step && l.off_step_ids.includes(step.id))
          .map((l) => l.activity_type_id),
      )
      scoped = scoped.filter(
        (t) => t.project_ids.includes(projectId) && !off.has(t.id),
      )
    } else if (domainId) scoped = scoped.filter((t) => t.domain_id === domainId)
    // `domainById` n'est déclaré que plus bas : on relit `domains` ici.
    const nameOf = (id: string) =>
      (domains ?? []).find((d) => d.id === id)?.name ?? ''
    return [...scoped].sort(
      (a, b) =>
        nameOf(a.domain_id).localeCompare(nameOf(b.domain_id), 'fr') ||
        a.title.localeCompare(b.title, 'fr'),
    )
  }, [
    activityTypes,
    projectId,
    domainId,
    domains,
    projects,
    showSidebar,
    domainFilter,
  ])

  /**
   * Les raccourcis sont-ils actifs pour cet événement ?
   *
   * Sur `/calendar`, le calendrier EST la page : ils valent partout, sans clic
   * préalable. Embarqué dans une page de domaine ou de projet, ils ne
   * s'appliquent que si le focus est dans le calendrier — sinon `←`, `→` et `z`
   * seraient volés au reste de la page.
   */
  const rootRef = useRef<HTMLDivElement>(null)
  function shortcutsActive(e: KeyboardEvent): boolean {
    const target = e.target as HTMLElement | null
    const tag = target?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false
    // Une frappe dans le panneau d'activité, un de ses menus ou une fenêtre
    // n'est pas un raccourci du calendrier : le focus peut y être sur un
    // bouton ou une entrée de menu, et Retour arrière supprimait l'activité.
    if (
      target?.isContentEditable ||
      target?.closest(
        '[data-activity-ui], [data-radix-popper-content-wrapper], [role="menu"], [role="dialog"], [role="listbox"]',
      )
    )
      return false
    if (!embedded) return true
    const root = rootRef.current
    return !!root && root.contains(document.activeElement)
  }

  // Navigation clavier : ←/→ = semaine, t = aujourd'hui (hors saisie).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!shortcutsActive(e)) return
      if (e.key === 'Escape') selection.clear()
      else if (e.key === 'ArrowLeft') setWeekStart((w) => addDays(w, -dayCount))
      else if (e.key === 'ArrowRight') setWeekStart((w) => addDays(w, dayCount))
      else if (e.key === 't' || e.key === 'T') setWeekStart(viewStart())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded, dayCount])

  // Raccourcis : ⌘D dupliquer, ⌘C copier, ⌘V coller (même créneau), Z (ou ⌘Z)
  // annuler, Suppr/Retour arrière supprimer — la sélection, sinon l'activité
  // du panneau.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!shortcutsActive(e)) return
      const meta = e.metaKey || e.ctrlKey
      const k = e.key.toLowerCase()
      const group = targets()
      if (meta && k === 'd' && group.length > 0) {
        e.preventDefault()
        if (group.length > 1) duplicateGroup(group)
        else duplicate(group[0])
      } else if (meta && k === 'c' && group.length > 0) {
        e.preventDefault()
        copy(group)
      } else if (meta && k === 'v' && clipboardRef.current) {
        e.preventDefault()
        paste()
      } else if (k === 'z') {
        e.preventDefault()
        undo()
      } else if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        group.length > 0
      ) {
        e.preventDefault()
        if (group.length > 1) delGroup(group)
        else del(group[0])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, selection, embedded])

  // Ferme le menu contextuel au scroll (le clic à côté est géré par le backdrop).
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [menu])

  // Vide la sélection au clic ailleurs, sans Maj. Pas sur un bloc : saisir un
  // bloc sélectionné glisse le groupe, et un clic simple sur un bloc vide la
  // sélection en ouvrant son panneau (`openForActivity`).
  useEffect(() => {
    if (selection.size === 0) return
    function onDown(e: PointerEvent) {
      if (e.shiftKey) return
      const t = e.target as HTMLElement
      if (
        t.closest('[data-activity-block]') ||
        t.closest('[data-activity-ui]') ||
        t.closest('[data-radix-popper-content-wrapper]') ||
        t.closest('[role="menu"]')
      )
        return
      selection.clear()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [selection])

  // Ferme le panneau au clic en dehors (hors panneau, dropdown radix, menu).
  useEffect(() => {
    if (!selected && !draft) return
    function onDown(e: PointerEvent) {
      const t = e.target as HTMLElement
      if (
        t.closest('[data-activity-ui]') ||
        // Viser une activité n'est jamais « cliquer à côté » : c'est son propre
        // gestionnaire qui tranche (ouvrir ailleurs, ne rien faire si le
        // panneau est déjà sur elle, cocher au double-clic). Sans ça, le
        // pointerdown fermait AVANT que le clic n'arrive, et recliquer une
        // activité ouverte la refermait puis la rouvrait après le délai.
        t.closest('[data-activity-block]') ||
        t.closest('[data-radix-popper-content-wrapper]') ||
        t.closest('[role="menu"]')
      )
        return
      closePanel()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, draft])

  /**
   * Resize d'un bloc par l'un de ses deux bords : aperçu live, PATCH au relâché.
   *
   * Le bas déplace la fin, le haut le début — et une séance qu'on avance ne
   * dure pas plus longtemps pour autant : le bord opposé ne bouge pas. D'où
   * l'aperçu qui porte le couple (début, durée) et non la seule durée.
   *
   * Un bloc **sélectionné** emmène la sélection (ses séances à heure) : le
   * même écart au même bord pour toutes, borné pour qu'aucune ne casse
   * (`clampResize`) ; un seul ⌘Z les rend toutes.
   */
  useEffect(() => {
    if (!resize) return
    // Le pointeur a-t-il bougé ? C'est le geste, pas son résultat, qui dit
    // clic ou redimensionnement : un bord tiré qui ne change rien (le début
    // bloqué à un quart d'heure de la fin, un aller-retour) reste un glisser.
    let moved = false
    function onMove(e: PointerEvent) {
      if (Math.abs(e.clientY - resize!.startClientY) > RESIZE_CLICK_SLOP)
        moved = true
      const dy = (e.clientY - resize!.startClientY) / CELL_H
      // L'accroche suit le bord tiré du bloc pris ; l'écart vaut pour tous.
      const edgeH =
        resize!.edge === 'bottom'
          ? resize!.origStartH + resize!.origDur
          : resize!.origStartH
      const delta = clampResize(
        snap(edgeH + dy) - edgeH,
        resize!.edge,
        resize!.members.map((m) => m.span),
      )
      resizeDeltaRef.current = delta
      setResizeDelta(delta)
    }
    async function onUp() {
      const edge = resize!.edge
      const members = resize!.members
      // Pris par un bord sans bouger : c'est un clic, pas un redimensionnement.
      // Il remonte au bloc et ouvre le panneau — sur une séance courte, les
      // bords en couvrent presque toute la hauteur.
      if (!moved) {
        setResize(null)
        return
      }
      // Le clic que le navigateur émet au relâché est avalé là, à la capture,
      // avant qu'il n'arme l'ouverture du panneau : celle-ci attend 250 ms un
      // éventuel double-clic, et un drapeau de 250 ms retombait parfois avant
      // qu'elle ne le lise.
      const swallow = (e: MouseEvent) => {
        e.stopPropagation()
        e.preventDefault()
      }
      window.addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(
        () => window.removeEventListener('click', swallow, { capture: true }),
        100,
      )
      justResizedRef.current = true
      setTimeout(() => (justResizedRef.current = false), 400)
      setResize(null)
      // Tiré, mais rien n'a changé : pas d'écriture (ni de panneau).
      const delta = resizeDeltaRef.current
      if (delta === 0) return
      // Optimiste (via updateManyWithUndo) : la nouvelle taille entre dans le
      // cache pour éviter le flash à l'ancienne avant le refetch, et le geste
      // reste annulable. Tirer par le haut déplace les DEUX bornes, sinon la
      // séance s'allongerait en même temps qu'elle avance.
      const changes = members.map(({ a, span }) => {
        const { startH, dur } = resized(span, edge, delta)
        const start = at(new Date(a.start_at!), startH)
        const end = new Date(start.getTime() + dur * 3_600_000)
        const body: ActivityUpdate =
          edge === 'bottom'
            ? { end_at: toLocalISO(end) }
            : { start_at: toLocalISO(start), end_at: toLocalISO(end) }
        return { a, body }
      })
      try {
        await updateManyWithUndo(changes)
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Resize échoué')
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resize])

  function startResize(
    a: Activity,
    edge: 'top' | 'bottom',
    e: React.PointerEvent,
  ) {
    if (!a.start_at) return
    const spanOf = (m: Activity): HourSpan => {
      const start = new Date(m.start_at!)
      return {
        startH: hourOf(start),
        dur: m.end_at
          ? (new Date(m.end_at).getTime() - start.getTime()) / 3_600_000
          : 1,
      }
    }
    const { startH: origStartH, dur: origDur } = spanOf(a)
    // La sélection, si le bloc en fait partie : ses séances à heure.
    const group = (groupOf(a) ?? [a]).filter(
      (m) => !m.all_day && m.start_at !== null,
    )
    resizeDeltaRef.current = 0
    setResizeDelta(0)
    setResize({
      id: a.id,
      edge,
      origStartH,
      origDur,
      startClientY: e.clientY,
      members: group.map((m) => ({ a: m, span: spanOf(m) })),
    })
  }

  // Haut (viewport, live) d'une colonne-jour — fiable au scroll, contrairement
  // au rect dnd-kit. Sert au drop/aperçu d'une tuile d'activité type.
  const columnTopOf = (dayIdx: number) =>
    scrollRef.current
      ?.querySelector<HTMLElement>(`[data-daycol="${dayIdx}"]`)
      ?.getBoundingClientRect().top ?? 0

  const domainById = (id: string) => (domains ?? []).find((d) => d.id === id)
  /** L'habillage d'un mode piloté, séance par séance (aucun hors mode). */
  // Le focus : un projet, sinon les domaines choisis dans la colonne (#215,
  // 19/11 : comme un projet). Ce qui n'en est pas s'estompe — et s'estompant,
  // se fige (`isQuiet`). L'habillage d'un mode piloté s'y ajoute.
  const focusDomains =
    !projectId && domainFilter.length > 0 ? domainFilter : null
  const focusing = Boolean(projectId || focusDomains)
  const inFocus = (x: Activity | Ghost) =>
    projectId
      ? countsFor(x, projectId)
      : focusDomains
        ? focusDomains.includes(x.domain_id)
        : true
  const dimmed = (own: BlockDecoration | undefined): BlockDecoration => ({
    ...own,
    opacity: Math.min(own?.opacity ?? 1, FOCUS_DIMMED),
  })
  const decorationOf = (a: Activity): BlockDecoration | undefined => {
    const own = decorate?.({ kind: 'activity', activity: a })
    return inFocus(a) ? own : dimmed(own)
  }
  // En focus sur un projet, les fantômes des autres ne sont pas lus du tout
  // (`ghosts`) ; en focus sur des domaines, ils s'estompent comme le réel.
  const ghostDecorationOf = (g: Ghost): BlockDecoration | undefined => {
    const own = decorate?.({ kind: 'ghost', ghost: g })
    return inFocus(g) ? own : dimmed(own)
  }
  /** Le panneau est-il ouvert sur cette activité précise ? */
  const panelOpenFor = (id: string) => selected?.id === id

  const lasso = useLasso({
    gridRef,
    eligible: (id) => {
      const a = (activities ?? []).find((x) => x.id === id)
      return !!a && !isQuiet(decorationOf(a))
    },
    onEnd: selection.add,
  })
  /** Montrée sélectionnée : son panneau, son menu, la sélection, le lasso. */
  const isSelected = (id: string) =>
    selected?.id === id ||
    menu?.activity?.id === id ||
    selection.has(id) ||
    lasso.pending.has(id)
  /** Maj + clic : l'activité du panneau entre dans la sélection avec elle, et
   *  le panneau se ferme — il ne montre qu'une activité. */
  const shiftSelectOf = (a: Activity) =>
    selectable
      ? () => {
          selection.toggle(a.id, selected?.id)
          closePanel()
        }
      : undefined
  // Un domaine absent de la liste — le domaine système, qui porte l'activité
  // du rituel (#92) — se rend en neutre, jamais à la teinte par défaut.
  const classesOf = (id: string) => {
    const d = domainById(id)
    return d ? domainColor(d.color) : NEUTRAL_CLASSES
  }
  const colorOf = (id: string) => classesOf(id).soft
  /** Ratée : non faite, et son dernier jour est révolu. En préparation, le
   *  halo rouge (`alert`) la signale déjà. Elle porte la croix grise ; hors
   *  focus, elle se grise aussi (`greyedOf`). */
  const missedOf = (a: Activity) =>
    !a.done &&
    !decorationOf(a)?.alert &&
    a.start_at !== null &&
    new Date(a.end_at ?? a.start_at) < startOfDay(today)
  /** Grisée : une ratée hors focus. En focus sur un projet, ses ratées
   *  gardent leur couleur — grises, elles se perdaient parmi ce que le focus
   *  estompe (24/10). */
  const greyedOf = (a: Activity) => missedOf(a) && !focusing
  const colorSolidOf = (id: string) => classesOf(id).solid
  const emojiOf = (id: string) => domainById(id)?.emoji ?? ''
  const dotOf = (id: string) => classesOf(id).dot
  const baseOf = (id: string) => {
    const d = domainById(id)
    return d ? domainColorValues(d.color).base : NEUTRAL_BASE
  }
  const inkOf = (id: string) => classesOf(id).ink

  /** Les valeurs déclarées, en clair : « 12 km · 200 m ». Chacune dit son
   * unité ; la durée, elle, se lit déjà dans la plage. */
  const valueLabelOf = (a: Activity): string | null =>
    a.values.length === 0
      ? null
      : a.values
          .map((v) => `${v.value} ${unitLabel(v.unit, v.value)}`.trimEnd())
          .join(' · ')

  // Cocher une séance liée passe par l'écran de coche (#140, #182) : sur le
  // calendrier complet, il prend la place de la colonne de gauche (17/11) ;
  // ailleurs, une modale.
  const sessionCheck = useSessionCheck({
    column: showSidebar
      ? 'scrollbar-quiet w-80 shrink-0 overflow-y-auto border-r border-border p-4'
      : undefined,
  })
  function toggleDone(a: Activity) {
    sessionCheck.request(
      a,
      async () => {
        try {
          await updateWithUndo(a, { done: !a.done })
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : 'Échec')
        }
      },
      // En colonne : cochée à l'écran dès le geste (17/11).
      () => patchCache(a.id, { done: !a.done }),
    )
  }

  function pushUndo(fn: () => Promise<void>) {
    undoStack.push(fn)
  }
  // Applique un PATCH (optimiste) et empile l'inverse : réajuster les mêmes
  // champs à leurs valeurs précédentes.
  async function updateWithUndo(a: Activity, body: ActivityUpdate) {
    const before = Object.fromEntries(
      Object.keys(body).map((k) => [k, (a as Record<string, unknown>)[k]]),
    ) as ActivityUpdate
    patchCache(a.id, body as Partial<Activity>)
    await updateActivity.mutateAsync({ id: a.id, body })
    pushUndo(async () => {
      patchCache(a.id, before as Partial<Activity>)
      await updateActivity.mutateAsync({ id: a.id, body: before })
    })
  }
  /** Plusieurs séances changées d'un geste (un groupe redimensionné) : un
   *  seul ⌘Z les rend toutes. */
  async function updateManyWithUndo(
    changes: { a: Activity; body: ActivityUpdate }[],
  ) {
    if (changes.length === 1)
      return updateWithUndo(changes[0].a, changes[0].body)
    const befores = changes.map(({ a, body }) => ({
      a,
      before: Object.fromEntries(
        Object.keys(body).map((k) => [k, (a as Record<string, unknown>)[k]]),
      ) as ActivityUpdate,
    }))
    for (const { a, body } of changes) {
      patchCache(a.id, body as Partial<Activity>)
      knownRef.current.set(a.id, { ...a, ...(body as Partial<Activity>) })
    }
    await Promise.all(
      changes.map(({ a, body }) =>
        updateActivity.mutateAsync({ id: a.id, body }),
      ),
    )
    pushUndo(async () => {
      for (const { a, before } of befores) {
        patchCache(a.id, before as Partial<Activity>)
        knownRef.current.set(a.id, { ...a, ...(before as Partial<Activity>) })
      }
      await Promise.all(
        befores.map(({ a, before }) =>
          updateActivity.mutateAsync({ id: a.id, body: before }),
        ),
      )
    })
  }
  async function undo() {
    const fn = undoStack.pop()
    if (!fn) {
      toast('Rien à annuler')
      return
    }
    try {
      await fn()
      toast.success('Modification annulée')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Échec')
    }
  }

  /** Dupliquer à un créneau précis — le geste d'Option + glisser. */
  /** L'activité du rituel (#92) ne se duplique ni ne se copie : elle vit
   *  dans le domaine système, où le serveur refuse toute autre activité. */
  const isRitual = (a: Activity) => a.ritual_week_start !== null

  async function duplicateAt(
    a: Activity,
    slot: { all_day: boolean; start_at: string; end_at: string },
  ) {
    if (isRitual(a)) return
    try {
      const created = await createActivity.mutateAsync(copyOf(a, slot))
      if (created?.id)
        pushUndo(() => deleteActivity.mutateAsync({ id: created.id }))
      toast.success('Séance dupliquée')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Échec')
    }
  }

  async function duplicate(a: Activity, slot?: { day: Date; hour: number }) {
    if (isRitual(a)) return
    let start = a.start_at
    let end = a.end_at
    if (slot) {
      const durMs =
        a.start_at && a.end_at
          ? new Date(a.end_at).getTime() - new Date(a.start_at).getTime()
          : 30 * 60000
      const s = at(slot.day, slot.hour)
      start = toLocalISO(s)
      end = toLocalISO(new Date(s.getTime() + durMs))
    }
    try {
      const created = await createActivity.mutateAsync(
        copyOf(a, {
          all_day: slot ? false : a.all_day,
          start_at: start,
          end_at: end,
        }),
      )
      if (created?.id)
        pushUndo(() => deleteActivity.mutateAsync({ id: created.id }))
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Échec')
    }
  }
  function copy(group: Activity[]) {
    const kept = group.filter((a) => !isRitual(a))
    if (kept.length === 0) return
    clipboardRef.current = kept
    toast.success(
      kept.length > 1 ? `${kept.length} séances copiées` : 'Activité copiée',
    )
  }

  /** Dupliquer une sélection, décalée de `days` jours et `minutes` minutes
   *  (à sa place par défaut) ; le rituel ne se duplique pas. Un seul ⌘Z
   *  retire toutes les copies. */
  async function duplicateGroup(group: Activity[], days = 0, minutes = 0) {
    const kept = group.filter((a) => !isRitual(a))
    if (kept.length === 0) return
    try {
      const created = await Promise.all(
        kept.map((a) =>
          createActivity.mutateAsync(
            copyOf(a, { all_day: a.all_day, ...shiftSlot(a, days, minutes) }),
          ),
        ),
      )
      const ids = created.map((c) => c.id)
      pushUndo(async () => {
        await deleteActivities.mutateAsync({ ids })
      })
      toast.success(`${ids.length} séances dupliquées`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Échec')
    }
  }

  /**
   * Coller ce que ⌘C a copié : au même créneau (⌘V), ou à un créneau visé
   * (« Coller ici »). Une sélection s'y pose **ancrée sur sa première
   * activité** — elle prend le créneau, les autres gardent leurs écarts —,
   * bornée comme un groupe qu'on glisse (aucune ne passe minuit).
   */
  function paste(slot?: { day: Date; hour: number }) {
    const clip = clipboardRef.current
    if (!clip || clip.length === 0) return
    if (clip.length === 1) return duplicate(clip[0], slot)
    if (!slot) return duplicateGroup(clip)
    const anchor = clip.reduce((a, b) =>
      (b.start_at ?? '') < (a.start_at ?? '') ? b : a,
    )
    if (!anchor.start_at) return
    const start = new Date(anchor.start_at)
    const minutes = anchor.all_day
      ? 0
      : Math.round(clampHourShift(slot.hour - hourOf(start), clip) * 60)
    return duplicateGroup(clip, daysBetween(start, slot.day), minutes)
  }
  function openMenu(a: Activity, e: React.MouseEvent) {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, activity: a, slot: null })
  }
  function openEmptyMenu(day: Date, hour: number, e: React.MouseEvent) {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, activity: null, slot: { day, hour } })
  }
  const deletion = useActivityDeletion({
    onDeleted: (a, values) => {
      // Partie, elle ne reste pas dans la sélection.
      if (selection.has(a.id)) selection.toggle(a.id)
      // Annuler = recréer l'activité à l'identique (nouvel id), **et lui
      // rendre ses relevés**. Sans eux, l'annulation restituait une séance
      // amputée depuis que le CASCADE les emporte — un geste annoncé comme
      // réversible qui ne l'était plus qu'à moitié.
      // Tout ce que porte l'activité revient : l'intention (comme un
      // duplicata) plus son vécu — coche et notes.
      pushUndo(async () => {
        await restoreActivity(a, values)
      })
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Échec'),
  })

  async function del(a: Activity) {
    if (selected?.id === a.id) closePanel()
    await deletion.request(a)
  }

  // Une sélection : une seule question, un seul ⌘Z qui recrée chacune.
  const groupDeletion = useActivitiesDeletion({
    onDeleted: (items) => {
      selection.clear()
      pushUndo(async () => {
        for (const x of items) await restoreActivity(x.activity, x.values)
      })
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Échec'),
  })
  async function delGroup(group: Activity[]) {
    if (selected && group.some((a) => a.id === selected.id)) closePanel()
    await groupDeletion.request(group)
  }

  /**
   * Séparation des activités « toute la journée » selon leur étalement :
   *
   * - **un seul jour** → elles rejoignent le flux de leur colonne, à la suite
   *   des pastilles quotidiennes, et prennent la même forme qu'elles : un carré
   *   à l'emoji. Une pilule qui occupait toute la largeur d'une colonne pour
   *   trois lettres laissait une rangée quasi vide.
   * - **plusieurs jours** → elles restent dans la grille packée en dessous,
   *   seule façon de représenter un étalement.
   */
  const { timed, allDaySingle, allDaySpan, spanRows } = useMemo(() => {
    const t: Activity[] = []
    const single = new Map<number, Activity[]>()
    const span: {
      activity: Activity
      startDay: number
      endDay: number
      row: number
    }[] = []
    const rows: boolean[][] = []
    for (const a of activities ?? []) {
      if (!a.start_at) continue
      if (!a.all_day) {
        t.push(a)
        continue
      }
      const s = clamp(dayIndexOf(new Date(a.start_at)), 0, dayCount - 1)
      const e = clamp(
        dayIndexOf(a.end_at ? new Date(a.end_at) : new Date(a.start_at)),
        0,
        dayCount - 1,
      )
      if (s === e) {
        const list = single.get(s) ?? []
        list.push(a)
        single.set(s, list)
        continue
      }
      let r = 0
      for (;;) {
        if (!rows[r]) rows[r] = new Array(dayCount).fill(false)
        if (rows[r].slice(s, e + 1).every((x) => !x)) {
          for (let c = s; c <= e; c++) rows[r][c] = true
          break
        }
        r++
      }
      span.push({ activity: a, startDay: s, endDay: e, row: r })
    }
    return {
      timed: t,
      allDaySingle: single,
      allDaySpan: span,
      spanRows: rows.length,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activities, weekStart, dayCount])

  /**
   * La bande « jour » tient **deux rangées nommées**, toujours présentes.
   *
   * Mêlées, les occurrences quotidiennes et les activités d'un jour se
   * suivaient dans la même ligne, dans un ordre qui n'était que celui du code.
   * Ce ne sont pas des choses de même nature : les quotidiennes reviennent tous
   * les jours et cadrent la journée, les autres sont posées pour ce jour-là.
   * Deux rangées, chacune avec sa **cellule** et son **libellé en gouttière** —
   * « quotidien », « aujourd'hui » — et « ai-je tenu mes quotidiennes cette
   * semaine ? » se répond en suivant une seule ligne.
   *
   * Elles restent **montées même vides** : leur faire prendre et rendre leur
   * place selon le contenu ferait sauter les libellés d'une semaine à l'autre,
   * et une ligne nommée qui disparaît se lit comme une erreur. Le prix est nul
   * côté hauteur : chacune vaut un carré, quoi qu'elle porte.
   *
   * Les rangées suivantes ne reçoivent que les activités étalées sur plusieurs
   * jours ; elles prolongent « aujourd'hui », qui les couvre de son libellé et
   * de sa cellule.
   */
  const DAILY_ROW = 1
  const TODAY_ROW = 2
  /** Fin (exclusive) de la bande basse : « aujourd'hui » + les étalées. */
  const todayRowEnd = TODAY_ROW + 1 + spanRows

  function openForActivity(a: Activity, rect: DOMRect) {
    if (justResizedRef.current) return // clic parasite juste après un resize
    selection.clear()
    setDraft(null)
    setSelected(a)
    positionPanel(
      rect,
      dayIndexOf(new Date(a.start_at ?? toLocalISO(weekStart))),
    )
  }
  // Une séance créée pendant une liaison porte d'emblée ce qu'on lie.
  const pickSeed = picking?.onCreated ? picking.draftSeed : undefined
  function openForDraft(day: Date, hour: number, rect: DOMRect) {
    const start = at(day, hour)
    const end = at(day, hour + 0.5)
    setSelected(null)
    setDraftSeq((n) => n + 1)
    setDraft({ start, end, seed: pickSeed })
    positionPanel(rect, dayIndexOf(day))
  }
  // Création par cliquer-glisser : la plage sélectionnée devient les horaires.
  function openForRange(
    day: Date,
    startH: number,
    endH: number,
    rect: DOMRect,
  ) {
    setSelected(null)
    setDraftSeq((n) => n + 1)
    setDraft({ start: at(day, startH), end: at(day, endH), seed: pickSeed })
    positionPanel(rect, dayIndexOf(day))
  }
  function openForAllDayDraft(day: Date, rect: DOMRect) {
    const mid = at(day, 0)
    setSelected(null)
    setDraftSeq((n) => n + 1)
    setDraft({ start: mid, end: mid, allDay: true, seed: pickSeed })
    positionPanel(rect, dayIndexOf(day))
  }
  function positionPanel(rect: DOMRect, dayIdx: number) {
    // Ancre le panneau à gauche de l'activité pour les 2 derniers jours visibles.
    setPanelPos(panelPosBeside(rect, dayIdx >= dayCount - 2 ? 'left' : 'right'))
  }
  function closePanel() {
    setSelected(null)
    setDraft(null)
  }

  // Effet du dépôt (le geste est géré par useCalendarDrag) : all-day, all-day →
  // créneau horaire, ou déplacement d'un bloc horaire.
  /**
   * Index du jour si la cible est la zone « toute la journée » (`allday:N`),
   * `-1` si c'est une colonne horaire. Les pastilles quotidiennes vivent dans
   * cette même zone : son fond droppable les couvre, pas besoin d'une seconde
   * cible.
   */
  /** Index du jour visé par un dépôt dans la bande — les deux rangées valent. */
  function allDayTargetIndex(overId: string): number {
    const m = /^allday(?:-daily)?:(\d+)$/.exec(overId)
    return m ? Number(m[1]) : -1
  }

  /**
   * Une séance lâchée sur une autre qu'elle peut rejoindre : même domaine, des
   * actes d'apprentissage à apporter, rien d'autre qu'elle perdrait (cochée,
   * valeurs, notes, réalisations ; les relevés, le serveur les vérifie), ni
   * l'une ni l'autre le rituel. La séance du dessous, ou nulle.
   */
  function mergeTargetAt(a: Activity, x: number, y: number) {
    if (
      altRef.current ||
      isRitual(a) ||
      a.acts.length === 0 ||
      a.done ||
      a.values.length > 0 ||
      (a.notes ?? '').trim() ||
      a.achievements.length > 0
    )
      return null
    for (const el of document.elementsFromPoint(x, y)) {
      const id = (el as HTMLElement)
        .closest<HTMLElement>('[data-activity-id]')
        ?.getAttribute('data-activity-id')
      if (!id || id === a.id) continue
      const target = draggableActivities.find((t) => t.id === id)
      if (!target || isRitual(target) || target.domain_id !== a.domain_id)
        return null
      return target
    }
    return null
  }

  // Lâchée sur une séance qu'elle peut rejoindre : on demande (fusionner ou
  // poser ici) ; sinon, le dépôt habituel.
  function onDrop(a: Activity, e: DragEndEvent) {
    const group = groupOf(a)
    if (group) return groupDrop(a, group, e)
    const pointer = e.activatorEvent as PointerEvent
    const x = pointer.clientX + e.delta.x
    const y = pointer.clientY + e.delta.y
    const target = mergeTargetAt(a, x, y)
    if (!target) return moveDrop(a, e)
    setMergeAsk({ x, y, source: a, target, place: () => moveDrop(a, e) })
  }

  /**
   * Lâcher un groupe : tous ses membres prennent le décalage de l'activité
   * saisie, en jours et en heures. Saisie en journée entière, le groupe ne
   * bouge que par jour ; saisie à heure, il ne se lâche pas dans la bande
   * (rien ne bouge). Pas de fusion. Option enfoncée : une copie de chacun
   * (sauf le rituel). Un seul ⌘Z défait le geste entier.
   */
  async function groupDrop(a: Activity, group: Activity[], e: DragEndEvent) {
    if (!e.over || !a.start_at) return
    const overId = String(e.over.id)
    const allDayIdx = allDayTargetIndex(overId)
    if (allDayIdx >= 0 && !a.all_day) return
    const dayIdx = allDayIdx >= 0 ? allDayIdx : Number(overId)
    if (!days[dayIdx]) return
    const start = new Date(a.start_at)
    const shiftDays = daysBetween(start, days[dayIdx])
    const minutes = a.all_day
      ? 0
      : Math.round(
          clampHourShift(
            snap(hourOf(start) + e.delta.y / CELL_H) - hourOf(start),
            group,
          ) * 60,
        )
    if (shiftDays === 0 && minutes === 0) return
    try {
      if (altRef.current) {
        const copies = group.filter((m) => !isRitual(m))
        const created = await Promise.all(
          copies.map((m) =>
            createActivity.mutateAsync(
              copyOf(m, {
                all_day: m.all_day,
                ...shiftSlot(m, shiftDays, minutes),
              }),
            ),
          ),
        )
        const ids = created.map((c) => c.id)
        pushUndo(async () => {
          await deleteActivities.mutateAsync({ ids })
        })
        toast.success(`${ids.length} séances dupliquées`)
        return
      }
      const ids = group.map((m) => m.id)
      // Le cache des semaines lues, et l'état connu des membres hors vue : le
      // geste suivant part de leur nouvelle place.
      const place = (moved: boolean) => {
        for (const m of group) {
          const slot = moved
            ? shiftSlot(m, shiftDays, minutes)
            : { start_at: m.start_at, end_at: m.end_at }
          patchCache(m.id, slot)
          knownRef.current.set(m.id, { ...m, ...slot })
        }
      }
      place(true)
      try {
        await moveActivities.mutateAsync({ ids, days: shiftDays, minutes })
      } catch (err) {
        place(false)
        throw err
      }
      pushUndo(async () => {
        place(false)
        await moveActivities.mutateAsync({
          ids,
          days: -shiftDays,
          minutes: -minutes,
        })
      })
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Déplacement échoué')
    }
  }

  /** Fusionner `source` dans `target` ; ⌘Z la recrée et rend à `target` ce
   *  qu'il avait. */
  async function merge(source: Activity, target: Activity) {
    try {
      const merged = await mergeActivity.mutateAsync({
        id: target.id,
        sourceId: source.id,
      })
      const added = merged.acts.filter(
        (x) => !target.acts.some((y) => y.id === x.id),
      )
      const before = linksOf(target)
      pushUndo(async () => {
        for (const act of added)
          await removeAct.mutateAsync({ id: target.id, actId: act.id })
        await updateActivity.mutateAsync({
          id: target.id,
          body: { projects: before },
        })
        await restoreActivity(source, [])
      })
      toast.success(`Fusionnée dans « ${target.title} »`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Fusion échouée')
    }
  }

  async function moveDrop(a: Activity, e: DragEndEvent) {
    if (!e.over) return
    const overId = String(e.over.id)
    // Option enfoncée : on dépose une **copie** au créneau visé et l'originale
    // reste où elle est. Reprogrammer une séance qui a déjà eu lieu, c'est en
    // poser une seconde — pas déplacer la première.
    const dup = altRef.current && !isRitual(a)
    const place = (slot: {
      all_day: boolean
      start_at: string
      end_at: string
    }) => (dup ? duplicateAt(a, slot) : updateWithUndo(a, slot))
    try {
      const allDayIdx = allDayTargetIndex(overId)
      if (allDayIdx >= 0) {
        if (!days[allDayIdx]) return
        const mid = toLocalISO(at(days[allDayIdx], 0))
        await place({ all_day: true, start_at: mid, end_at: mid })
        return
      }
      const newDay = days[Number(overId)]
      if (a.all_day) {
        const pointer = (e.activatorEvent as PointerEvent).clientY + e.delta.y
        const hour = clamp(
          snap(DAY_START + (pointer - e.over.rect.top) / CELL_H),
          DAY_START,
          DAY_END - 1,
        )
        await place({
          all_day: false,
          start_at: toLocalISO(at(newDay, hour)),
          end_at: toLocalISO(at(newDay, hour + 1)),
        })
        return
      }
      if (!a.start_at) return
      const start = new Date(a.start_at)
      const dur = a.end_at
        ? (new Date(a.end_at).getTime() - start.getTime()) / 3_600_000
        : 1
      const newHour = clamp(
        snap(hourOf(start) + e.delta.y / CELL_H),
        DAY_START,
        DAY_END - dur,
      )
      await place({
        all_day: false,
        start_at: toLocalISO(at(newDay, newHour)),
        end_at: toLocalISO(at(newDay, newHour + dur)),
      })
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Déplacement échoué')
    }
  }

  // Drop d'une tuile d'activité type → crée une activité de ce type au créneau
  // visé, rattachée au projet du contexte.
  async function onDropHabit(habitId: string, e: DragEndEvent) {
    if (!e.over) return
    const habit = (activityTypes ?? []).find((t) => t.id === habitId)
    if (!habit) return
    const overId = String(e.over.id)
    const allDayIdx = allDayTargetIndex(overId)
    let day: Date
    let slot: { all_day: boolean; start_at: string; end_at: string }
    if (allDayIdx >= 0) {
      day = days[allDayIdx]
      if (!day) return
      const mid = toLocalISO(at(day, 0))
      slot = { all_day: true, start_at: mid, end_at: mid }
    } else {
      const dayIdx = Number(overId)
      day = days[dayIdx]
      // Cible inconnue : mieux vaut ne rien faire que POSTer une date invalide.
      if (!day) return
      const hour = clamp(
        snap(DAY_START + (pointerRef.current.y - columnTopOf(dayIdx)) / CELL_H),
        DAY_START,
        DAY_END - 1,
      )
      slot = {
        all_day: false,
        start_at: toLocalISO(at(day, hour)),
        end_at: toLocalISO(at(day, hour + 1)),
      }
    }
    // Déposer une activité type depuis la palette CRÉE toujours une occurrence,
    // même s'il en existe déjà une ce jour-là : deux séances le même jour sont
    // légitimes, et rien côté modèle ne s'y oppose.
    //
    // La palette porte la RÈGLE, la pastille porte l'OCCURRENCE. Un geste par
    // objet : déposer le type = « une séance de plus », glisser la pastille
    // = « déplace celle-ci ». Réutiliser l'occurrence existante faisait dépendre
    // le résultat d'un état que l'utilisateur ne voit pas au moment du lâcher.
    const focused = projectId
      ? projects?.find((o) => o.id === projectId)
      : undefined
    try {
      // Sur un calendrier FILTRÉ par projet, le dépôt lui appartient : on
      // envoie ce rattachement, à l'étape du projet ce jour-là (la règle
      // du panneau) — un lien envoyé est pris tel quel, sans étape il n'en
      // aurait pas. Sans lui, l'activité créée n'aurait aucun projet, et ce
      // même calendrier ne l'afficherait pas — le geste écrirait en base sans
      // rien produire à l'écran.
      //
      // Hors scope de projet, on n'envoie rien : le serveur la rattache, à sa
      // création, aux projets ouverts qui planifient l'activité type ce
      // jour-là. Ensuite, rien ne se réajuste.
      const created = await createActivity.mutateAsync({
        domain_id: habit.domain_id,
        activity_type_id: habit.id,
        projects: projectId
          ? [
              {
                project_id: projectId,
                step_id: focused
                  ? (currentStep(focused, toDateISO(day))?.id ?? null)
                  : null,
              },
            ]
          : undefined,
        title: habit.title,
        emoji: habit.emoji,
        done: false,
        ...slot,
      })
      // Seul chemin de création du calendrier qui n'empilait pas d'annulation —
      // indispensable maintenant qu'un faux mouvement duplique au lieu de
      // déplacer.
      if (created?.id)
        pushUndo(() => deleteActivity.mutateAsync({ id: created.id }))
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Création échouée')
    }
  }

  // Le dernier état lu de chaque activité sélectionnée : la sélection survit
  // au changement de semaine, et un groupe glissé vers la suivante doit encore
  // connaître ses membres restés hors vue (bornes, copies).
  const knownRef = useRef(new Map<string, Activity>())
  for (const a of draggableActivities)
    if (selection.has(a.id)) knownRef.current.set(a.id, a)
  const selectionMembers = () =>
    [...selection.ids].flatMap((id) => {
      const m = knownRef.current.get(id)
      return m ? [m] : []
    })
  /** Les membres du groupe que `a` emmène, ou `null` s'il part seul. */
  const groupOf = (a: Activity): Activity[] | null =>
    selection.has(a.id) && selection.size > 1 ? selectionMembers() : null
  /** Ce que vise un raccourci : la sélection, sinon l'activité du panneau. */
  const targets = (): Activity[] =>
    selection.size > 0 ? selectionMembers() : selected ? [selected] : []

  const activeActivity =
    draggingActivity ??
    draggableActivities.find((a) => a.id === activeId) ??
    null

  const activeGroup = activeActivity ? groupOf(activeActivity) : null
  /** Le décalage horaire du groupe en cours de glisser (0 hors groupe, ou si
   *  l'activité saisie est en journée entière : le groupe bouge par jour). */
  const groupHourShift =
    activeGroup && activeActivity?.start_at && !activeActivity.all_day
      ? (() => {
          const h = hourOf(new Date(activeActivity.start_at))
          return clampHourShift(snap(h + dragDelta) - h, activeGroup)
        })()
      : 0

  // Aperçu du drop (contour à la position exacte) façon Notion Calendar.
  const placeholder = (() => {
    if (overId === null) return null
    const dayIdx = Number(overId)
    if (Number.isNaN(dayIdx)) return null // survol de la bande all-day
    // Drag d'une tuile d'activité type : aperçu 1h au pointeur (même formule que le
    // drop → l'aperçu montre exactement le créneau visé).
    if (draggingHabitId) {
      const start = clamp(
        snap(DAY_START + (pointerRef.current.y - columnTopOf(dayIdx)) / CELL_H),
        DAY_START,
        DAY_END - 1,
      )
      return { day: dayIdx, start, dur: 1 }
    }
    if (!activeActivity) return null
    let start: number
    let dur: number
    if (activeActivity.all_day) {
      dur = 1
      start = clamp(
        snap(DAY_START + (pointerY - overTopRef.current) / CELL_H),
        DAY_START,
        DAY_END - dur,
      )
    } else if (activeActivity.start_at) {
      const s = new Date(activeActivity.start_at)
      dur = activeActivity.end_at
        ? (new Date(activeActivity.end_at).getTime() - s.getTime()) / 3_600_000
        : 1
      start = activeGroup
        ? hourOf(s) + groupHourShift
        : clamp(snap(hourOf(s) + dragDelta), DAY_START, DAY_END - dur)
    } else return null
    return { day: dayIdx, start, dur }
  })()

  /** Les contours des autres membres du groupe, au même décalage : ceux à
   *  heure qui tombent dans la vue. Saisi en journée entière, le groupe ne
   *  bouge que par jour : pas de contour horaire. */
  const groupPlaceholders = (() => {
    if (!activeGroup || !activeActivity?.start_at || activeActivity.all_day)
      return []
    if (overId === null || Number.isNaN(Number(overId))) return []
    const days = daysBetween(
      new Date(activeActivity.start_at),
      addDays(weekStart, Number(overId)),
    )
    const minutes = Math.round(groupHourShift * 60)
    return activeGroup.flatMap((m) => {
      if (m.id === activeActivity.id || m.all_day || !m.start_at) return []
      const to = shiftSlot(m, days, minutes)
      const s = new Date(to.start_at!)
      const day = dayIndexOf(s)
      if (day < 0 || day >= dayCount) return []
      const dur = to.end_at
        ? (new Date(to.end_at).getTime() - s.getTime()) / 3_600_000
        : 1
      return [{ key: m.id, day, start: hourOf(s), dur }]
    })
  })()
  /** Membre d'un groupe en cours de glisser : estompé comme le bloc saisi. */
  const isDragged = (id: string) =>
    activeId === id || (!!activeGroup && selection.has(id))

  const monthLabel = weekStart.toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  })
  const gridCols = `3.5rem repeat(${dayCount}, 1fr)`
  /** La vue 3 jours (colonne de la page projet, accueil) : ses mesures
   *  suivent prod/Projet, la semaine suit prod/Calendrier. */
  const narrow = dayCount === 3

  // Les blocs d'un jour qui se chevauchent se partagent la largeur (#55) —
  // fantômes compris. Les colonnes se calculent sur les heures enregistrées :
  // un bloc qu'on redimensionne garde la sienne jusqu'au relâcher. Un bloc
  // estompé (focus sur un projet, liaison : `isQuiet`) n'entre pas dans le
  // partage (24/10) : pleine largeur, dessous ; les autres se rangent entre
  // eux.
  const hover = useHoverExpand(activeId !== null || resize !== null)
  // Un bloc posé sur un autre s'efface quand celui qui le porte est survolé ;
  // le survol de ce dernier attend un instant (#146, 25/10).
  const behindOf = (day: number, lane: Lane | undefined) =>
    Boolean(lane?.hostKey) && hover.hovered === `${day}:${lane?.hostKey}`
  const revealDelay = (lane: Lane | undefined) =>
    lane?.host ? HOST_REVEAL_DELAY : 0
  const ghostKey = (g: Ghost, i: number) => `ghost-${i}-${g.activity_type_id}`
  const layouts = days.map((_, day) => {
    const dayTimed = timed.filter(
      (a) => dayIndexOf(new Date(a.start_at!)) === day,
    )
    const dayGhosts = ghostsByDay.timed.get(day) ?? []
    const spans: Span[] = [
      ...dayTimed.map((a) => {
        const start = hourOf(new Date(a.start_at!))
        const dur = a.end_at
          ? (new Date(a.end_at).getTime() - new Date(a.start_at!).getTime()) /
            3_600_000
          : 1
        // Sur la vraie durée : deux séances de 15 min qui se suivent ne se
        // chevauchent pas, elles s'empilent.
        return { key: a.id, start, end: start + dur }
      }),
      ...dayGhosts.map((g, i) => {
        const start = hourOf(new Date(g.start_at))
        const dur =
          (new Date(g.end_at).getTime() - new Date(g.start_at).getTime()) /
          3_600_000
        return { key: ghostKey(g, i), start, end: start + Math.max(0.25, dur) }
      }),
    ]
    const quiet = new Set([
      ...dayTimed.filter((a) => isQuiet(decorationOf(a))).map((a) => a.id),
      ...dayGhosts
        .map((g, i) => [g, ghostKey(g, i)] as const)
        .filter(([g]) => isQuiet(ghostDecorationOf(g)))
        .map(([, key]) => key),
    ])
    const layout = layoutDay(spans.filter((s) => !quiet.has(s.key)))
    for (const key of quiet)
      layout.lanes.set(key, { col: 0, cols: 1, span: 1, nested: false })
    const items = new Map<string, MoreItem>([
      ...dayTimed.map((a): [string, MoreItem] => [
        a.id,
        {
          key: a.id,
          emoji: a.emoji || emojiOf(a.domain_id),
          title: a.title,
          start: fmtHour(hourOf(new Date(a.start_at!))),
          onOpen: (rect) => openForActivity(a, rect),
        },
      ]),
      ...dayGhosts.map((g, i): [string, MoreItem] => [
        ghostKey(g, i),
        {
          key: ghostKey(g, i),
          emoji: g.emoji || emojiOf(g.domain_id),
          title: g.title,
          start: fmtHour(hourOf(new Date(g.start_at))),
        },
      ]),
    ])
    return { ...layout, quiet, items }
  })
  // Largeur mini pour éviter des colonnes écrasées en pleine semaine ; pour une
  // fenêtre courte (mini-cal), on laisse les colonnes remplir le conteneur.
  const gridMinWidth = dayCount >= 7 ? 720 : undefined

  /** Une pastille de la rangée « jour » — rendue dans la rangée, et à
   *  l'identique dans le débord : mêmes gestes des deux côtés. */
  function dailyPill(a: Activity, past: boolean, size: number) {
    // L'interro (#84) : tuile violette quel que soit le domaine ; passé son
    // jour sans passation, un liseré rouge. L'activité qui la porte reste une
    // activité : non faite sur un jour révolu, elle est ratée comme une autre.
    const overdue = isPendingRecall(a) && past
    const decoration = decorationOf(a)
    // Estompée (une autre activité que le projet ouvert), elle ne réagit pas
    // au survol.
    const quiet = isQuiet(decoration)
    // Dans un mode piloté (la préparation), le survol déplie la pastille en
    // carte, comme une séance planifiée, au lieu de l'infobulle.
    const card = Boolean(view) && !quiet
    // En préparation, une non faite garde la couleur de son domaine : le halo
    // rouge (`alert`) la signale déjà.
    const missed = past && !a.done && !decoration?.alert
    // Hors focus, la ratée se grise ; en focus, elle garde sa couleur (cf.
    // `greyedOf`).
    const greyed = missed && !focusing
    return (
      <Tooltip key={a.id} open={quiet || card ? false : undefined}>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'group/pill relative inline-flex shrink-0 rounded-md',
              decoration?.alert && ALERT_PILL_CLASS,
            )}
            data-pick={decoration?.onPick ? '' : undefined}
            style={pillStyle(decoration)}
            // Un mode qui choisit une séance (liaison) prend le clic.
            onClickCapture={
              decoration?.onPick
                ? (e) => {
                    e.stopPropagation()
                    decoration.onPick?.(e)
                  }
                : undefined
            }
          >
            <DailyPill
              activity={a}
              // Le fond ne bouge plus quand c'est fait : `DoneMark` le dit.
              color={colorOf(a.domain_id)}
              inkClassName={inkOf(a.domain_id)}
              // Une activité libre n'a pas toujours son emoji : celui du
              // domaine vaut mieux qu'une puce muette, la couleur dit déjà le
              // reste. `||` et non `??` : une chaîne vide est un emoji absent.
              emoji={a.emoji || emojiOf(a.domain_id)}
              missed={missed}
              greyed={greyed}
              overdue={overdue}
              dragging={isDragged(a.id)}
              selected={isSelected(a.id)}
              onSelect={(rect) => openForActivity(a, rect)}
              onShiftSelect={shiftSelectOf(a)}
              onToggleDone={() => toggleDone(a)}
              onContextMenu={(e) => openMenu(a, e)}
              panelOpen={panelOpenFor(a.id)}
              onClosePanel={closePanel}
              size={size}
              frozen={quiet}
            />
            {card && (
              <PillHoverCard
                activity={a}
                color={colorOf(a.domain_id)}
                inkClassName={inkOf(a.domain_id)}
                emoji={a.emoji || emojiOf(a.domain_id)}
                width={Math.max(size, colWidth - 8)}
                note={decoration?.note}
                linked={linkedItems?.(a) ?? []}
              />
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {a.title}
          {overdue && ' · en retard'}
          {decoration?.note && ` · ${decoration.note}`}
        </TooltipContent>
      </Tooltip>
    )
  }

  /** Une journée dans une rangée de flux : ce qui rentre, puis le débord. */
  function dayFlow(
    items: Activity[],
    d: Date,
    dayIdx: number,
    row: number,
    phantoms: Ghost[] = [],
  ) {
    if (items.length === 0 && phantoms.length === 0) return null
    const past = d < startOfDay(today)
    // Une seule ligne, toujours. Au-delà de ce qui rentre, le dernier carré
    // cède la place au compteur — sinon c'est lui qui déborderait, et on aurait
    // caché sans le dire. Les fantômes viennent après le réel ; en focus sur
    // un projet, ses pastilles passent d'abord (réel puis fantômes), les
    // autres après — elles ne tombent pas dans le compteur à leur place.
    const { slots, size } = dayLayout
    const mine = (x: { concerned: boolean }) => x.concerned
    const rows = [
      ...items.map((a) => ({
        key: a.id,
        concerned: focusing && inFocus(a),
        render: (sz: number) => dailyPill(a, past, sz),
      })),
      ...phantoms.map((g, i) => ({
        key: `ghost-${i}-${g.activity_type_id}`,
        concerned: focusing && inFocus(g),
        render: (sz: number) => (
          <GhostPill
            key={`ghost-${i}-${g.activity_type_id}`}
            ghost={g}
            color={colorOf(g.domain_id)}
            emoji={g.emoji || emojiOf(g.domain_id)}
            size={sz}
            decoration={ghostDecorationOf(g)}
          />
        ),
      })),
    ]
    const all = [...rows.filter(mine), ...rows.filter((x) => !mine(x))]
    const over = all.length > slots
    const shown = over ? all.slice(0, slots - 1) : all
    const rest = over ? all.slice(slots - 1) : []
    return (
      <div
        key={`flow-${row}-${d.toISOString()}`}
        className="relative z-10 flex min-w-0 items-center gap-1 px-1"
        style={{ gridColumn: `${dayIdx + 2}`, gridRow: `${row}` }}
      >
        {shown.map((x) => x.render(size))}
        {rest.length > 0 && (
          <DailyOverflow count={rest.length} size={size}>
            {/* Hors de la rangée, plus de colonne à remplir : les pastilles
                reprennent leur gabarit minimal. */}
            {rest.map((x) => x.render(28))}
          </DailyOverflow>
        )}
      </div>
    )
  }

  /** « Indisponible » (#105), sur `/calendar` et dans la préparation. */
  const unavailableButton = (
    <Button
      variant="ghost"
      size="sm"
      className="ml-auto"
      onClick={(e) =>
        unavailability.openDraft(e.currentTarget.getBoundingClientRect())
      }
    >
      <CalendarOff className="size-4" />
      Indisponible
    </Button>
  )

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      modifiers={[snapDragToQuarter]}
      autoScroll={false}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div
        ref={rootRef}
        data-calendar-root
        // `tabIndex={-1}` : la racine peut recevoir le focus sans entrer dans
        // l'ordre de tabulation. C'est ce focus qui autorise les raccourcis
        // quand le calendrier est embarqué dans une page.
        tabIndex={-1}
        // Mode liaison : une séance choisissable prend le clic ; un clic
        // ailleurs annule. Si la liaison accepte une séance créée
        // (`onCreated`), double-clic et cliquer-glisser sur le vide ouvrent le
        // brouillon comme d'habitude — un clic simple annule toujours, un
        // instant plus tard, s'il n'a pas ouvert de brouillon.
        onPointerDownCapture={
          picking && !picking.onCreated
            ? (e) => {
                if (!(e.target as HTMLElement).closest('[data-pick]'))
                  e.stopPropagation()
              }
            : undefined
        }
        onDoubleClickCapture={
          picking
            ? (e) => {
                if ((e.target as HTMLElement).closest('[data-pick]')) return
                if (picking.onCreated) {
                  clearTimeout(pickCancelRef.current)
                  return
                }
                e.stopPropagation()
              }
            : undefined
        }
        onClickCapture={
          picking
            ? (e) => {
                if ((e.target as HTMLElement).closest('[data-pick]')) return
                if (picking.onCreated) {
                  clearTimeout(pickCancelRef.current)
                  pickCancelRef.current = window.setTimeout(() => {
                    if (!draftRef.current) picking.onCancel()
                  }, 300)
                  return
                }
                e.stopPropagation()
                e.preventDefault()
                picking.onCancel()
              }
            : undefined
        }
        onPointerDown={(e) => {
          // Un clic sur une zone vide donne le focus au calendrier ; un clic
          // sur un contrôle laisse le navigateur faire son travail.
          const t = e.target as HTMLElement
          if (!t.closest('input, textarea, select, button, [tabindex]'))
            rootRef.current?.focus()
        }}
        className="relative flex h-full select-none outline-none"
      >
        {/* Un brouillon ouvert pendant la liaison : la chip se range. */}
        {mergeAsk && (
          <MergeAsk
            x={mergeAsk.x}
            y={mergeAsk.y}
            targetTitle={mergeAsk.target.title}
            onMerge={() => {
              setMergeAsk(null)
              void merge(mergeAsk.source, mergeAsk.target)
            }}
            onPlace={() => {
              setMergeAsk(null)
              mergeAsk.place()
            }}
            onCancel={() => setMergeAsk(null)}
          />
        )}
        {picking && !draft && (
          <PickFloat rootRef={rootRef}>{picking.label}</PickFloat>
        )}
        {showSidebar && sessionCheck.column}
        {showSidebar && !sessionCheck.column && (
          <CalendarSidebar
            weekStart={weekStart}
            weekEnd={weekEnd}
            projects={projects ?? []}
            emojiOf={emojiOf}
            dotOf={dotOf}
            baseOf={baseOf}
            colorKeyOf={(id) => domainById(id)?.color ?? null}
            ahead={ahead}
            note={sidebarNote}
            selectedDomains={domainFilter}
            focusedProjectId={projectId}
            onFocusProject={onFocusProject}
          />
        )}
        <div className="flex h-full flex-1 flex-col">
          {calendarHref ? (
            <div className="flex items-center gap-2 px-3 py-[9px]">
              <h2 className="font-heading text-sm font-semibold capitalize">
                {monthLabel}
              </h2>
              <div className="ml-auto flex gap-0.5">
                <button
                  type="button"
                  aria-label={`${dayCount} jours avant`}
                  onClick={() => setWeekStart((w) => addDays(w, -dayCount))}
                  className="grid size-[26px] place-items-center rounded-md hover:bg-muted"
                >
                  <ChevronLeft className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={`${dayCount} jours après`}
                  onClick={() => setWeekStart((w) => addDays(w, dayCount))}
                  className="grid size-[26px] place-items-center rounded-md hover:bg-muted"
                >
                  <ChevronRight className="size-3.5" />
                </button>
                <Link
                  to={calendarHref}
                  aria-label="Ouvrir le calendrier"
                  className="grid size-[26px] place-items-center rounded-md text-muted-foreground hover:bg-muted"
                >
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </div>
            </div>
          ) : view ? (
            // Vue pilotée (préparation) : les flèches seules, bornées, puis la
            // légende de la semaine — ni « Aujourd'hui », ni « Préparer ».
            <div className="flex items-center gap-2.5 px-4 py-3">
              <h2 className="font-heading text-lg font-semibold">
                {monthLabel}
              </h2>
              <div className="ml-2 flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label="Semaine précédente"
                  disabled={weekStart <= view.min}
                  onClick={() => setWeekStart((w) => addDays(w, -dayCount))}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label="Semaine suivante"
                  disabled={weekStart >= view.max}
                  onClick={() => setWeekStart((w) => addDays(w, dayCount))}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
              {view.caption}
              {/* La préparation aussi crée des indisponibilités (#105). */}
              {unavailableButton}
              {view.actions && (
                <div className="flex items-center gap-1">{view.actions}</div>
              )}
            </div>
          ) : (
            // Au-dessus des rangées figées de la grille (z 35, #217) : ce qui
            // se déroule de l'en-tête passe devant.
            <div className="relative z-[45] flex items-center gap-2 px-4 py-3">
              <h2 className="shrink-0 font-heading text-lg font-semibold whitespace-nowrap capitalize">
                {monthLabel}
              </h2>
              <div className="ml-2 flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => setWeekStart((w) => addDays(w, -dayCount))}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setWeekStart(viewStart())}
                >
                  Aujourd'hui
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => setWeekStart((w) => addDays(w, dayCount))}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
              {/* Les onglets de domaine (#215), à droite de la navigation :
                  ils filtrent la colonne et mettent en focus (19/11). */}
              {showSidebar && onDomainFilter && (
                <div className="ml-3 min-w-0">
                  <DomainTabs
                    domains={(domains ?? []).filter(isDomainActive)}
                    selected={domainFilter}
                    onChange={onDomainFilter}
                  />
                </div>
              )}
              {/* Indisponibilité (#105) : la seule entrée de création. */}
              {unavailableButton}
              {onPrepareWeek
                ? // La préparation de la semaine (#92) : un mode du calendrier,
                  // qui pose la semaine en y entrant (cf. `showPrepare`).
                  showPrepare && (
                    <div className="flex">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-r-none"
                        onClick={() => onPrepareWeek(weekStart)}
                      >
                        <CalendarCheck className="size-4" />
                        Préparer la semaine
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            aria-label="Plus d'options"
                            className="rounded-l-none border-l-0 px-1.5"
                          >
                            <ChevronDown className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            disabled={ritualPlanned || planRitual.isPending}
                            onSelect={planRitualSlot}
                          >
                            <CalendarPlus className="size-4" />
                            {ritualPlanned
                              ? 'Un créneau est déjà posé'
                              : 'Planifier un créneau'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )
                : beyondPosed && (
                    <Button
                      variant="outline"
                      size="sm"
                      isPending={prepare.isPending}
                      onClick={() =>
                        prepare.mutate(lastDayISO, {
                          onError: (err) =>
                            toast.error(
                              err instanceof ApiError
                                ? err.message
                                : 'La préparation a échoué',
                            ),
                        })
                      }
                    >
                      <CalendarCheck className="size-4" />
                      {prepareLabel}
                    </Button>
                  )}
            </div>
          )}

          {/* Les activités types en tête de grille, sans sélecteur (#57) :
              filtré sur un projet ou un domaine, celles du périmètre ; sur
              le calendrier complet, celles des domaines choisis ou du
              projet en focus (#217, revenues ici de la colonne le 19/11). */}
          {(showSidebar || projectId || domainId) &&
            scopedTypes.length > 0 &&
            dayCount > 3 && (
              <div className="flex items-center gap-2 border-b border-border px-4 pb-2">
                <span className="shrink-0 text-xs text-muted-foreground">
                  Activités types
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {scopedTypes.map((t) => (
                    <HabitTile
                      key={t.id}
                      id={t.id}
                      emoji={t.emoji}
                      color={domainById(t.domain_id)?.color ?? null}
                      title={t.title}
                    />
                  ))}
                </div>
              </div>
            )}

          <div
            ref={scrollRef}
            className={cn(
              'flex-1 overflow-auto',
              // La colonne de la page projet : un trait sous la ligne du
              // mois, et pas de barre de défilement (prod/Projet).
              narrow &&
                'border-t border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            )}
          >
            {/* En-tête jours + bande « toute la journée » figés en haut —
                au-dessus d'un bloc survolé (z 30) : sans quoi le bloc déplié
                passe devant la barre et garde le survol quand on y monte. */}
            <div
              className={cn(
                'sticky top-0 z-[35]',
                narrow ? 'bg-card' : 'bg-background',
              )}
            >
              <div
                className={cn(
                  'grid border-b border-border',
                  narrow ? 'bg-card' : 'bg-background',
                )}
                style={{
                  gridTemplateColumns: gridCols,
                  minWidth: gridMinWidth,
                }}
              >
                <div className="border-r border-border" />
                {days.map((d) => {
                  const isToday = sameDay(d, today)
                  const outside = outsideDays?.(d) ?? false
                  return (
                    <div
                      key={d.toISOString()}
                      className={cn(
                        'border-r border-border text-center',
                        narrow ? 'py-1.5 text-[13px]' : 'py-2 text-sm',
                        isToday && 'bg-primary/5',
                        outside && [OUTSIDE_DAY, '[&>*]:opacity-45'],
                      )}
                    >
                      <span className="text-muted-foreground">
                        {d.toLocaleDateString('fr-FR', {
                          weekday: 'short',
                        })}{' '}
                      </span>
                      {isToday ? (
                        <span className="ml-0.5 inline-flex size-5 items-center justify-center rounded bg-red-500 text-xs font-semibold text-white">
                          {d.getDate()}
                        </span>
                      ) : (
                        <span className="font-medium">{d.getDate()}</span>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Zone « toute la journée » — toujours visible (double-clic = créer) */}
              <div
                className="relative border-b border-border"
                style={{ minWidth: gridMinWidth }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: gridCols,
                    // Les deux rangées nommées, au gabarit d'un carré : elles
                    // n'accueillent jamais qu'une ligne (cf. `DailyOverflow`),
                    // donc leur hauteur ne doit rien au contenu. Les rangées
                    // suivantes ne portent que les activités étalées.
                    gridTemplateRows: `${dayLayout.rowHeight}px ${dayLayout.rowHeight}px`,
                    gridAutoRows: '1.75rem',
                    // Ni `columnGap` ni `rowGap` : les cellules dessinent la
                    // grille et doivent se toucher, sinon leurs bordures
                    // laissent un jour. L'air entre journées vient du `px-1`
                    // de la cellule et du `mx-1` des pilules étalées.
                  }}
                  onDoubleClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    const x = e.clientX - rect.left - 56
                    if (x < 0) return
                    const dayIdx = clamp(
                      Math.floor(x / ((rect.width - 56) / dayCount)),
                      0,
                      dayCount - 1,
                    )
                    openForAllDayDraft(days[dayIdx], {
                      top: e.clientY,
                      left: e.clientX,
                      right: e.clientX,
                    } as DOMRect)
                  }}
                >
                  {/* Les libellés en gouttière — c'est eux qui font de la
                      bande deux lignes de lecture et non deux paquets de
                      carrés. « aujourd'hui » couvre aussi les étalées : une
                      activité sur trois jours reste posée pour ces jours-là,
                      elle n'est simplement pas quotidienne. */}
                  <div
                    className="flex items-center justify-end truncate pr-1 text-[9px] text-muted-foreground"
                    style={{ gridColumn: '1', gridRow: `${DAILY_ROW}` }}
                  >
                    quotidien
                  </div>
                  <div
                    className="flex items-center justify-end truncate pr-1 text-[9px] text-muted-foreground"
                    style={{
                      gridColumn: '1',
                      gridRow: `${TODAY_ROW} / ${todayRowEnd}`,
                    }}
                  >
                    aujourd'hui
                  </div>
                  {/* Les cellules, sous les pastilles : mêmes bordures que la
                      grille horaire, et cibles de dépôt. */}
                  {days.map((d, day) => (
                    <AllDayDrop
                      key={`drop-daily-${d.toISOString()}`}
                      day={day}
                      band="daily"
                      row={`${DAILY_ROW}`}
                    />
                  ))}
                  {days.map((d, day) => (
                    <AllDayDrop
                      key={`drop-today-${d.toISOString()}`}
                      day={day}
                      band="today"
                      row={`${TODAY_ROW} / ${todayRowEnd}`}
                    />
                  ))}
                  {/* Sonde : une colonne-jour de hauteur nulle, toujours
                      rendue. Elle donne la largeur exacte d'une colonne — ce
                      que la bande, elle, ne dit qu'au prix d'un calcul qui
                      doit rejouer la gouttière de gauche et le `columnGap`. */}
                  <div
                    ref={colRef}
                    aria-hidden
                    className="pointer-events-none"
                    style={{ gridColumn: '2', gridRow: '1', height: 0 }}
                  />
                  {/* Une seule forme dans les deux rangées : le carré à
                      l'emoji, quelle que soit la nature de l'activité. Une
                      pilule à titre pour l'une et une pastille pour l'autre
                      donnaient deux poids visuels à des choses de même rang.
                      C'est la rangée qui distingue, maintenant, pas le dessin. */}
                  {days.map((d, dayIdx) =>
                    dayFlow(
                      dailyByDay.get(dayIdx) ?? [],
                      d,
                      dayIdx,
                      DAILY_ROW,
                      ghostsByDay.daily.get(dayIdx),
                    ),
                  )}
                  {days.map((d, dayIdx) =>
                    dayFlow(
                      allDaySingle.get(dayIdx) ?? [],
                      d,
                      dayIdx,
                      TODAY_ROW,
                      ghostsByDay.allDay.get(dayIdx),
                    ),
                  )}

                  {/* Étalées sur plusieurs jours : seule la grille packée sait
                      les représenter. */}
                  {allDaySpan.map(({ activity: a, startDay, endDay, row }) => (
                    <AllDayPill
                      key={a.id}
                      activity={a}
                      missed={missedOf(a)}
                      frozen={isQuiet(decorationOf(a))}
                      color={colorOf(a.domain_id)}
                      colorSolid={colorSolidOf(a.domain_id)}
                      inkClassName={inkOf(a.domain_id)}
                      panelOpen={panelOpenFor(a.id)}
                      onClosePanel={closePanel}
                      emoji={a.emoji || emojiOf(a.domain_id)}
                      dragging={isDragged(a.id)}
                      selected={isSelected(a.id)}
                      onSelect={(rect) => openForActivity(a, rect)}
                      onShiftSelect={shiftSelectOf(a)}
                      onToggleDone={() => toggleDone(a)}
                      onContextMenu={(e) => openMenu(a, e)}
                      stretch
                      style={{
                        ...pillStyle(decorationOf(a)),
                        // Étalée sur la largeur : elle ne grossit pas.
                        transform: undefined,
                        gridColumn: `${startDay + 2} / ${endDay + 3}`,
                        gridRow: `${row + TODAY_ROW + 1}`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div
              ref={gridRef}
              className="relative grid"
              style={{ gridTemplateColumns: gridCols, minWidth: gridMinWidth }}
            >
              {lasso.box && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute z-40 rounded-sm border border-primary/50 bg-primary/5"
                  style={{
                    left: lasso.box.left,
                    top: lasso.box.top,
                    width: lasso.box.right - lasso.box.left,
                    height: lasso.box.bottom - lasso.box.top,
                  }}
                />
              )}
              {nowVisible && (
                <NowLine
                  hour={hourOf(now)}
                  dayIndex={dayIndexOf(now)}
                  dayCount={dayCount}
                />
              )}
              <div>
                {HOURS.map((h) => (
                  <div
                    key={h}
                    style={{ height: CELL_H }}
                    className="relative border-r border-border pr-1 text-right text-[10px] text-muted-foreground"
                  >
                    <span className="absolute -top-1.5 right-1">{h}h</span>
                  </div>
                ))}
              </div>

              {days.map((d, day) => (
                <DayColumn
                  key={d.toISOString()}
                  day={day}
                  dayDate={d}
                  onCreate={openForDraft}
                  // Un glisser dans une indisponibilité demande ce qu'on pose :
                  // un créneau bloqué, ou une activité (#105).
                  onDragCreate={(date, lo, hi, rect) => {
                    const u = unavailability.hit(day, lo)
                    if (!u) return openForRange(date, lo, hi, rect)
                    unavailability.setAsk({
                      x: (rect.left + rect.right) / 2,
                      y: rect.top,
                      unavailability: u,
                      day: date,
                      startH: lo,
                      endH: hi,
                      rect,
                    })
                  }}
                  onEmptyContext={openEmptyMenu}
                  onLassoStart={selectable ? lasso.start : undefined}
                  onTap={(_, hour, rect) => {
                    const u = unavailability.hit(day, hour)
                    if (u) unavailability.openExisting(u, rect, day)
                  }}
                  onHoverHour={(hour) =>
                    unavailability.setHovered(
                      hour === null
                        ? null
                        : (unavailability.hit(day, hour)?.id ?? null),
                    )
                  }
                >
                  {outsideDays?.(d) && (
                    <div
                      aria-hidden
                      className={cn(
                        'pointer-events-none absolute inset-0',
                        OUTSIDE_DAY,
                      )}
                    />
                  )}
                  <UnavailabilityLayer
                    day={d}
                    items={unavailability.byDay[day] ?? []}
                    onResizeStart={(u, edge, e) =>
                      unavailability.startResize(u, edge, day, e)
                    }
                    popoverFor={
                      unavailability.popoverDay === day
                        ? unavailability.hovered
                        : null
                    }
                  />
                  {(ghostsByDay.timed.get(day) ?? []).map((g, i) => {
                    const key = ghostKey(g, i)
                    const lane = layouts[day].lanes.get(key)
                    if (!lane) return null
                    return (
                      <GhostBlock
                        key={key}
                        ghost={g}
                        color={colorOf(g.domain_id)}
                        emoji={g.emoji || emojiOf(g.domain_id)}
                        lane={lane}
                        expanded={hover.hovered === `${day}:${key}`}
                        behind={behindOf(day, lane)}
                        onHoverEnter={() =>
                          !isQuiet(ghostDecorationOf(g)) &&
                          hover.enter(`${day}:${key}`, revealDelay(lane))
                        }
                        onHoverLeave={hover.leave}
                        decoration={ghostDecorationOf(g)}
                      />
                    )
                  })}
                  {layouts[day].more.map((box) => (
                    <MoreBlock
                      key={box.key}
                      box={box}
                      items={box.keys.map((k) => layouts[day].items.get(k)!)}
                      inset={narrow ? 3 : 4}
                      open={hover.hovered === `${day}:${box.key}`}
                      onEnter={() => hover.enter(`${day}:${box.key}`)}
                      onLeave={hover.leave}
                    />
                  ))}
                  {timed
                    .filter(
                      (a) =>
                        dayIndexOf(new Date(a.start_at!)) === day &&
                        layouts[day].lanes.has(a.id),
                    )
                    // Les estompées d'abord : les autres se peignent dessus.
                    .sort(
                      (x, y) =>
                        Number(layouts[day].quiet.has(y.id)) -
                        Number(layouts[day].quiet.has(x.id)),
                    )
                    .map((a) => (
                      <TimedBlock
                        key={a.id}
                        activity={a}
                        missed={missedOf(a)}
                        greyed={greyedOf(a)}
                        narrow={narrow}
                        lane={layouts[day].lanes.get(a.id)}
                        expanded={hover.hovered === `${day}:${a.id}`}
                        behind={behindOf(day, layouts[day].lanes.get(a.id))}
                        onHoverEnter={() =>
                          !isQuiet(decorationOf(a)) &&
                          hover.enter(
                            `${day}:${a.id}`,
                            revealDelay(layouts[day].lanes.get(a.id)),
                          )
                        }
                        onHoverLeave={hover.leave}
                        dragging={isDragged(a.id)}
                        selected={isSelected(a.id)}
                        color={colorOf(a.domain_id)}
                        colorSolid={colorSolidOf(a.domain_id)}
                        inkClassName={inkOf(a.domain_id)}
                        panelOpen={panelOpenFor(a.id)}
                        onClosePanel={closePanel}
                        emoji={a.emoji || emojiOf(a.domain_id)}
                        valueLabel={valueLabelOf(a)}
                        resizeDur={resizeOf(a.id)?.dur}
                        resizeStartH={resizeOf(a.id)?.startH}
                        onSelect={(rect) => openForActivity(a, rect)}
                        onShiftSelect={shiftSelectOf(a)}
                        onToggleDone={() => toggleDone(a)}
                        onContextMenu={(e) => openMenu(a, e)}
                        onResizeStart={(edge, e) => startResize(a, edge, e)}
                        decoration={decorationOf(a)}
                        linked={
                          linkedItems?.(a) ??
                          actLines(
                            a.acts,
                            emojiOf(a.domain_id),
                            sequenceRank(
                              projects,
                              a.projects.map((o) => o.project_id),
                            ),
                          )
                        }
                      />
                    ))}
                  {groupPlaceholders
                    .filter((g) => g.day === day)
                    .map((g) => (
                      <div
                        key={g.key}
                        className="pointer-events-none absolute inset-x-1 z-[2] overflow-hidden rounded-md border-2 border-primary/50 bg-primary/5 px-2 py-1 text-xs font-medium text-primary"
                        style={{
                          top: (g.start - DAY_START) * CELL_H + 1,
                          height: g.dur * CELL_H - 2,
                        }}
                      >
                        {fmtHour(g.start)}–{fmtHour(g.start + g.dur)}
                      </div>
                    ))}
                  {placeholder?.day === day && (
                    // Au-dessus du voile des indisponibilités (z-1), sous les activités.
                    <div
                      className="pointer-events-none absolute inset-x-1 z-[2] overflow-hidden rounded-md border-2 border-primary/50 bg-primary/5 px-2 py-1 text-xs font-medium text-primary"
                      style={{
                        top: (placeholder.start - DAY_START) * CELL_H + 1,
                        height: placeholder.dur * CELL_H - 2,
                      }}
                    >
                      {fmtHour(placeholder.start)}–
                      {fmtHour(placeholder.start + placeholder.dur)}
                    </div>
                  )}
                </DayColumn>
              ))}
            </div>
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {draggingHabitId &&
          (() => {
            const h = (activityTypes ?? []).find(
              (x) => x.id === draggingHabitId,
            )
            if (!h) return null
            return (
              <div
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-lg border pr-2.5 pl-2 text-[13px] font-medium whitespace-nowrap shadow-lg',
                  domainColor(domainById(h.domain_id)?.color).soft,
                )}
              >
                <span className="text-[15px] leading-none">{h.emoji}</span>
                {h.title}
              </div>
            )
          })()}
        {activeActivity && activeActivity.all_day && (
          <div
            className={cn(
              'flex w-40 items-center gap-1.5 overflow-hidden rounded-md border px-2 py-0.5 text-xs shadow-lg ring-2 ring-primary/40',
              colorSolidOf(activeActivity.domain_id),
            )}
          >
            <AllDayBody
              done={activeActivity.done}
              emoji={activeActivity.emoji || emojiOf(activeActivity.domain_id)}
              title={activeActivity.title}
              check={
                <CardCheck
                  done={activeActivity.done}
                  inkClassName={inkOf(activeActivity.domain_id)}
                />
              }
            />
          </div>
        )}
        {activeActivity &&
          !activeActivity.all_day &&
          activeActivity.start_at &&
          (() => {
            const s = new Date(activeActivity.start_at)
            const dur = activeActivity.end_at
              ? (new Date(activeActivity.end_at).getTime() - s.getTime()) /
                3_600_000
              : 1
            const startH = activeGroup
              ? hourOf(s) + groupHourShift
              : clamp(hourOf(s) + dragDelta, DAY_START, DAY_END)
            // Même gabarit que le bloc réel : l'overlay doit lui ressembler.
            const compact = isCompactBlock(dur)
            const thin = isThinBlock(dur)
            return (
              <div
                className={cn(
                  'relative w-40 select-none overflow-hidden border text-xs shadow-lg ring-2 ring-primary/40',
                  thin
                    ? 'rounded-[4px] px-[6px] py-0'
                    : cn('rounded-md px-2', compact ? 'py-0.5' : 'py-1'),
                  colorSolidOf(activeActivity.domain_id),
                )}
                style={{ height: thin ? blockHeight(dur) : dur * CELL_H - 4 }}
              >
                <TimedCardBody
                  done={activeActivity.done}
                  emoji={
                    activeActivity.emoji || emojiOf(activeActivity.domain_id)
                  }
                  title={activeActivity.title}
                  startH={startH}
                  endH={startH + dur}
                  valueLabel={valueLabelOf(activeActivity)}
                  compact={compact}
                  thin={thin}
                  titleLines={titleLinesFor(dur)}
                  check={
                    <CardCheck
                      done={activeActivity.done}
                      inkClassName={inkOf(activeActivity.domain_id)}
                      thin={thin}
                    />
                  }
                />
              </div>
            )
          })()}
      </DragOverlay>

      {sessionCheck.dialog}
      {(selected || draft) && (
        <ActivityPanel
          /* Remonté à chaque changement d'activité : le panneau initialise une
             douzaine d'états depuis `activity` au montage (titre, projet,
             étape, valeur, notes…) et ne les relit jamais. Il s'en tirait parce
             que cliquer une autre activité le FERMAIT d'abord — le pointerdown
             global s'en chargeait — et qu'il se remontait en se rouvrant.
             Depuis qu'un clic sur un bloc ne ferme plus rien, ce remontage
             implicite a disparu, et le panneau gardait les valeurs du
             précédent. La clé le rend explicite — sauf pour le brouillon
             qui vient d'être créé : c'est le même panneau. */
          key={
            selected && selected.id !== bornId
              ? selected.id
              : `brouillon-${draftSeq}`
          }
          activity={selected}
          draft={draft}
          scopeDomainId={scopeDomainId}
          scopeProjectId={projectId}
          lockLinks={Boolean(projectId)}
          pos={panelPos}
          domains={domains ?? []}
          projects={projects ?? []}
          activityTypes={activityTypes ?? []}
          onClose={closePanel}
          // Le brouillon devient une indisponibilité, mêmes dates, même place.
          onUnavailability={(period) =>
            unavailability.openDraftAt(period, panelPos)
          }
          onCreated={(created) => {
            setBornId(created.id)
            setDraft(null)
            setSelected(created)
            // Créée pendant une liaison : c'est à elle qu'on lie.
            picking?.onCreated?.(created)
          }}
          onMenu={(e) => selected && openMenu(selected, e)}
        />
      )}

      {unavailability.panel && (
        <UnavailabilityPanel
          key={`indispo-${unavailability.panel.seq}`}
          unavailability={unavailability.current}
          draft={unavailability.panel.draft}
          pendingSlot={
            unavailability.panel.id ? unavailability.panel.pendingSlot : null
          }
          pos={unavailability.pos}
          onClose={unavailability.close}
          onCreated={unavailability.adopt}
        />
      )}

      {unavailability.ask && (
        <RangeAsk
          x={unavailability.ask.x}
          y={unavailability.ask.y}
          unavailabilityLabel={[
            unavailability.ask.unavailability.emoji,
            unavailability.ask.unavailability.title,
          ]
            .filter(Boolean)
            .join(' ')}
          onSlot={() => {
            const a = unavailability.ask!
            unavailability.setAsk(null)
            unavailability.openExisting(
              a.unavailability,
              a.rect,
              dayIndexOf(a.day),
              unavailability.slotRange(a),
            )
          }}
          onActivity={() => {
            const a = unavailability.ask!
            unavailability.setAsk(null)
            openForRange(a.day, a.startH, a.endH, a.rect)
          }}
          onCancel={() => unavailability.setAsk(null)}
        />
      )}

      {menu && (
        <>
          {/* Backdrop : un clic (ou clic droit) à côté ferme le menu. */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu(null)
            }}
          />
          <div
            data-activity-ui
            style={{ top: menu.y, left: menu.x }}
            className="fixed z-50 min-w-40 overflow-hidden rounded-lg border border-border bg-popover py-1 text-sm shadow-xl"
          >
            {menu.activity ? (
              (() => {
                const group = groupOf(menu.activity) ?? [menu.activity]
                const n = group.length > 1 ? ` (${group.length})` : ''
                return (
                  <>
                    {group.some((a) => !isRitual(a)) && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            if (group.length > 1) duplicateGroup(group)
                            else duplicate(group[0])
                            setMenu(null)
                          }}
                          className="block w-full px-3 py-1.5 text-left hover:bg-muted/60"
                        >
                          Dupliquer{n}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            copy(group)
                            setMenu(null)
                          }}
                          className="block w-full px-3 py-1.5 text-left hover:bg-muted/60"
                        >
                          Copier{n}
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (group.length > 1) delGroup(group)
                        else del(group[0])
                        setMenu(null)
                      }}
                      className="block w-full px-3 py-1.5 text-left text-destructive hover:bg-muted/60"
                    >
                      Supprimer{n}
                    </button>
                  </>
                )
              })()
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const { day, hour } = menu.slot!
                    openForDraft(day, hour, {
                      top: menu.y,
                      left: menu.x,
                      right: menu.x,
                    } as DOMRect)
                    setMenu(null)
                  }}
                  className="block w-full px-3 py-1.5 text-left hover:bg-muted/60"
                >
                  Créer ici
                </button>
                <button
                  type="button"
                  disabled={!clipboardRef.current}
                  onClick={() => {
                    paste(menu.slot!)
                    setMenu(null)
                  }}
                  className="block w-full px-3 py-1.5 text-left hover:bg-muted/60 disabled:opacity-40"
                >
                  Coller ici
                </button>
              </>
            )}
          </div>
        </>
      )}

      <DeleteActivityDialog
        pending={deletion.pending}
        isPending={deletion.isPending}
        onConfirm={deletion.confirm}
        onCancel={deletion.cancel}
      />
      <DeleteActivitiesDialog
        pending={groupDeletion.pending}
        isPending={groupDeletion.isPending}
        onConfirm={groupDeletion.confirm}
        onCancel={groupDeletion.cancel}
      />
    </DndContext>
  )
}
