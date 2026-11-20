import * as React from 'react'

import { cn } from '@/shared/lib/utils'

/**
 * Champ texte.
 *
 * Trois partis pris :
 * - fond `card` (blanc) et non `transparent` — sur une page off-white, le champ
 *   est une *surface*, pas un trait posé sur rien ;
 * - pas de halo de focus (`ring-3`) : on fonce simplement la bordure. Le halo
 *   shadcn par défaut est bruyant et signe l'interface non customisée ;
 * - le placeholder s'efface au focus. Personne ne le remarque, tout le monde
 *   le ressent.
 */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-9 w-full min-w-0 rounded-lg border border-input bg-card px-3 py-1 text-base outline-none',
        // 300ms plutôt que les 150ms par défaut : plus lent se lit comme délibéré.
        'transition-[border-color] duration-300',
        'placeholder:text-muted-foreground placeholder:transition-opacity placeholder:duration-200',
        'hover:border-ring',
        // Focus un cran plus sombre que le hover, pour rester distinguable au clavier.
        'focus:border-foreground/45 focus:placeholder:opacity-0',
        'file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60',
        'aria-invalid:border-destructive hover:aria-invalid:border-destructive focus:aria-invalid:border-destructive',
        'md:text-sm',
        'dark:bg-input/30 dark:disabled:bg-input/80',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
