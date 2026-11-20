import { DOMAIN_STATUS_META, type DomainStatus } from '../model/status'
import { cn } from '@/shared/lib/utils'
import { Chip } from '@/shared/ui'

/**
 * Pastille de statut d'un domaine — gabarit `Chip` habituel, ton neutre, plus
 * un point de couleur.
 *
 * Le ton ne change pas d'un statut à l'autre : « en veille » n'est ni une
 * alerte ni un échec, c'est un rangement. Seul le point le dit, et le texte
 * s'estompe. Une chip ambre entière crierait un problème qui n'existe pas.
 *
 * Présentation pure : le geste qui change le statut vit dans
 * `features/domain/set-status`.
 */
export function DomainStatusChip({
  status,
  className,
}: {
  status: DomainStatus
  className?: string
}) {
  const meta = DOMAIN_STATUS_META[status]
  return (
    <Chip
      tone="neutral"
      className={cn(
        // Un cran au-dessus du gabarit par défaut : elle accompagne un titre de
        // page, pas une ligne de carte. À `text-xs` elle passait sous la taille
        // des chips de projet alors qu'elle voisine un texte trois fois plus
        // grand — elle se lisait comme une note de bas de page.
        'gap-1.5 px-2.5 py-1 text-sm',
        status === 'paused' && 'opacity-80',
        className,
      )}
    >
      <span aria-hidden className={cn('size-2 rounded-full', meta.dot)} />
      {meta.label}
    </Chip>
  )
}
