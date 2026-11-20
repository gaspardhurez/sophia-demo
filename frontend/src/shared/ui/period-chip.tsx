import { CalendarRange } from 'lucide-react'

import { toDateISO } from '@/shared/lib/date'
import { formatDateShort, relativeDeadline } from '@/shared/lib/format'

import { Chip } from './chip'

/**
 * Période d'une étape : toujours début → fin (dates exactes). Pour une étape
 * **à venir** (début futur), on préfixe le relatif « Dans X » basé sur le
 * **début** — pas sur la fin.
 */
export function PeriodChip({
  start,
  due,
}: {
  start?: string | null
  due?: string | null
}) {
  if (!start && !due) return null
  const upcoming = start != null && start > toDateISO(new Date())
  const period =
    start && due
      ? `${formatDateShort(start)} → ${formatDateShort(due)}`
      : due
        ? formatDateShort(due)
        : `dès ${formatDateShort(start!)}`
  return (
    <Chip tone="neutral">
      <CalendarRange className="size-3.5" />
      {upcoming ? `${relativeDeadline(start!)} · ${period}` : period}
    </Chip>
  )
}
