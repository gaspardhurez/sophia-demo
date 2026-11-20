import type { ReactNode } from 'react'

import { cn } from '@/shared/lib/utils'

interface EmptyStateProps {
  /** Ce qui manque, en une phrase. */
  children: ReactNode
  /** Action de sortie : le bouton qui crée le premier élément. */
  action?: ReactNode
  className?: string
}

/**
 * État vide.
 *
 * Encadré pointillé plutôt qu'une phrase grise posée dans le vide : le
 * pointillé dit « il y a une place ici, elle attend quelque chose », là où un
 * paragraphe seul se lit comme une erreur.
 */
export function EmptyState({ children, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-6 text-center',
        className,
      )}
    >
      <p className="text-sm text-muted-foreground">{children}</p>
      {action}
    </div>
  )
}
