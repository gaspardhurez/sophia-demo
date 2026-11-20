import { fmtTime } from '@/shared/lib/date'
import {
  formatValue,
  isTimeUnit,
  parseDuration,
  type UnitLike,
} from '@/shared/lib/units'

/** Ce qu'il faut d'une séance pour la nommer. */
export interface SessionLike {
  emoji: string | null
  all_day: boolean
  start_at: string | null
  end_at: string | null
}

/** « jeu. 8 » : le jour court d'une date. */
export function dayLabel(d: Date): string {
  return `${d.toLocaleDateString('fr-FR', { weekday: 'short' })} ${d.getDate()}`
}

/** « 18:30 – 20:00 », ou « sans heure » pour une séance en journée. */
export function hoursLabel(a: SessionLike): string {
  if (a.all_day || !a.start_at) return 'sans heure'
  return a.end_at
    ? `${fmtTime(a.start_at)} – ${fmtTime(a.end_at)}`
    : fmtTime(a.start_at)
}

/**
 * Une séance sous le nom de ce qui y est lié (#92) : « 🏃 dim. 11 · 7:00 » —
 * son emoji (celui du domaine à défaut), son jour, son heure si elle en a une.
 */
export function sessionLabel(a: SessionLike, domainEmoji = ''): string {
  if (!a.start_at) return 'à placer'
  const day = dayLabel(new Date(a.start_at))
  const emoji = a.emoji || domainEmoji
  const time = a.all_day ? '' : ` · ${fmtTime(a.start_at)}`
  return `${emoji ? `${emoji} ` : ''}${day}${time}`
}

/** « 7,5 » : un nombre lu au calendrier, sans ses queues de flottant. */
export function fr(n: number): string {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
}

/** Une valeur de Résultat telle qu'on la lit (mm:ss sur une durée). */
export function metricValue(
  value: number,
  unit: UnitLike | null | undefined,
): string {
  return formatValue(value, unit)
}

/** Relit une valeur saisie (« 1 500 », « 47:30 », « 18,5 ») ; `null` si
 *  illisible. */
export function parseMetricValue(
  text: string,
  unit: UnitLike | null | undefined,
): number | null {
  if (isTimeUnit(unit)) return parseDuration(text, unit)
  const n = Number(text.replace(/\s/g, '').replace(',', '.'))
  return text.trim() && Number.isFinite(n) ? n : null
}

/** Une teinte du domaine à `pct` % (fond de tuile, puce de gain). */
export const tint = (c: string, pct: number) =>
  `color-mix(in oklab, ${c} ${pct}%, transparent)`

/**
 * Le texte foncé d'une teinte de domaine, lisible dans les deux thèmes : le
 * 800 en clair, le 200 en sombre. Les valeurs passent par deux variables que
 * le panneau d'un projet pose (`toneVars`) ; la classe, elle, est fixe.
 */
export const TONE_TEXT =
  'text-[var(--tone-fg-light)] dark:text-[var(--tone-fg-dark)]'

/** Les variables de `TONE_TEXT`, depuis le 800 du domaine. */
export function toneVars(fonce: string): Record<string, string> {
  return {
    '--tone-fg-light': fonce,
    '--tone-fg-dark': fonce.replace('-800', '-200'),
  }
}
