import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui'

/** Fermer avec des saisies (design #33) : on confirme avant de tout perdre. */
export function AbandonCreationDialog({
  open,
  title,
  pending,
  onStay,
  onAbandon,
}: {
  open: boolean
  title: string
  pending: boolean
  onStay: () => void
  onAbandon: () => void
}) {
  const name = title.trim()
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onStay()}>
      <DialogContent showCloseButton={false} className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-base">
            Abandonner la création ?
          </DialogTitle>
          <DialogDescription className="leading-normal text-pretty">
            {name
              ? `« ${name} » n'est pas encore créé. Ce que tu as saisi sera perdu.`
              : "Le projet n'est pas encore créé. Ce que tu as saisi sera perdu."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            className="text-xs font-semibold"
            onClick={onStay}
          >
            Continuer la saisie
          </Button>
          <Button
            variant="destructive"
            className="text-xs font-semibold"
            isPending={pending}
            onClick={onAbandon}
          >
            Abandonner
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
