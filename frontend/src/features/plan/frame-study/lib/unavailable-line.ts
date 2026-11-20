/**
 * La ligne grisée d'une aide de Sophia indisponible (`prod/Cadrer etude`,
 * sans compagnon) : « Questions de Sophia indisponibles — pas de clé API
 * … ». Le motif du serveur est une phrase ; il entre ici en minuscule, sans
 * son point. Pas encore lu : le libellé seul.
 */
export function unavailableLine(label: string, reason: string | null): string {
  if (!reason) return label
  const short = reason.trim().replace(/\.$/, '')
  return `${label} — ${short.charAt(0).toLowerCase()}${short.slice(1)}`
}
