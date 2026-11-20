import { type ReactNode, useEffect, useRef } from 'react'

import { useResourceNotes, useResources } from '@/entities/resource'
import { Skeleton, SkeletonRegion } from '@/shared/ui'

import { ResourceSheet } from './resource-sheet'

/**
 * Une ressource ouverte **à la place des notes** (#173, `prod/Notes`,
 * « Une ressource ouverte ») : la page la montre quand l'URL porte
 * `?ressource=<id>`, et `onClose` retire ce paramètre (✕, « Notes » de la
 * colonne).
 *
 * Ici, on charge : la ressource parmi celles **du savoir** (une ressource
 * d'un autre savoir n'est pas trouvée), puis ses notes. La feuille
 * (`ResourceSheet`) ne naît qu'avec les deux, l'éditeur partant de son
 * contenu initial.
 *
 * Une ressource introuvable : un message et le retour aux notes. Une
 * ressource qui **disparaît** pendant qu'on la lit (retirée ici ou depuis
 * « Modifier la ressource ») referme la vue d'elle-même.
 */
export function ResourceView({
  skillId,
  resourceId,
  crumbs,
  onClose,
  reviewAsked,
  onReviewTaken,
  onReviewingChange,
}: {
  skillId: string
  resourceId: string
  crumbs: ReactNode
  onClose: () => void
  /** Cf. `ResourceSheet` : la demande de vérifier venue de la colonne. */
  reviewAsked: boolean
  onReviewTaken: () => void
  onReviewingChange: (busy: boolean) => void
}) {
  const { data: resources, error } = useResources(skillId)
  const resource = resources?.find((r) => r.id === resourceId)
  const { data: notes, error: notesError } = useResourceNotes(resource?.id)

  // Vue une fois puis absente de la liste : elle vient d'être retirée.
  const seen = useRef(false)
  if (resource) seen.current = true
  const gone = !!resources && !resource
  useEffect(() => {
    if (gone && seen.current) onClose()
  }, [gone, onClose])

  const bar = (
    <div className="mx-auto flex h-11 w-full max-w-[912px] items-center gap-2.5 px-26 text-[13px] text-muted-foreground max-[700px]:px-6">
      {crumbs}
    </div>
  )

  if (error || notesError || (gone && !seen.current)) {
    return (
      <>
        {bar}
        <div className="mx-auto flex w-full max-w-[912px] flex-col items-start gap-3 px-26 pt-[54px] text-sm text-muted-foreground max-[700px]:px-6">
          <p>
            {gone
              ? "Cette ressource n'existe pas ou a été retirée."
              : 'Impossible de charger cette ressource.'}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer font-medium text-foreground underline-offset-4 hover:underline"
          >
            Revenir aux notes
          </button>
        </div>
      </>
    )
  }

  if (!resource || !notes) {
    return (
      <>
        {bar}
        <SkeletonRegion>
          <div className="mx-auto flex w-full max-w-[912px] flex-col gap-4 px-26 pt-9 pb-[30vh] max-[700px]:px-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-11 rounded-[10px]" />
              <Skeleton className="h-8 w-72" />
            </div>
            <Skeleton className="h-3 w-48" />
            <Skeleton className="mt-6 h-40 w-full" />
          </div>
        </SkeletonRegion>
      </>
    )
  }

  return (
    <ResourceSheet
      skillId={skillId}
      resource={resource}
      doc={notes.doc}
      crumbs={crumbs}
      onClose={onClose}
      reviewAsked={reviewAsked}
      onReviewTaken={onReviewTaken}
      onReviewingChange={onReviewingChange}
    />
  )
}
