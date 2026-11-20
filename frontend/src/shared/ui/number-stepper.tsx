import { ChevronDown, ChevronUp } from 'lucide-react'
import { useEffect, useState } from 'react'

import { cn } from '@/shared/lib/utils'

interface NumberStepperProps {
  /** Valeur courante (source de vérité). `null` = champ vide. */
  value: number | null
  /** Émis à chaque frappe et à chaque pas (remonte l'état au parent). */
  onValueChange: (value: number | null) => void
  /** Émis au blur et à chaque pas — pour persister sans réagir à la frappe. */
  onCommit?: (value: number | null) => void
  min?: number
  step?: number
  placeholder?: string
  className?: string
  'aria-label'?: string
}

/** Champ numérique stylisé : chevrons custom, sans spinner natif, borné `min`. */
export function NumberStepper({
  value,
  onValueChange,
  onCommit,
  min = 0,
  step = 1,
  placeholder = '0',
  className,
  'aria-label': ariaLabel,
}: NumberStepperProps) {
  // Brouillon local : autorise l'état vide / transitoire pendant la frappe.
  const [draft, setDraft] = useState(value?.toString() ?? '')

  // Resynchronise sur un vrai changement externe (chargement, undo…) sans
  // écraser une frappe en cours équivalente (ex. « 1. » que Number rendrait 1).
  useEffect(() => {
    setDraft((d) => {
      const current = d === '' ? null : Number(d)
      return current === value ? d : (value?.toString() ?? '')
    })
  }, [value])

  function bump(delta: number) {
    const base = draft === '' ? 0 : Number(draft)
    const next = Math.max(min, Math.round((base + delta) * 100) / 100)
    setDraft(String(next))
    onValueChange(next)
    onCommit?.(next)
  }

  return (
    <div
      className={cn(
        // Contrôle bas-bruit : transparent au repos (il vit le plus souvent
        // dans un cadre parent), le cadre se révèle au survol, et le focus
        // fonce d'un cran de plus — c'est ce dernier étage qui manquait.
        'flex items-center rounded-md border border-transparent transition-[border-color] duration-300',
        'hover:border-input focus-within:border-ring',
        className,
      )}
    >
      <input
        type="number"
        min={min}
        inputMode="decimal"
        aria-label={ariaLabel}
        value={draft}
        onChange={(e) => {
          const v = e.target.value
          if (v !== '' && Number(v) < min) return
          setDraft(v)
          onValueChange(v === '' ? null : Number(v))
        }}
        onBlur={() => onCommit?.(draft === '' ? null : Number(draft))}
        placeholder={placeholder}
        className="h-7 w-12 bg-transparent px-1 text-center tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <div className="flex flex-col pr-0.5 text-muted-foreground">
        <button
          type="button"
          aria-label="Augmenter"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => bump(step)}
          className="hover:text-foreground"
        >
          <ChevronUp className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Diminuer"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => bump(-step)}
          className="hover:text-foreground"
        >
          <ChevronDown className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
