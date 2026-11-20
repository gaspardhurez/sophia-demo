import type { ComponentProps } from 'react'

import { cn } from '@/shared/lib/utils'

/**
 * Bloc de remplacement pendant le chargement.
 *
 * À composer pour reproduire la structure réelle de l'écran, pas à poser seul :
 * un squelette qui n'a pas la forme du contenu final fait sauter la page au
 * moment où les données arrivent — soit exactement ce qu'il devait éviter.
 */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  )
}

/** Bandeau de chargement générique, annoncé aux lecteurs d'écran. */
export function SkeletonRegion({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      role="status"
      aria-busy
      aria-label="Chargement"
      className={className}
      {...props}
    />
  )
}
