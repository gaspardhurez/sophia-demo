/** Utilitaires de date partagés. Le back stocke des datetime **naïfs** (sans
 * fuseau), donc on reste en heure locale de bout en bout — pas de conversion UTC. */

export function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function startOfWeek(d: Date): Date {
  const x = startOfDay(d)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)) // lundi = premier jour
  return x
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString()
}

/** Nombre de jours calendaires entre deux dates. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round(
    (startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000,
  )
}

/** Heure décimale d'une date (14h30 → 14.5). */
export function hourOf(d: Date): number {
  return d.getHours() + d.getMinutes() / 60
}

const p2 = (n: number) => String(n).padStart(2, '0')

/** ISO **local naïf** `YYYY-MM-DDTHH:MM:00` (pas de conversion UTC). */
export function toLocalISO(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}:00`
}

/** Date locale seule `YYYY-MM-DD`. */
export function toDateISO(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

/** « 4 sept. » — la date courte des historiques, l'année en plus si elle n'est
 *  pas l'année en cours (un passé lointain sans année se lit de travers). */
export function fmtShortDate(d: Date): string {
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/** `HH:MM` d'une chaîne ISO. */
export function fmtTime(iso: string): string {
  const d = new Date(iso)
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`
}

/** Heure décimale (13.25) → « 13:15 ». */
export function fmtHour(h: number): string {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}
