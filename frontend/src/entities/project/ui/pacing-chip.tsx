import { PACING_META, type Quantified, pacing } from '../model/progress'
import { StateDot } from './state-dot'

/** Rythme d'un élément quantifié (projet ou étape), en point d'état. Rien si
 * l'élément n'est pas quantifiable ou n'a pas de période complète. */
export function PacingChip({
  item,
  today,
}: {
  item: Quantified
  today: string
}) {
  const pace = pacing(item, today)
  if (!pace) return null
  return (
    <StateDot
      label={PACING_META[pace].label}
      dotClassName={PACING_META[pace].dot}
    />
  )
}
