import type { ReactNode } from 'react'

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui'

/**
 * La forme des modales qui reviennent sur un cycle (design #67) : un titre en
 * question, ce qui se passe en lignes à puce, Annuler / l'action.
 */
export function ConfirmDialog({
  title,
  lines,
  action,
  danger,
  pending,
  onConfirm,
  onCancel,
}: {
  title: string
  lines: { mark: string; text: ReactNode }[]
  action: string
  /** Rouge (supprimer) plutôt que l'encre (revenir). */
  danger?: boolean
  pending: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent showCloseButton={false} className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-lg">{title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-1.5">
          {lines.map((l, i) => (
            <div
              key={i}
              className="flex items-start gap-2 text-[13px] leading-[1.45] text-pretty text-muted-foreground"
            >
              <span className="w-4 shrink-0 text-center">{l.mark}</span>
              <span className="min-w-0">{l.text}</span>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Annuler
          </Button>
          <Button
            variant={danger ? 'destructive' : 'default'}
            isPending={pending}
            onClick={onConfirm}
          >
            {action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
