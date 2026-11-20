import { type ReactNode, useState } from 'react'

import {
  DomainForm,
  DOMAIN_COLORS,
  toDomainPayload,
  useCreateDomain,
  useDomains,
  type DomainFormValues,
} from '@/entities/domain'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  toast,
} from '@/shared/ui'

export function CreateDomainDialog({
  trigger,
  open: openProp,
  onOpenChange,
}: {
  /** Le déclencheur ; `null` : aucun, la modale est pilotée par `open`. */
  trigger?: ReactNode | null
  /** Ouverture pilotée par l'appelant (le menu des domaines de l'accueil). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [openState, setOpenState] = useState(false)
  const open = openProp ?? openState
  const setOpen = (next: boolean) => {
    setOpenState(next)
    onOpenChange?.(next)
  }
  const createDomain = useCreateDomain()
  const { data: domains } = useDomains()
  // Couleur par défaut « fraîche » : on tourne selon le nombre de domaines.
  const defaultColor =
    DOMAIN_COLORS[(domains?.length ?? 0) % DOMAIN_COLORS.length].key

  async function onSubmit(values: DomainFormValues) {
    try {
      const domain = await createDomain.mutateAsync(toDomainPayload(values))
      setOpen(false)
      toast.success(`Domaine « ${domain.name} » créé`)
    } catch {
      toast.error('La création a échoué')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger !== null && (
        <DialogTrigger asChild>
          {trigger ?? <Button>Nouveau domaine</Button>}
        </DialogTrigger>
      )}
      <DialogContent size="wide">
        <DialogHeader>
          <DialogTitle>Nouveau domaine</DialogTitle>
          <DialogDescription>
            Un champ dans lequel tu veux progresser.
          </DialogDescription>
        </DialogHeader>
        <DomainForm
          submitLabel="Créer"
          onSubmit={onSubmit}
          onCancel={() => setOpen(false)}
          defaultValues={{
            name: '',
            emoji: '',
            color: defaultColor,
            vision: '',
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
