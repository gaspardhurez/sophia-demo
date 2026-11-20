import { type Activity, isOverdueRecall, isRecall } from '@/entities/activity'

/**
 * L'infobulle d'une séance qui porte une interro (#85) : « Tennis · Interro ·
 * Volée de coup droit », puis « · en retard » passé son jour sans être cochée.
 * Les autres blocs n'en ont pas.
 */
export function recallTip(
  a: Activity,
  today: Date = new Date(),
): string | undefined {
  if (!isRecall(a)) return undefined
  const skills = a.acts
    .filter((x) => x.kind === 'recall')
    .map((x) => x.skill_name)
    .join(', ')
  const late = isOverdueRecall(a, today) ? ' · en retard' : ''
  return `${a.title} · Interro · ${skills}${late}`
}
