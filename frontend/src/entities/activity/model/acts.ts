import type { Activity, ActivityAct } from './types'

/** Les actes d'une activité qui servent ce cycle. */
export function actsOfPlan(a: Activity, planId: string): ActivityAct[] {
  return a.acts.filter((x) => x.plan_id === planId)
}

/** Les actes d'une activité qui travaillent cet objet de pratique. */
export function actsOfItem(a: Activity, itemId: string): ActivityAct[] {
  return a.acts.filter((x) => x.practice_item_id === itemId)
}

/**
 * Un acte en une ligne : son emoji et ce qu'on y fait du savoir — « 📓 Étude ·
 * Volée », « 🧠 Interro · Chandelle ». Un exercice n'a ici ni son titre ni son
 * emoji (l'acte ne porte que l'id de l'objet) : celui du domaine, sinon 🧺.
 */
export function actGlyph(
  act: ActivityAct,
  domainEmoji = '',
): { emoji: string; label: string } {
  if (act.kind === 'study')
    return { emoji: '📓', label: `Étude · ${act.skill_name}` }
  if (act.kind === 'recall')
    return { emoji: '🧠', label: `Interro · ${act.skill_name}` }
  // Une pièce générique (#108) : « Pratique · Chandelle ».
  if (act.nature)
    return {
      emoji: '🌱',
      label: `${act.nature === 'isolated' ? 'Pratique' : 'Mise en situation'} · ${act.skill_name}`,
    }
  return { emoji: domainEmoji || '🧺', label: `Exercice · ${act.skill_name}` }
}

/** L'activité porte-t-elle un acte sur ce savoir (et, si on le dit, ce
 *  cycle) ? */
export function hasActOn(
  a: Activity,
  skillId: string,
  planId?: string,
): boolean {
  return a.acts.some(
    (x) =>
      x.skill_id === skillId && (planId === undefined || x.plan_id === planId),
  )
}

/** L'emoji d'un acte : 📓 l'étude, 🧠 l'interro, 🌱 une pièce générique,
 *  l'emoji de l'objet (sinon celui du domaine). */
function actEmoji(act: ActivityAct, domainEmoji: string): string {
  if (act.kind === 'study') return '📓'
  if (act.kind === 'recall') return '🧠'
  if (act.nature) return '🌱'
  return act.item_emoji || domainEmoji || '🧺'
}

const KIND_ORDER = { study: 0, recall: 1, practice: 2 } as const

/** Les actes d'une séance, **une ligne par savoir** : les emojis de ses
 *  pièces, puis son nom (« 📓🌱 Mise en place », #108) — sous le titre d'un
 *  bloc du calendrier. Les savoirs dans l'ordre de `rank` (la séquence des
 *  projets de la séance, comme la section Apprentissage), sinon dans celui
 *  de leurs actes. */
export function actLines(
  acts: ActivityAct[],
  domainEmoji = '',
  rank?: (skillId: string) => number,
): { key: string; emoji: string; label: string }[] {
  const bySkill = new Map<string, ActivityAct[]>()
  for (const act of acts)
    bySkill.set(act.skill_id, [...(bySkill.get(act.skill_id) ?? []), act])
  const lists = [...bySkill.values()]
  if (rank) lists.sort((x, y) => rank(x[0].skill_id) - rank(y[0].skill_id))
  return lists.map((list) => {
    const sorted = [...list].sort(
      (x, y) => KIND_ORDER[x.kind] - KIND_ORDER[y.kind],
    )
    const emojis = [...new Set(sorted.map((x) => actEmoji(x, domainEmoji)))]
    return {
      key: `skill-${list[0].skill_id}`,
      emoji: emojis.join(''),
      label: list[0].skill_name,
    }
  })
}
