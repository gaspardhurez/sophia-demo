import {
  useDeleteDomain,
  useDomainUsage,
  useDomains,
  type Domain,
  type DomainUsage,
} from '@/entities/domain'
import { describeTies } from '@/entities/project'
import { ApiError } from '@/shared/api'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@/shared/ui'

/** Ce qui part, dans l'ordre de la maquette : chaque objet avec ce qui en
 *  dépend, que la suppression emporte aussi (CASCADE). */
const LINES: {
  key: Exclude<keyof DomainUsage, 'unlinked'>
  one: string
  many: string
}[] = [
  {
    key: 'skills',
    one: 'savoir, avec ses cycles et ses exercices',
    many: 'savoirs, avec leurs cycles et leurs exercices',
  },
  {
    key: 'projects',
    one: 'projet, avec ses objectifs et ses étapes',
    many: 'projets, avec leurs objectifs et leurs étapes',
  },
  {
    key: 'activities',
    one: 'activité, avec ses valeurs et ses relevés',
    many: 'activités, avec leurs valeurs et leurs relevés',
  },
  { key: 'activity_types', one: 'activité type', many: 'activités types' },
  {
    key: 'metrics',
    one: 'métrique, avec ses relevés',
    many: 'métriques, avec leurs relevés',
  },
]

/**
 * Supprimer un domaine (design #51) : la suppression la plus destructrice de
 * l'app, la modale énumère donc en nombres ce qui part — lu au serveur à
 * l'ouverture (`GET /domains/{id}/usage`). Les projets dont il n'est que
 * secondaire (#203) ne partent pas : ils sont déliés, et la modale dit ce
 * qui leur reste et ce qu'ils perdent.
 */
export function DeleteDomainDialog({
  domain,
  open,
  onOpenChange,
  onDeleted,
}: {
  domain: Domain
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Appelé après suppression réussie — c'est l'appelant qui décide où aller. */
  onDeleted?: () => void
}) {
  const deleteDomain = useDeleteDomain()
  const { data: usage } = useDomainUsage(open ? domain.id : null)
  const { data: domains } = useDomains()
  const label = (id: string) => {
    const d = domains?.find((x) => x.id === id)
    return d ? `${d.emoji ?? ''} ${d.name}`.trim() : ''
  }

  async function onConfirm() {
    try {
      await deleteDomain.mutateAsync(domain.id)
      onOpenChange(false)
      toast.success(`Domaine « ${domain.name} » supprimé`)
      onDeleted?.()
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'La suppression a échoué',
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Supprimer « {domain.name} » ?</DialogTitle>
        </DialogHeader>
        <ul className="flex min-h-[110px] flex-col gap-1.5">
          {usage &&
            LINES.map(({ key, one, many }) => (
              <li key={key} className="flex items-baseline gap-2.5 text-[13px]">
                <span className="w-7 text-right font-semibold tabular-nums">
                  {usage[key]}
                </span>
                <span>{usage[key] > 1 ? many : one}</span>
              </li>
            ))}
        </ul>
        {/* Les projets dont il n'est que secondaire (#203, `kit/Delies`) :
            ils restent, et perdent ce qui venait de lui. */}
        {usage && usage.unlinked.length > 0 && (
          <div className="flex flex-col gap-2 border-t pt-3">
            <span className="text-[11px] font-semibold tracking-[.04em] text-muted-foreground uppercase">
              Déliés, pas supprimés
            </span>
            {usage.unlinked.map((p) => {
              const loses = describeTies(p.loses)
              return (
                <div
                  key={p.id}
                  className="flex items-start gap-2.5 text-[13px]"
                >
                  <span className="w-7 text-right">
                    {
                      domains?.find((d) => d.id === p.remaining_domain_ids[0])
                        ?.emoji
                    }
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold">{p.title}</span>
                    <span className="text-xs text-muted-foreground">
                      Reste dans {p.remaining_domain_ids.map(label).join(', ')}{' '}
                      ·{' '}
                      {loses.length > 0
                        ? `perd ${loses.join(', ')} de ${domain.name}`
                        : 'ne perd rien'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleteDomain.isPending}
          >
            Annuler
          </Button>
          <Button
            variant="destructive"
            onClick={() => void onConfirm()}
            isPending={deleteDomain.isPending}
            disabled={!usage}
          >
            Supprimer le domaine
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
