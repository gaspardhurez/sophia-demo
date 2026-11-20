import type { Project, Total } from './types'

/**
 * La marque de ce qu'un Total compte — l'emoji de son unité du catalogue, ou
 * l'icône d'une unité intégrée : **Heures** (mode durée) et **Fois** (mode
 * nombre) ne sont pas au catalogue et n'ont pas d'emoji, mais elles ont leur
 * icône dans le menu d'unités (design #27). Une seule source, pour que le
 * menu, l'en-tête, la semaine et les cartes montrent la même chose.
 */
export type UnitMark =
  { kind: 'emoji'; emoji: string } | { kind: 'hours' } | { kind: 'times' }

/** La marque d'un Total, ou rien quand son unité n'a pas d'emoji. */
export function totalMark(
  total: Pick<Total, 'mode' | 'unit' | 'count_emoji'>,
): UnitMark | null {
  if (total.mode === 'duration') return { kind: 'hours' }
  // Au nombre, l'emoji choisi pour son mot (#58) prime sur tout le reste.
  if (total.mode === 'count')
    return total.count_emoji
      ? { kind: 'emoji', emoji: total.count_emoji }
      : { kind: 'times' }
  return total.unit?.emoji ? { kind: 'emoji', emoji: total.unit.emoji } : null
}

/**
 * La marque d'un Total dans son projet. Au nombre, ce qu'on compte, c'est
 * l'activité type : les emojis de celles que le Total compte (trois au plus)
 * passent devant l'icône « Fois » — trois barres « N / M fois » ne se
 * distinguaient pas sans eux (design #27). Une unité en valeur sans emoji
 * retombe aussi sur l'activité type.
 */
export function totalMarkIn(
  total: Pick<Total, 'mode' | 'unit' | 'activity_type_ids' | 'count_emoji'>,
  project: Pick<Project, 'activity_types'>,
): UnitMark | null {
  const own = totalMark(total)
  if (own && own.kind !== 'times') return own
  const emojis = total.activity_type_ids
    .map(
      (id) =>
        project.activity_types.find((l) => l.activity_type_id === id)?.emoji,
    )
    .filter((e): e is string => Boolean(e))
    .slice(0, 3)
  return emojis.length > 0 ? { kind: 'emoji', emoji: emojis.join('') } : own
}
