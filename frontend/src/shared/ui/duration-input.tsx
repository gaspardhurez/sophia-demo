import { useEffect, useState } from 'react'

import {
  formatDuration,
  parseDuration,
  type UnitLike,
} from '@/shared/lib/units'
import { cn } from '@/shared/lib/utils'

import { Input } from './input'

interface DurationInputProps {
  /** Valeur dans l'unité (49,5 = 49:30 en minutes). `null` = vide. */
  value: number | null
  onValueChange: (value: number | null) => void
  /** Donne l'échelle : c'est `seconds_per_unit` qui traduit `mm:ss` en nombre. */
  unit: UnitLike | null | undefined
  className?: string
  'aria-label'?: string
}

/**
 * Saisie d'une durée en `mm:ss` — le pendant du `NumberStepper` pour un chrono.
 *
 * Elle existe parce qu'un temps ne se pense pas en décimal : 49:30 se tape
 * « 49:30 », pas « 49,5 ». La conversion est la seule chose que ce champ ajoute ;
 * ce qui remonte au parent est le nombre habituel, dans l'unité.
 *
 * Pas de pas ni de flèches, contrairement au `NumberStepper` : incrémenter un
 * chrono d'une unité n'a pas de sens évident (une seconde ? une minute ?), et le
 * geste réel est de retaper le temps lu sur la montre.
 *
 * Le brouillon est local le temps de la frappe — « 49: » n'est pas une durée, et
 * ce serait invivable de le refuser à chaque caractère. La valeur ne remonte que
 * lorsqu'elle est lisible, et le champ se remet au propre en le quittant.
 */
export function DurationInput({
  value,
  onValueChange,
  unit,
  className,
  'aria-label': ariaLabel,
}: DurationInputProps) {
  const [draft, setDraft] = useState(() =>
    value === null ? '' : formatDuration(value, unit),
  )
  const [editing, setEditing] = useState(false)

  // Resynchronise sur un changement externe (chargement, annulation), sans
  // écraser une frappe en cours.
  useEffect(() => {
    if (!editing) setDraft(value === null ? '' : formatDuration(value, unit))
  }, [value, unit, editing])

  return (
    <Input
      value={draft}
      inputMode="numeric"
      placeholder="mm:ss"
      aria-label={ariaLabel}
      className={cn('h-8 w-24 text-sm tabular-nums', className)}
      onFocus={() => setEditing(true)}
      onChange={(e) => {
        const next = e.currentTarget.value
        setDraft(next)
        if (!next.trim()) {
          onValueChange(null)
          return
        }
        const parsed = parseDuration(next, unit)
        if (parsed !== null) onValueChange(parsed)
      }}
      onBlur={() => {
        setEditing(false)
        const parsed = parseDuration(draft, unit)
        setDraft(parsed === null ? '' : formatDuration(parsed, unit))
        onValueChange(parsed)
      }}
    />
  )
}
