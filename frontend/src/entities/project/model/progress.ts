import type { Project, ProjectStep, Total } from './types'
import { type UnitMark, totalMarkIn } from './unit-mark'
import { toDateISO } from '@/shared/lib/date'
import { type UnitLike, unitLabel } from '@/shared/lib/units'
import { CHIP_TONES } from '@/shared/ui'

/** Rythme d'une étape quantifiée par rapport à sa période. */
export type Pacing =
  'ahead' | 'onTrack' | 'slightlyBehind' | 'behind' | 'done' | 'failed'

/** Étape « en cours » d'un projet à une date : période couvrant la date →
 * sinon 1ʳᵉ non terminée (dans l'ordre) → sinon dernière. */
export function currentStep(o: Project, todayStr: string): ProjectStep | null {
  const dated = o.steps.find(
    (s) =>
      s.start_at && s.due_at && s.start_at <= todayStr && todayStr <= s.due_at,
  )
  if (dated) return dated
  const firstOpen = o.steps.find((s) => !s.done)
  if (firstOpen) return firstOpen
  return o.steps.at(-1) ?? null
}

/** Élément quantifiable (projet ou étape) — même forme, même calcul. */
export interface Quantified {
  target: number | null
  progress: number
  start_at: string | null
  due_at: string | null
}

/** Indicateur de rythme (projet ou étape) : réussi si la cible est atteinte ;
 * raté si l'échéance est passée sans l'atteindre ; sinon écart entre la fraction
 * accomplie et la fraction de temps écoulée (±10 % = dans les temps). Null si pas quantifiable, **sans
 * période complète** (échéance seule → juste la barre) ou **pas encore
 * commencé** (avant le début → rien à cadencer). */
export function pacing(
  q: Quantified,
  todayStr: string,
  /** La part de la cible attendue à date, quand elle ne suit pas le temps
   *  écoulé (un Total distribué en étapes, cf. `expectedShare`). */
  expected?: number,
): Pacing | null {
  if (q.target == null) return null
  if (q.progress >= q.target) return 'done'
  if (q.due_at && todayStr > q.due_at) return 'failed'
  if (!q.start_at || !q.due_at) return null
  if (todayStr < q.start_at) return null // pas encore commencé : pas de rythme
  const start = Date.parse(q.start_at)
  const due = Date.parse(q.due_at)
  const now = Date.parse(todayStr)
  const t =
    expected ??
    (due > start ? Math.min(1, Math.max(0, (now - start) / (due - start))) : 1)
  // Écart d'avancement : fraction accomplie − fraction du temps écoulé.
  // Symétrique et stable en début de période (pas de division par ~0).
  const gap = q.progress / q.target - t
  if (gap >= 0.1) return 'ahead'
  if (gap >= -0.1) return 'onTrack'
  if (gap >= -0.25) return 'slightlyBehind'
  return 'behind'
}

/** La fraction écoulée d'une période (0 avant, 1 après) ; nulle sans
 *  période complète. */
function elapsedIn(
  start: string | null,
  due: string | null,
  todayStr: string,
): number | null {
  if (!start || !due) return null
  const s = Date.parse(start)
  const d = Date.parse(due)
  const now = Date.parse(todayStr)
  if (d <= s) return now >= s ? 1 : 0
  return Math.min(1, Math.max(0, (now - s) / (d - s)))
}

/**
 * La part de la cible d'un Total **attendue à date** (#112, demande de
 * l'utilisateur) : ses tranches d'étape la distribuent — une étape passée
 * attend sa tranche entière, celle en cours au prorata de sa période, une à
 * venir rien ; ce qu'aucune étape (datée) ne porte suit la période du
 * projet. Sans tranche, le temps écoulé du projet. Un Total que seules
 * les étapes suivantes portent n'est donc pas en retard pendant la première.
 */
export function expectedShare(
  total: Pick<Total, 'id' | 'target'>,
  project: Pick<Project, 'start_at' | 'due_at' | 'steps'>,
  todayStr: string,
): number | null {
  const whole = elapsedIn(project.start_at, project.due_at, todayStr)
  if (whole === null || total.target <= 0) return whole
  let expected = 0
  let covered = 0
  for (const step of project.steps) {
    const t = elapsedIn(step.start_at, step.due_at, todayStr)
    if (t === null) continue
    for (const share of step.totals)
      if (share.total_id === total.id) {
        expected += share.target * t
        covered += share.target
      }
  }
  if (covered === 0) return whole
  expected += Math.max(0, total.target - covered) * whole
  return Math.min(1, expected / total.target)
}

/** Le rythme d'un Total sur la période de son projet, ses tranches
 *  d'étape comprises (cf. `expectedShare`). */
