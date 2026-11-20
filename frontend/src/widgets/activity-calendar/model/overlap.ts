import type { CSSProperties } from 'react'

/**
 * Les activités d'un jour qui se chevauchent (design #55, 1 h
 * retenu ; revu à l'usage, #62).
 *
 * Un groupe d'activités qui se chevauchent — partiellement ou totalement — se
 * partage la largeur en colonnes : chacune prend la première colonne libre,
 * dans l'ordre des débuts puis des durées décroissantes, et **s'étend vers la
 * droite** sur les colonnes voisines libres pendant tout son créneau. Hors
 * groupe, pleine largeur.
 *
 * Un seul cas se pose au lieu de se ranger : un bloc **seul** dans son groupe,
 * avec dedans des activités courtes — contenues (elles commencent après lui et
 * finissent avant ou avec lui) et qui ne se chevauchent pas entre elles. Elles
 * se posent sur lui, à sa largeur. Dès que le groupe a d'autres colonnes, ou
 * que deux contenues se chevauchent, tout le monde prend sa colonne : il y a
 * de la place, autant s'en servir, et rien ne se cache sous rien.
 *
 * Au-delà de quatre colonnes, on en garde trois ; la quatrième devient une case
 * « +n » sur le créneau des masquées.
 */

/** Un bloc posé, en heures décimales : ce qu'il occupe à l'écran. */
export interface Span {
  key: string
  start: number
  end: number
}

/**
 * La place d'un bloc : sa colonne sur `cols`, sur `span` colonnes (il s'étend
 * sur les voisines libres), posé ou non sur un autre — ou portant d'autres
 * blocs posés sur lui (`host`).
 */
export interface Lane {
  col: number
  cols: number
  span: number
  nested: boolean
  host?: boolean
  /** Posé sur un autre : la clé de celui qui le porte. */
  hostKey?: string
}

/** La case « +n » : le créneau des masquées, dans l'ordre des débuts. */
export interface MoreBox {
  key: string
  start: number
  end: number
  keys: string[]
}

export const MAX_COLS = 4

const EPS = 1e-9

const overlaps = (a: Span, b: Span) =>
  a.start < b.end - EPS && b.start < a.end - EPS

/** Première colonne libre, dans l'ordre donné. */
function assignColumns(spans: Span[], order: number[]) {
  const col = new Map<number, number>()
  const ends: number[] = []
  for (const i of order) {
    let c = ends.findIndex((e) => e <= spans[i].start + EPS)
    if (c < 0) c = ends.push(0) - 1
    ends[c] = spans[i].end
    col.set(i, c)
  }
  return { col, n: ends.length }
}

export function layoutDay(spans: Span[]): {
  lanes: Map<string, Lane>
  more: MoreBox[]
} {
  const inside = (a: Span, b: Span) => b.start < a.start && a.end <= b.end
  const byStart = (a: number, b: number) =>
    spans[a].start - spans[b].start || spans[b].end - spans[a].end
  const order = spans.map((_, i) => i).sort(byStart)

  // Les groupes : une suite de blocs dont chacun commence avant la fin du
  // plus tardif des précédents.
  const clusters: number[][] = []
  let end = -Infinity
  for (const i of order) {
    if (clusters.length === 0 || spans[i].start >= end - EPS) {
      clusters.push([])
      end = -Infinity
    }
    clusters[clusters.length - 1].push(i)
    end = Math.max(end, spans[i].end)
  }

  const lanes = new Map<string, Lane>()
  const more: MoreBox[] = []
  clusters.forEach((cluster, ci) => {
    // Posé : un seul bloc porte tous les autres, qui ne se chevauchent pas.
    const [hostIdx, ...rest] = cluster
    const nest =
      rest.length > 0 &&
      rest.every((i) => inside(spans[i], spans[hostIdx])) &&
      rest.every((i, k) =>
        rest.slice(k + 1).every((j) => !overlaps(spans[i], spans[j])),
      )
    if (nest) {
      lanes.set(spans[hostIdx].key, {
        col: 0,
        cols: 1,
        span: 1,
        nested: false,
        host: true,
      })
      for (const i of rest)
        lanes.set(spans[i].key, {
          col: 0,
          cols: 1,
          span: 1,
          nested: true,
          hostKey: spans[hostIdx].key,
        })
      return
    }

    const { col, n } = assignColumns(spans, cluster)
    const cols = Math.min(n, MAX_COLS)
    const hidden = n > MAX_COLS ? cluster.filter((i) => col.get(i)! >= 3) : []
    for (const i of cluster) {
      if (hidden.includes(i)) continue
      const c = col.get(i)!
      // S'étendre à droite tant que la colonne voisine est libre sur tout le
      // créneau — pas au-delà d'une case « +n ».
      let span = 1
      if (!hidden.length)
        while (
          c + span < cols &&
          !cluster.some(
            (j) => col.get(j) === c + span && overlaps(spans[i], spans[j]),
          )
        )
          span++
      lanes.set(spans[i].key, { col: c, cols, span, nested: false })
    }
    if (hidden.length)
      more.push({
        key: `more-${ci}`,
        start: Math.min(...hidden.map((i) => spans[i].start)),
        end: Math.max(...hidden.map((i) => spans[i].end)),
        keys: [...hidden].sort(byStart).map((i) => spans[i].key),
      })
  })
  return { lanes, more }
}

/**
 * La géométrie d'une colonne, dans un jour bordé de `inset` px : 2 px d'air
 * entre deux colonnes. Survolé, le bloc repasse en pleine largeur par-dessus.
 */
export function laneStyle(
  lane: Pick<Lane, 'col' | 'cols' | 'span'> | undefined,
  inset: number,
  expanded = false,
): CSSProperties {
  if (!lane || lane.cols < 2 || expanded) return { left: inset, right: inset }
  const { col, cols, span } = lane
  const last = col + span - 1
  const w = `(100% - ${2 * inset}px)`
  return {
    left: `calc(${inset}px + ${w} * ${col} / ${cols})`,
    right: `calc(${inset}px + ${w} * ${cols - last - 1} / ${cols} + ${last < cols - 1 ? 2 : 0}px)`,
  }
}

/**
 * Les colonnes « équivalentes » d'un bloc, pour alléger son contenu : un bloc
 * étendu sur deux colonnes de trois se lit comme à deux (#55, #62).
 */
export const laneDensity = (lane: Lane | undefined) =>
  lane ? Math.ceil(lane.cols / lane.span) : 1

/**
 * Rien à ramener devant au survol : ni colonne partagée, ni d'autres blocs
 * posés sur lui. Un bloc posé sur un autre est déjà devant — pas d'effet de
 * survol ; celui qui le porte, en arrière-plan, se dévoile le temps du
 * survol : ceux posés dessus s'effacent en fondu (`HOST_REVEAL_DELAY`,
 * 25/10).
 */
export const isAlone = (lane: Lane | undefined) =>
  !lane || (lane.cols < 2 && !lane.host)

/** L'ombre d'un bloc déplié au survol. */
/** Le survol d'un bloc qui en porte d'autres attend un instant : le frôler
 *  en passant ne fait rien clignoter. */
export const HOST_REVEAL_DELAY = 140

/** Le fondu des blocs posés sur celui qu'on dévoile, et de son ombre. */
export const REVEAL_TRANSITION =
  'transition-[left,right,opacity,box-shadow] duration-200 ease-out'

export const EXPANDED_SHADOW = `0 6px 16px color-mix(in oklab, var(--color-foreground) 18%, transparent)`
