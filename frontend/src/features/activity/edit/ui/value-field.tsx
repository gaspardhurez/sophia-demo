import { useEffect, useRef, useState } from 'react'

import {
  formatValue,
  isTimeUnit,
  parseDuration,
  type UnitLike,
} from '@/shared/lib/units'
import { cn } from '@/shared/lib/utils'

/** « 8,06 », « 1 000 » : le nombre tel qu'on le tape, en français. */
function parseNumber(text: string): number | null {
  const raw = text.replace(/\s/g, '').replace(',', '.')
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/**
 * Le champ d'une ligne de Totaux ou de Résultats : un nombre, ou un temps en
 * `mm:ss` si l'unité est une durée (un chrono de métrique). La valeur ne part
 * qu'à la sortie du champ (ou Entrée) ; vidé, il rend `null` — la ligne est
 * retirée.
 *
 * Au repos, le chiffre se lit **sans champ** (#109) : centré, 13 px, 500,
 * large de son contenu. Au survol de sa ligne (`group/line`), le champ paraît
 * (bord, fond) ; en saisie, bord foncé. Vide, il garde son champ pointillé
 * « — ».
 */
export function ValueField({
  value,
  unit,
  onCommit,
  autoFocus,
  className,
  'aria-label': ariaLabel,
}: {
  value: number | null
  unit: UnitLike | null | undefined
  onCommit: (next: number | null) => void
  autoFocus?: boolean
  className?: string
  'aria-label'?: string
}) {
  const shown = value === null ? '' : formatValue(value, unit)
  const [draft, setDraft] = useState(shown)
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    if (!editing) setDraft(shown)
  }, [shown, editing])

  const time = isTimeUnit(unit)
  const read = (text: string) =>
    time ? parseDuration(text, unit) : parseNumber(text)

  // Synchrone, lui : l'état `editing` n'est pas encore à jour quand la ligne
  // se démonte dans la foulée d'un enregistrement — sans ce drapeau, le filet
  // ci-dessous renvoyait la même valeur une seconde fois.
  const open = useRef(false)

  function commit() {
    open.current = false
    setEditing(false)
    const next = read(draft)
    // Une ligne ouverte vide et quittée vide rend quand même `null` : elle
    // tombe (#46).
    if (next === value && value !== null) {
      setDraft(shown)
      return
    }
    onCommit(next)
  }

  // Le panneau se ferme sur le `pointerdown` extérieur, qui le démonte avant
  // que le champ ne perde le focus : sans ce filet, une valeur tapée puis
  // « cliquer à côté » était perdue (même piège que le titre et les notes).
  const pending = useRef<() => void>(() => {})
  pending.current = () => {
    if (!open.current) return
    const next = read(draft)
    if (next !== value) onCommit(next)
  }
  useEffect(() => () => pending.current(), [])

  return (
    <input
      autoFocus={autoFocus}
      value={draft}
      inputMode={time ? 'numeric' : 'decimal'}
      placeholder="—"
      aria-label={ariaLabel}
      onFocus={() => {
        open.current = true
        setEditing(true)
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
      className={cn(
        'h-7 max-w-24 min-w-6 rounded-md border px-1 text-center text-[13px] font-medium tabular-nums outline-none [field-sizing:content] focus:border-solid focus:border-foreground/45 focus:bg-background',
        draft.trim()
          ? 'border-transparent bg-transparent group-hover/line:border-border group-hover/line:bg-background'
          : 'border-dashed border-border bg-background',
        className,
      )}
    />
  )
}