export function totalPacing(
  total: Pick<Total, 'id' | 'target' | 'progress'>,
  project: Pick<Project, 'start_at' | 'due_at' | 'steps'>,
  todayStr: string,
): Pacing | null {
  // Sans fin prévue (#196) : pas d'échéance, pas de rythme ni d'issue.
  if (!project.due_at) return null
  return pacing(
    {
      target: total.target,
      progress: total.progress,
      start_at: project.start_at,
      due_at: project.due_at,
    },
    todayStr,
    expectedShare(total, project, todayStr) ?? undefined,
  )
}

/**
 * Libellé, style de pastille et couleur de point par rythme.
 *
 * `dot` sert la signalétique compacte : sur les surfaces où le rythme
 * accompagne un titre, un point coloré suffit et le libellé passe en infobulle.
 */
export const PACING_META: Record<
  Pacing,
  { label: string; className: string; dot: string }
> = {
  done: {
    label: 'Réussi',
    className: CHIP_TONES.emerald,
    dot: 'bg-emerald-500',
  },
  ahead: {
    label: 'En avance',
    className: CHIP_TONES.emerald,
    dot: 'bg-emerald-500',
  },
  onTrack: {
    label: 'Dans les temps',
    className: CHIP_TONES.sky,
    // Vert comme « en avance » : le point dit si ça va, pas de combien. Tenir
    // le rythme est une bonne nouvelle — la peindre en bleu la rendait neutre
    // au milieu de l'ambre et de l'orange, alors qu'elle rassure.
    dot: 'bg-emerald-500',
  },
  slightlyBehind: {
    label: 'Léger retard',
    className: CHIP_TONES.amber,
    dot: 'bg-amber-500',
  },
  behind: {
    label: 'En retard',
    className: CHIP_TONES.orange,
    dot: 'bg-orange-500',
  },
  failed: {
    label: 'Raté',
    className: CHIP_TONES.rose,
    dot: 'bg-rose-500',
  },
}

/** Du plus grave au plus favorable — c'est la pire condition qui décide. */
const PACING_SEVERITY: Pacing[] = [
  'failed',
  'behind',
  'slightlyBehind',
  'onTrack',
  'ahead',
  'done',
]

/** Le pire de plusieurs rythmes (les conditions se cumulent par un ET). */
export function worstPacing(paces: (Pacing | null)[]): Pacing | null {
  let pire: Pacing | null = null
  for (const pace of paces)
    if (
      pace &&
      (pire === null ||
        PACING_SEVERITY.indexOf(pace) < PACING_SEVERITY.indexOf(pire))
    )
      pire = pace
  return pire
}

/** L'issue d'une étape : tranchée (faite, ratée) ou encore ouverte. */
export type StepIssue = 'achieved' | 'failed'

/**
 * L'issue d'une étape, quand elle est tranchée.
 *
 * Même partage que sur un projet (cf. `ProjectStateChip`) : une **issue**
 * est close et se dit par une icône, un **rythme** court encore et se dit par
 * un point. L'étape mélangeait les deux dans une seule pastille, si bien que
 * « Réussi » y rendait le même vert que « Dans les temps ».
 *
 * « Ratée » reste ce que `pacing` sait déjà nommer — une tranche chiffrée dont
 * l'échéance est passée sous la cible. Une étape sans chiffre qui laisse passer
 * sa date n'échoue pas pour autant : rien ne mesure ce qui lui manque.
 */
export function stepIssue(
  step: ProjectStep,
  project: Project,
  todayStr: string,
): StepIssue | null {
  if (step.done) return 'achieved'
  const failed = stepProgressLines(step, project).some(
    (line) =>
      pacing(
        {
          target: line.max,
          progress: line.value,
          start_at: step.start_at,
          due_at: step.due_at,
        },
        todayStr,
      ) === 'failed',
  )
  return failed ? 'failed' : null
}

/**
 * Le rythme d'un projet, **tous axes confondus**.
 *
 * `pacing` ne sait lire qu'un couple cible/avancement, donc il ne voyait que le
 * volume : un projet suivi en régularité seule — Bien-être, Remise en forme — n'avait
 * pas de `target` et restait sans pastille, comme s'il n'était pas cadencé.
 *
 * Les conditions se cumulent par un ET : le projet n'est atteint que
 * lorsqu'elles le sont toutes, donc c'est la **plus en retard** qui donne le
 * rythme. Même principe que la barre montrée sur la carte. Chaque Total s'y
 * juge sur ce que ses tranches d'étape attendent à date (`totalPacing`).
 */
export function projectPacing(
  project: Project,
  todayStr: string,
): Pacing | null {
  let pire: Pacing | null = null
  for (const total of project.totals) {
    const pace = totalPacing(total, project, todayStr)
    if (!pace) continue
    if (
      pire === null ||
      PACING_SEVERITY.indexOf(pace) < PACING_SEVERITY.indexOf(pire)
    )
      pire = pace
  }
  return pire
}

