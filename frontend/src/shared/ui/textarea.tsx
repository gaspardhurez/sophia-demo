import * as React from 'react'

import { cn } from '@/shared/lib/utils'

/** Même grammaire que `Input` : surface blanche, bordure qui fonce, pas de halo. */
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content max-h-64 min-h-16 w-full resize-y overflow-y-auto rounded-lg border border-input bg-card px-3 py-2 text-base outline-none',
        'transition-[border-color] duration-300',
        'placeholder:text-muted-foreground placeholder:transition-opacity placeholder:duration-200',
        'hover:border-ring',
        'focus:border-foreground/45 focus:placeholder:opacity-0',
        'disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60',
        'aria-invalid:border-destructive hover:aria-invalid:border-destructive focus:aria-invalid:border-destructive',
        'md:text-sm',
        'dark:bg-input/30 dark:disabled:bg-input/80',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
