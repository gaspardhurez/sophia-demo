import type { Activity, ActivityAct } from '@/entities/activity'
import { pieceKey, pieceOfAct } from '@/entities/plan'
import {
  addDays,
  sameDay,
  startOfDay,
  startOfWeek,
  toDateISO,
} from '@/shared/lib/date'

/**
 * La logique du bloc **Séances** d'un cycle (#160, `kit/Seances savoir`) :
 * les séances regroupées par jour, la grille des dernières semaines et le
 * journal, du plus récent au plus ancien. Pure : ni React, ni requête.
 */

/** Le nombre de semaines de la grille (le kit). */
export const GRID_WEEKS = 6

/**
 * L'état d'une séance : faite (teintée, coche), passée non faite (rouge),
 * à venir (pointillé). Une séance d'aujourd'hui non faite est encore à venir :
 * elle n'est en retard que le lendemain.
 */
export type SessionState = 'done' | 'late' | 'planned'

/** Une pièce de ce savoir, telle qu'une séance la travaille. */
export interface StripPiece {
  key: string
  /** Toujours un emoji : 🌱 pour une pièce générique (comme au calendrier). */
  emoji: string
  title: string
}

export interface StripSession {
  activity: Activity
  title: string
  state: SessionState
  /** Jamais vide : une séance sans pièce en porte une, à son nom. */
  pieces: StripPiece[]
}

export interface StripDay {
  date: Date
  key: string
  /** Dans l'ordre du jour : journée entière d'abord, puis l'heure. */
  sessions: StripSession[]
  isToday: boolean
}

/** Une case de la grille : un jour, avec ses séances s'il en porte. */
export interface GridCell {
  date: Date
  key: string
  day: StripDay | null
}

export interface GridWeek {
  /** Le lundi. */
  start: Date
  cells: GridCell[]
}

/** Une ligne du journal : une séance et le jour qui la porte. */
export interface JournalEntry {
  day: StripDay
  session: StripSession
}

/** L'ordre des pièces dans une séance : l'étude, l'interro, puis chaque
 *  phase de pratique, sa pièce générique en tête. */
function pieceRank(act: ActivityAct): number {
  if (act.kind === 'study') return 0
  if (act.kind === 'recall') return 1
  const base = act.nature === 'situation' ? 4 : 2
  if (act.nature) return base
  return base + 1
}

/** Les actes d'une séance qui servent ce savoir dans ce cycle — ou dans
 *  aucun (posés avant que les séances ne s'y rattachent), comme le
 *  calendrier du cycle les lisait. */
function actsFor(a: Activity, skillId: string, planId: string) {
  return a.acts.filter(
    (x) =>
      x.skill_id === skillId && (x.plan_id === planId || x.plan_id == null),
  )
}

function stripPiece(act: ActivityAct, domainEmoji: string): StripPiece {
  const piece = pieceOfAct(act, domainEmoji)
  return {
    key: pieceKey(act),
    emoji: piece.generic ? '🌱' : piece.emoji,
    title: piece.title,
  }
}

function sessionState(a: Activity, date: Date, today: Date): SessionState {
  if (a.done) return 'done'
  return date < startOfDay(today) ? 'late' : 'planned'
}

/** Les séances du cycle, par jour, dans l'ordre. */
export function stripDays({
  activities,
  skillId,
  planId,
  today,
  domainEmoji,
}: {
  activities: Activity[]
  skillId: string
  planId: string
  today: Date
  domainEmoji: string
}): StripDay[] {
  const byDay = new Map<string, StripSession[]>()
  const sorted = [...activities].sort((x, y) => {
    if (x.all_day !== y.all_day) return x.all_day ? -1 : 1
    return (x.start_at ?? '').localeCompare(y.start_at ?? '')
  })
  for (const a of sorted) {
    if (!a.start_at) continue
    const acts = actsFor(a, skillId, planId)
    if (acts.length === 0) continue
    const at = new Date(a.start_at)
    const pieces = [...acts]
      .sort((x, y) => pieceRank(x) - pieceRank(y))
      .map((x) => stripPiece(x, domainEmoji))
    const key = toDateISO(at)
    byDay.set(key, [
      ...(byDay.get(key) ?? []),
      {
        activity: a,
        title: a.title,
        state: sessionState(a, startOfDay(at), today),
        pieces: pieces.length
          ? pieces
          : [{ key: a.id, emoji: a.emoji || domainEmoji, title: a.title }],
      },
    ])
  }
  return [...byDay.entries()]
    .sort(([x], [y]) => x.localeCompare(y))
    .map(([key, sessions]) => {
      const date = new Date(`${key}T00:00:00`)
      return { date, key, sessions, isToday: sameDay(date, today) }
    })
}

/**
 * Les semaines de la grille, la plus ancienne en haut. Elle finit sur la
 * semaine qui suit aujourd'hui (plus tard si une séance y est prévue) ; si
 * aucune séance n'y tombe (cycle clos, ancien), sur la semaine de la dernière
 * séance.
 */
export function gridWeeks(
  days: StripDay[],
  today: Date,
  count = GRID_WEEKS,
): GridWeek[] {
  const thisWeek = startOfWeek(today)
  const lastWeek = days.length ? startOfWeek(days.at(-1)!.date) : thisWeek
  const next = addDays(thisWeek, 7)
  const byToday = lastWeek > next ? lastWeek : next
  const from = addDays(byToday, -7 * (count - 1))
  const end = days.some((d) => startOfWeek(d.date) >= from) ? byToday : lastWeek
  const byKey = new Map(days.map((d) => [d.key, d]))
  return Array.from({ length: count }, (_, w) => {
    const start = addDays(end, -7 * (count - 1 - w))
    return {
      start,
      cells: Array.from({ length: 7 }, (_, j) => {
        const date = addDays(start, j)
        const key = toDateISO(date)
        return { date, key, day: byKey.get(key) ?? null }
      }),
    }
  })
}

/** Le journal : toutes les séances, la plus récente d'abord — dans une même
 *  journée, l'ordre du jour (comme dans la case). */
export function journal(days: StripDay[]): JournalEntry[] {
  return [...days]
    .reverse()
    .flatMap((day) => day.sessions.map((session) => ({ day, session })))
}

/** Le nombre de pièces d'un jour (la pastille de sa case). */
export const dayPieceCount = (day: StripDay) =>
  day.sessions.reduce((n, s) => n + s.pieces.length, 0)

const month = (d: Date) => d.toLocaleDateString('fr-FR', { month: 'short' })

/** « 31 août » — le lundi d'une ligne de la grille. */
export const weekLabel = (d: Date) => `${d.getDate()} ${month(d)}`

/** « lun. 7 sept. » — le jour d'une ligne du journal, de la liste du jour. */
export const dayLabel = (d: Date) =>
  `${d.toLocaleDateString('fr-FR', { weekday: 'short' })} ${d.getDate()} ${month(d)}`
