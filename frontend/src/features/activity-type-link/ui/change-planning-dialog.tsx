import { useState } from 'react'

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui'

import { RadioChoice } from './radio-choice'

/** « lundi 5 oct. » — le lendemain de ce qui est posé. */
function dayAfter(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + 1)
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  })
}

/**
 * « Changer la planification de « … » ? » (#37, §7) — pour tout changement
 * d'un lien qui a déjà posé des jours à venir : planification, jours ou
 * créneau. Conserver l'existant (défaut) ou Repartir de zéro.
 */
export function ChangePlanningDialog({
  title,
  posedUntil,
  isPending,
  onConfirm,
  onCancel,
}: {
  /** Titre de l'activité type ; `null` ferme la modale. */
  title: string | null
  posedUntil: string | null
  isPending?: boolean
  onConfirm: (reset: boolean) => void
  onCancel: () => void
}) {
  const [reset, setReset] = useState(false)
  return (
    <Dialog
      open={title !== null}
      onOpenChange={(open) => {
        if (!open) {
          setReset(false)
          onCancel()
        }
      }}
    >
      <DialogContent className="max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Changer la planification de « {title} » ?</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2" role="radiogroup">
          <RadioChoice
            checked={!reset}
            onSelect={() => setReset(false)}
            label="Conserver l'existant"
            detail={
              posedUntil
                ? `Ce qui est posé reste. À partir du ${dayAfter(posedUntil)}.`
                : 'Ce qui est posé reste.'
            }
          />
          <RadioChoice
            checked={reset}
            onSelect={() => setReset(true)}
            label="Repartir de zéro"
            detail="Ce qui est posé à partir de demain est remplacé."
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Annuler
          </Button>
          <Button
            isPending={isPending}
            onClick={() => {
              onConfirm(reset)
              setReset(false)
            }}
          >
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
