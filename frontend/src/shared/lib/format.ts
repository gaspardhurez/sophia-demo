/** Échéance en relatif : « Aujourd'hui », « Dans 4 mois », « En retard de 3 j ». */
export function relativeDeadline(due: string): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(`${due}T00:00:00`)
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000)
  if (days === 0) return "Aujourd'hui"
  const n = Math.abs(days)
  const label =
    n >= 60
      ? `${Math.round(n / 30)} mois`
      : n >= 14
        ? `${Math.round(n / 7)} sem.`
        : `${n} j`
  return days > 0 ? `Dans ${label}` : `En retard de ${label}`
}

/**
 * Date compacte : « 31 déc. », « 1er oct. » — **et « 5 juil. 2025 » hors de l'année en cours**.
 *
 * L'année était toujours omise, au motif que le relatif portait déjà la
 * distance. Vrai d'une échéance à quelques semaines, faux dès qu'une série
 * traverse les années : sur une métrique, « 5 juil. » et « 27 août » ne
 * laissent pas deviner qu'un an les sépare, et un record de 2025 se lisait
 * comme s'il datait de la semaine dernière.
 *
 * L'année n'apparaît donc que là où son absence induirait en erreur. Le cas
 * courant — cette année — reste aussi court qu'avant.
 */
export function formatDateShort(date: string): string {
  const d = new Date(`${date}T00:00:00`)
  const thisYear = d.getFullYear() === new Date().getFullYear()
  const label = d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    ...(thisYear ? {} : { year: 'numeric' }),
  })
  // « 1er oct. », pas « 1 oct. » : l'usage français, qu'Intl ne suit pas.
  return d.getDate() === 1 ? label.replace(/^1(?=\s)/, '1er') : label
}

/** Formate une échéance (YYYY-MM-DD) en date française lisible. */
export function formatDeadline(deadline: string): string {
  // Parse en local (le suffixe évite un décalage de fuseau sur une date nue).
  return new Date(`${deadline}T00:00:00`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
