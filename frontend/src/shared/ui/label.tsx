import * as React from 'react'
import { Label as LabelPrimitive } from 'radix-ui'

import { cn } from '@/shared/lib/utils'

/**
 * Libellé de champ : 12px semi-gras sur `foreground`.
 *
 * Petit-gras au-dessus de grand-normal (le champ est en 14px) — c'est cette
 * alternance de taille, répétée, qui donne son rythme à un formulaire. À taille
 * égale, libellé et valeur se disputent l'attention.
 */
function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'flex items-center gap-1.5 font-heading text-xs leading-none font-semibold text-foreground select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

/** Astérisque de champ obligatoire — discret, il informe sans alerter. */
function RequiredMark() {
  return (
    <span aria-hidden className="font-normal text-muted-foreground">
      *
    </span>
  )
}

export { Label, RequiredMark }
