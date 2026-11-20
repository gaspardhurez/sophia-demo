import type { Project } from './types'

/** En cours (teintée), à venir (pointillée), close (grise). */
export type SeasonKind = 'current' | 'upcoming' | 'closed'

export interface SeasonBar {
  id: string
  title: string
  /** Début et largeur, en % de l'année. */
  x: number
  w: number
  kind: SeasonKind
  /** Sans fin prévue et pas clos (#196) : la barre s'arrête à aujourd'hui,
   *  bord droit ouvert ; c'est son début. */
  openSince: string | null
}

export interface Frise {
  months: { label: string; x: number }[]
  bars: SeasonBar[]
  /** Le trait d'aujourd'hui, en % de l'année — absent sur une autre année. */
  today: number | null
}

const MONTHS = [
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

const DAY = 86_400_000

/**
 * La frise des saisons (design #51) : une année civile — par défaut celle
 * d'aujourd'hui —, une barre
 * par projet sur sa période, rognée aux bornes de l'année, dans l'ordre des
 * débuts. Un projet qui n'y touche pas n'y est pas. Les voies se décident à
 * l'affichage (`placeBars`) : elles dépendent de la largeur des noms.
 *
 * Un projet sans fin prévue (#196) court jusqu'à aujourd'hui tant qu'il est
 * ouvert (la barre avance avec le temps), puis jusqu'à sa fin constatée.
 */
export function buildFrise(
  projects: Project[],
  today: Date,
  year = today.getFullYear(),
): Frise {
  const t0 = Date.UTC(year, 0, 1)
  const t1 = Date.UTC(year + 1, 0, 1)
  const pct = (t: number) => ((t - t0) / (t1 - t0)) * 100
  const utc = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }

  const todayUtc = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  )
  const inYear = projects
    .filter((o) => o.start_at)
    .map((o) => {
      const start = utc(o.start_at)
      const last = o.due_at ?? o.ended_at
      return {
        o,
        start,
        // La barre couvre le dernier jour en entier ; sans fin, aujourd'hui.
        end: (last ? utc(last) : Math.max(todayUtc, start)) + DAY,
        open: last === null,
      }
    })
    .filter(({ start, end }) => end > t0 && start < t1)
    .sort((a, b) => a.start - b.start || a.end - b.end)

  const bars = inYear.map(({ o, start, end, open }) => {
    const x = pct(Math.max(start, t0))
    return {
      id: o.id,
      title: o.title,
      x,
      w: pct(Math.min(end, t1)) - x,
      kind:
        o.status === 'in_progress'
          ? 'current'
          : o.status === 'todo'
            ? 'upcoming'
            : 'closed',
      openSince: open ? o.start_at : null,
    } satisfies SeasonBar
  })

  return {
    months: MONTHS.map((label, i) => ({
      label,
      x: pct(Date.UTC(year, i, 1)),
    })),
    bars,
    today:
      year === today.getFullYear()
        ? pct(Date.UTC(year, today.getMonth(), today.getDate()) + DAY / 2)
        : null,
  }
}

/** Où s'écrit le nom : dans la barre, ou à côté quand elle est trop courte. */
export type SeasonLabel = 'inside' | 'right' | 'left'

export interface PlacedBar extends SeasonBar {
  /** Voie : 0, ou plus quand la barre ou son nom chevauche ce qui est posé. */
  lane: number
  label: SeasonLabel
}

/** L'écart entre la barre et son nom écrit à côté, en px. */
export const LABEL_GAP = 5

/**
 * Pose les barres d'une piste de `width` px (design #206). `fits(bar)` donne
 * la place qu'il faut au nom dans la barre (texte et marges) ; `textWidth`,
 * celle du texte seul. Une barre trop courte reste vide et son nom s'écrit à
 * droite, ou à gauche s'il sortirait de l'année. Le nom compte dans
 * l'encombrement : barres et noms qui se chevauchent passent sur des voies
 * différentes — la première libre, dans l'ordre des débuts.
 */
export function placeBars(
  bars: SeasonBar[],
  width: number,
  fits: (bar: SeasonBar) => number,
  textWidth: (bar: SeasonBar) => number,
): { bars: PlacedBar[]; lanes: number } {
  const px = (pct: number) => (pct / 100) * width
  const laneEnds: number[] = []
  const placed = bars.map((b) => {
    const left = px(b.x)
    const right = px(b.x + b.w)
    const text = textWidth(b)
    let label: SeasonLabel = 'inside'
    if (right - left < fits(b))
      label = right + LABEL_GAP + text > width ? 'left' : 'right'
    const start = label === 'left' ? left - LABEL_GAP - text : left
    const end = label === 'right' ? right + LABEL_GAP + text : right
    let lane = laneEnds.findIndex((e) => e <= start)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = end
    return { ...b, lane, label }
  })
  return { bars: placed, lanes: laneEnds.length }
}