/**
 * Comparateur de projets **par urgence** : le plus en retard d'abord.
 *
 * L'ordre est celui de `PACING_SEVERITY`, qui existait déjà pour choisir la
 * pire condition d'un projet — la même échelle sert donc à classer les
 * projets entre eux, et il n'y a pas deux définitions de « plus grave » à
 * tenir d'accord.
 *
 * Un projet **sans rythme** part à la fin : il n'est pas rassurant, il est
 * muet — rien de chiffré ne permet d'en dire quoi que ce soit, et le placer
 * parmi les bons élèves affirmerait ce qu'on ne sait pas.
 *
 * À rythme égal, l'échéance la plus proche passe devant : deux projets
 * également en retard ne demandent pas la même chose selon qu'il reste une
 * semaine ou un an. Sans échéance, on garde l'ordre d'arrivée — un tri qui
 * s'invente un départage produit un ordre instable d'un rendu à l'autre.
 */
export function compareByUrgency(
  todayStr: string,
): (a: Project, b: Project) => number {
  const rang = (o: Project) => {
    const pace = projectPacing(o, todayStr)
    return pace === null
      ? PACING_SEVERITY.length
      : PACING_SEVERITY.indexOf(pace)
  }
  return (a, b) => {
    const diff = rang(a) - rang(b)
    if (diff !== 0) return diff
    if (a.due_at && b.due_at) return a.due_at.localeCompare(b.due_at)
    if (a.due_at) return -1
    if (b.due_at) return 1
    return 0
  }
}

/** Une barre à afficher : un Total (ou sa tranche), et où il en est. */
export interface ProgressLine {
  key: string
  value: number
  max: number
  label: string
  /**
   * La cible seule, sans l'avancement — pour **annoncer** une condition qui
   * n'a pas encore commencé. Une barre à zéro sur une période à venir se lit
   * comme un retard, alors qu'il n'y a rien à rattraper.
   */
  announce: string
  /**
   * Le libellé sans l'unité — quand plusieurs barres partagent une ligne et
   * qu'il ne reste à chacune qu'un tiers de largeur.
   */
  short: string
  /**
   * L'unité de CETTE barre : celle du Total en valeur, « heures » en durée,
   * « fois » au nombre. Exposée brute pour que l'appelant puisse accorder un
   * autre nombre que celui du libellé (le prévisionnel de la semaine, par
   * exemple).
   */
  unit: UnitLike
  /**
   * La marque de ce qu'on compte — l'emoji de l'**unité**, ou l'icône d'une
   * unité intégrée (Heures, Fois), ou au nombre les emojis des activités types
   * comptées : voir `totalMarkIn`.
   *
   * Séparée du libellé pour que l'appelant puisse la rendre à part : glissé
   * dans le texte, un emoji grandit la ligne (il est plus haut qu'un chiffre)
   * et la barre paraît plus fine à côté d'une autre.
   */
  mark: UnitMark | null
}

/**
 * Ce que compte un Total en durée ou au nombre : ni l'un ni l'autre n'est une
 * unité du catalogue (design #27 — Heures et Fois sont épinglées à part).
 */
const HOURS: UnitLike = {
  name: 'heure',
  effective_plural: 'heures',
  tone: 'default',
}
const TIMES: UnitLike = {
  name: 'fois',
  effective_plural: 'fois',
  tone: 'default',
}

/**
 * L'unité dans laquelle un Total se lit. Au nombre, son mot s'il en a un
 * (#58) — « nuit », « séance » — à la place de « fois ».
 */
export function totalUnit(
  total: Pick<Total, 'mode' | 'unit' | 'count_name' | 'count_effective_plural'>,
): UnitLike {
  if (total.mode === 'duration') return HOURS
  if (total.mode === 'count')
    return total.count_name
      ? {
          name: total.count_name,
          effective_plural: total.count_effective_plural ?? total.count_name,
          tone: 'default',
        }
      : TIMES
  return total.unit ?? TIMES
}

/** Ce qu'un Total lit d'une activité — la forme minimale, sans l'entité. */
export interface MeasuredActivity {
  activity_type_id: string | null
  /** Ses actes d'apprentissage : en avoir un fait d'elle une séance. */
  acts: readonly unknown[]
  all_day: boolean
  start_at: string | null
  end_at: string | null
  values: { unit_id: string; value: number }[]
}

/**
 * Ce qu'une activité apporte à un Total — **le calcul du back, à l'identique**
 * (`ProjectTotal.counts` / `measure`) : rien si elle n'est pas dans ce qu'il
 * compte ; sinon 1 au nombre, sa durée en heures (placée dans la grille
 * seulement), ou sa valeur dans l'unité du Total.
 *
 * Il sert au prévisionnel que l'écran calcule lui-même (la semaine affichée) ;
 * le réalisé, lui, arrive tout fait de l'API.
 */
