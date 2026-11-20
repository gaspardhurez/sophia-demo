import { Check } from 'lucide-react'

import {
  DOMAIN_STATUS_META,
  DOMAIN_STATUSES,
  DomainStatusChip,
  type Domain,
  type DomainStatus,
  useUpdateDomain,
} from '@/entities/domain'
import { ApiError } from '@/shared/api'
import { cn } from '@/shared/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  toast,
} from '@/shared/ui'

/**
 * La chip de statut, rendue cliquable : elle est aussi le geste.
 *
 * L'information se lit ici — autant que la changer se fasse au même endroit,
 * sans chercher (menu ouvert sous la chip, design #51). Deux entrées, pas de
 * confirmation : mettre en veille ne détruit rien et se défait d'un clic.
 */
export function DomainStatusMenu({ domain }: { domain: Domain }) {
  const update = useUpdateDomain()

  async function choose(status: DomainStatus) {
    if (status === domain.status) return
    try {
      await update.mutateAsync({ id: domain.id, body: { status } })
      toast.success(
        status === 'paused'
          ? `${domain.name} passe en veille`
          : `${domain.name} redevient actif`,
      )
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Échec')
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Changer le statut du domaine"
          // `inline-flex` et `leading-none` : le trigger vit dans le <h1> de la
          // page et hérite donc de son `text-3xl`. Sa boîte de ligne faisait
          // 36 px pour une chip de 22, qui se posait sur la ligne de base — d'où
          // une pastille visiblement décalée sous le nom du domaine.
          className="inline-flex items-center rounded-[3px] leading-none transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <DomainStatusChip status={domain.status} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {DOMAIN_STATUSES.map((status) => (
          <DropdownMenuItem key={status} onSelect={() => choose(status)}>
            <span
              aria-hidden
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                DOMAIN_STATUS_META[status].dot,
              )}
            />
            <span className="flex-1">{DOMAIN_STATUS_META[status].label}</span>
            {status === domain.status && (
              <Check className="size-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
