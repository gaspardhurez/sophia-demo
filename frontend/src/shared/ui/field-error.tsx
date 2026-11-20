import { cn } from '@/shared/lib/utils'

/**
 * Message d'erreur sous un champ.
 *
 * Même corps que le libellé (12px) : une erreur signale, elle ne hurle pas.
 * Ne rend rien si `message` est vide — appelable sans condition côté formulaire.
 */
export function FieldError({
  message,
  className,
}: {
  message?: string
  className?: string
}) {
  if (!message) return null
  return (
    <p className={cn('mt-0.5 text-xs text-destructive', className)}>
      {message}
    </p>
  )
}
