import type { Modifier } from '@dnd-kit/core'

/** Géométrie de la grille horaire. */
export const HOURS = Array.from({ length: 24 }, (_, i) => i) // journée 0–23h
export const DAY_START = HOURS[0]
export const DAY_END = HOURS[0] + HOURS.length
export const CELL_H = 48 // hauteur d'une heure en px
export const SNAP = 0.25 // pas d'accroche (quart d'heure)
const STEP_PX = CELL_H * SNAP

/** Contraint le drag dnd-kit au quart d'heure sur l'axe vertical. */
export const snapDragToQuarter: Modifier = ({ transform }) => ({
  ...transform,
  y: Math.round(transform.y / STEP_PX) * STEP_PX,
})

export const snap = (h: number) => Math.round(h / SNAP) * SNAP
export const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v))

/** Heure décimale → `HH:MM`. */
/** Construit une Date (locale) depuis un jour + une heure décimale. */
export function at(day: Date, hour: number): Date {
  const d = new Date(day)
  d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0)
  return d
}

/** Rembourrage vertical d'un bloc (py-1, haut + bas) et gabarit de sa méta. */
const BLOC_PADDING_Y = 8
const BLOC_META = 16 // 11px sur 14 d'interligne, plus 2 de marge haute
const BLOC_INTERLIGNE = 15

/**
 * Un bloc d'un quart d'heure : il garde sa
 * **vraie** hauteur et passe sur une ligne fine. Le minimum lisible de 18 px
 * le faisait déborder sur le quart d'heure suivant — et deux séances de
 * 15 min qui se suivaient se chevauchaient.
 */
export function isThinBlock(dur: number): boolean {
  return dur <= SNAP + 1e-6
}

/** Hauteur réelle d'un bloc, en px, pour une durée en heures : 1 px d'air
 *  en haut et en bas, un demi seulement sur la ligne fine (11 px). */
export function blockHeight(dur: number): number {
  return isThinBlock(dur) ? dur * CELL_H - 1 : dur * CELL_H - 2
}

/** Le haut d'un bloc, en px, sur la grille horaire. */
export function blockTop(startH: number, dur: number): number {
  return (startH - DAY_START) * CELL_H + (isThinBlock(dur) ? 0.5 : 1)
}

/**
 * Un bloc trop court pour porter sa méta sous une ligne de titre : tout passe
 * sur une seule ligne, heure de début à droite.
 *
 * Le seuil était « 30 minutes ou moins », posé à la main. Il laissait un bloc
 * de 45 min en présentation normale alors que sa hauteur coupait la méta à
 * mi-caractère — le gabarit décide mieux qu'un chiffre rond (≤ 45 min
 * aujourd'hui, et ça suivra si les tailles bougent).
 */
export function isCompactBlock(dur: number): boolean {
  return blockHeight(dur) - BLOC_PADDING_Y < BLOC_INTERLIGNE + BLOC_META
}

/**
 * Lignes que la hauteur d'un bloc laisse à son titre — au-delà, « … ».
 *
 * 1 h en donne 1, 1 h 15 en donne 2, 1 h 30 trois, 2 h quatre. Le titre était
 * tronqué sur une ligne quelle que soit la durée, si bien qu'un bloc de deux
 * heures montrait un titre coupé au-dessus de soixante pixels de vide.
 */
export function titleLinesFor(dur: number): number {
  const libre = blockHeight(dur) - BLOC_PADDING_Y - BLOC_META
  return Math.max(1, Math.floor(libre / BLOC_INTERLIGNE))
}

/**
 * Ce qui est lié à une séance (actes, réalisations, cibles), **un par ligne,
 * en toutes lettres** — si la hauteur du bloc le permet sous une ligne de
 * titre au moins. Rend les lignes laissées au titre, ou `null` : alors les
 * liens se résument en emojis, et se nomment au survol.
 */
export function titleLinesBesideLinked(dur: number, n: number): number | null {
  if (n === 0) return null
  const libre = blockHeight(dur) - BLOC_PADDING_Y - BLOC_META
  // Une ligne de lien : 12 px, 2 d'écart entre deux, 4 au-dessus de la liste.
  const liste = 4 + n * 12 + (n - 1) * 2
  const reste = libre - liste
  return reste >= BLOC_INTERLIGNE ? Math.floor(reste / BLOC_INTERLIGNE) : null
}

/**
 * Lignes du titre d'un bloc à deux colonnes (#55) : il passe sous la coche et
 * l'emoji, et la plage horaire disparaît pour lui laisser la place.
 */
export function wrappedTitleLinesFor(dur: number): number {
  const libre = blockHeight(dur) - BLOC_PADDING_Y - BLOC_INTERLIGNE
  return Math.max(1, Math.floor(libre / BLOC_INTERLIGNE))
}
