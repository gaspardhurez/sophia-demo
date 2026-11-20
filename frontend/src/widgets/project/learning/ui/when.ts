import { addDays, sameDay, startOfDay } from '@/shared/lib/date'
import { formatDateShort } from '@/shared/lib/format'

const hm = (d: Date) =>
  d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

/** « il y a 2 j », « hier », « aujourd'hui » — quand c'était. */
export function ago(iso: string): string {
  const d = startOfDay(new Date(iso))
  const today = startOfDay(new Date())
  const days = Math.round((today.getTime() - d.getTime()) / 86_400_000)
  if (days <= 0) return "aujourd'hui"
  if (days === 1) return 'hier'
  return `il y a ${days} j`
}

/** « demain 18:00 », « sam. 10:00 », « 12 oct. » — quand c'est posé. */
export function posedAt(iso: string): string {
  const d = new Date(iso)
  const today = startOfDay(new Date())
  if (sameDay(d, today)) return `aujourd'hui ${hm(d)}`
  if (sameDay(d, addDays(today, 1))) return `demain ${hm(d)}`
  if (d < addDays(today, 7))
    return `${d.toLocaleDateString('fr-FR', { weekday: 'short' })} ${hm(d)}`
  return formatDateShort(iso.slice(0, 10))
}