/** L'activité entre-t-elle dans ce que le Total compte ? Toutes, ou ses
 *  activités types et/ou les séances d'apprentissage (#37, §5). */
export function countsIn(total: Total, a: MeasuredActivity): boolean {
  const types = total.activity_type_ids
  if (types.length === 0 && !total.learning_sessions) return true
  if (total.learning_sessions && a.acts.length > 0) return true
  return types.includes(a.activity_type_id ?? '')
}

export function totalMeasure(total: Total, a: MeasuredActivity): number {
  if (!countsIn(total, a)) return 0
  if (total.mode === 'count') return 1
  if (total.mode === 'duration') {
    if (a.all_day || !a.start_at || !a.end_at) return 0
    return (Date.parse(a.end_at) - Date.parse(a.start_at)) / 3_600_000
  }
  return a.values
    .filter((v) => v.unit_id === total.unit?.id)
    .reduce((sum, v) => sum + v.value, 0)
}

/** Un nombre lisible : une durée lue au calendrier tombe vite en 3,999… h. */
function fmt(n: number): string {
  return String(Math.round(n * 100) / 100)
}

function line(
  key: string,
  progress: number,
  target: number,
  total: Total,
  project: Project,
): ProgressLine {
  const unit = totalUnit(total)
  return {
    key,
    value: progress,
    max: target,
    label:
      `${fmt(progress)} / ${fmt(target)} ${unitLabel(unit, target)}`.trimEnd(),
    announce: `${fmt(target)} ${unitLabel(unit, target)}`.trimEnd(),
    short: `${fmt(progress)}/${fmt(target)}`,
    unit,
    mark: totalMarkIn(total, project),
  }
}

/**
 * Retard d'une ligne sur le temps écoulé : fraction de temps passée moins
 * fraction accomplie. Plus il est grand, plus la ligne retient le projet.
 * Sans période complète, on retombe sur la seule fraction manquante.
 */
function lag(
  l: ProgressLine,
  start: string | null,
  due: string | null,
  today: string,
): number {
  const done = l.max > 0 ? Math.min(1, l.value / l.max) : 1
  if (!start || !due) return 1 - done
  const s = Date.parse(start)
  const d = Date.parse(due)
  const t =
    d > s ? Math.min(1, Math.max(0, (Date.parse(today) - s) / (d - s))) : 1
  return t - done
}

/** Une ligne dont la cible est atteinte : elle ne demande plus rien. */
const filled = (l: ProgressLine) => l.value >= l.max

/**
 * Les barres d'un projet — **une par Total**, l'**objectif en tête** d'abord
 * (design #27) : un Total rempli passe derrière ; devant, ceux que l'étape en
 * cours distribue, puis le plus en retard sur le temps écoulé, puis l'ordre
 * d'affichage. La première ligne est celle que
 * montrent l'en-tête et la carte d'accueil.
 *
 * Toutes les lignes restent : les conditions se cumulent par un ET, et une
 * cible qu'on n'affiche pas cesse de motiver.
 */
export function progressLines(
  project: Project,
  todayStr: string = toDateISO(new Date()),
): ProgressLine[] {
  const step = currentStep(project, todayStr)
  const inStep = new Set(step?.totals.map((share) => share.total_id) ?? [])
  return project.totals
    .map((total) => ({
      total,
      line: line(total.id, total.progress, total.target, total, project),
    }))
    .sort(
      (a, b) =>
        Number(filled(a.line)) - Number(filled(b.line)) ||
        Number(inStep.has(b.total.id)) - Number(inStep.has(a.total.id)) ||
        lag(b.line, project.start_at, project.due_at, todayStr) -
          lag(a.line, project.start_at, project.due_at, todayStr) ||
        a.total.position - b.total.position,
    )
    .map(({ line }) => line)
}

/**
 * Les barres d'une étape — une par tranche de Total, **la plus contraignante
 * d'abord** : les conditions se cumulent par un ET, c'est la plus en retard
 * qui sépare de l'atteinte. Le tri est stable, à égalité l'ordre des Totaux.
 */
export function stepProgressLines(
  step: ProjectStep,
  project: Project,
): ProgressLine[] {
  const byId = new Map(project.totals.map((t) => [t.id, t]))
  const lines = step.totals.flatMap((share) => {
    const total = byId.get(share.total_id)
    return total
      ? [line(share.total_id, share.progress, share.target, total, project)]
      : []
  })
  const fraction = (l: ProgressLine) => (l.max > 0 ? l.value / l.max : 1)
  return lines.sort((a, b) => fraction(a) - fraction(b))
}
