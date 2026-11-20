import { formatValue, type UnitLike, unitLabel } from '@/shared/lib/units'

import type { DomainCounter } from './types'

/** Les heures, en toutes lettres comme sur un Total en durée. */
const HOURS: UnitLike = {
  name: 'heure',
  effective_plural: 'heures',
  tone: 'default',
}

/** Une quantité du compteur, prête à lire : « 64 heures », « 47 recettes ». */
export function counterAmount(counter: DomainCounter, value: number): string {
  if (!counter.unit) {
    const amount = value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
    return `${amount} ${unitLabel(HOURS, value)}`
  }
  return `${formatValue(value, counter.unit)} ${unitLabel(counter.unit, value)}`
}

/** Le nom du compteur, en titre de tuile : « Heures », « Recettes ». */
export function counterName(counter: DomainCounter): string {
  const name = counter.unit ? counter.unit.effective_plural : 'heures'
  return name[0].toUpperCase() + name.slice(1)
}

/** Ce que montre le survol : « Dont 2026 : 31 h ». */
export function counterYear(counter: DomainCounter): string {
  return `Dont ${new Date().getFullYear()} : ${counterAmount(counter, counter.year_total)}`
}

/** Depuis quand il tourne : « Depuis le 3 janv. 2025 ». */
export function counterSince(counter: DomainCounter): string {
  const d = new Date(`${counter.since}T00:00:00`)
  const label = d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return `Depuis le ${d.getDate() === 1 ? label.replace(/^1(?=\s)/, '1er') : label}`
}
