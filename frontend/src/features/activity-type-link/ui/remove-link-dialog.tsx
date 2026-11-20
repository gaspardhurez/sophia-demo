import { useState } from 'react'

import { type ActivityTypeLink } from '@/entities/activity-type'
import { type Total, totalUnit } from '@/entities/project'
import { ApiError } from '@/shared/api'
import { fmtShortDate } from '@/shared/lib/date'
import { unitLabel } from '@/shared/lib/units'
import { cn } from '@/shared/lib/utils'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@/shared/ui'

import { RadioChoice } from './radio-choice'

export type RemoveChoice = 'domain' | 'remove' | 'delete'
type Choice = RemoveChoice

const fr = (n: number) =>
  n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })

/**
 * « Retirer « … » ? » (#37, §7 ; `kit/Activites types`) — ouverte par la
 * corbeille du popover. Trois choix pour un lien planifié (retirer et
 * continuer dans le domaine, retirer, supprimer l'activité type), deux pour
 * une Manuelle. Le tableau dit ce que le choix emporte : ce qui est posé
 * reste toujours ; un Total qui ne comptait qu'elle est supprimé.
 */
export function RemoveLinkDialog({
  totals,
  link,
  onConfirm,
  onClose,
}: {
  /** Les Totaux du projet : ceux qui ne comptaient que ce lien partent. */
  totals: Total[]
  /** Le lien à retirer ; `null` ferme la modale. */
  link: ActivityTypeLink | null
  /** Fait le retrait — en base sur la page, dans le brouillon du formulaire. */
  onConfirm: (choice: RemoveChoice) => Promise<void>
  onClose: () => void
}) {
  const manual = link?.planning === 'manual'
  const initial: Choice = manual
    ? 'remove'
    : link?.preserve_after
      ? 'domain'
      : 'remove'
  const [choice, setChoice] = useState<Choice | null>(null)
  const current = choice ?? initial
  const [isPending, setPending] = useState(false)

  function close() {
    setChoice(null)
    onClose()
  }

  async function confirm() {
    if (!link) return
    setPending(true)
    try {
      await onConfirm(current)
      close()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "L'action a échoué")
    } finally {
      setPending(false)
    }
  }

  const emptied = link
    ? totals.filter(
        (t) =>
          t.activity_type_ids.length === 1 &&
          t.activity_type_ids[0] === link.activity_type_id &&
          !t.learning_sessions,
      )
    : []
  const name = link ? `${link.emoji ? `${link.emoji} ` : ''}${link.title}` : ''
  const rows = [
    ...emptied.map((t) => ({
      key: 'Total',
      value: `${fr(t.target)} ${unitLabel(totalUnit(t), t.target)} sur ${name}`,
      outcome: 'Supprimé',
      tone: 'danger' as const,
    })),
    ...(!manual && link?.posed_until
      ? [
          {
            key: 'Posées',
            value: `Jusqu'au ${fmtShortDate(new Date(`${link.posed_until}T00:00:00`))}`,
            outcome: 'Restent',
            tone: 'neutral' as const,
          },
        ]
      : []),
    ...(current === 'domain'
      ? [
          {
            key: 'Ensuite',
            value: 'Dans le domaine',
            outcome: 'Continue',
            tone: 'ink' as const,
          },
        ]
      : []),
    ...(current === 'delete'
      ? [
          {
            key: 'Ailleurs',
            value: 'Tous les projets',
            outcome: 'Retirée',
            tone: 'danger' as const,
          },
        ]
      : []),
  ]

  return (
    <Dialog open={link !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Retirer « {link?.title} » ?</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2" role="radiogroup">
          {!manual && (
            <RadioChoice
              checked={current === 'domain'}
              onSelect={() => setChoice('domain')}
              label="Retirer du projet, continuer dans le domaine"
            />
          )}
          <RadioChoice
            checked={current === 'remove'}
            onSelect={() => setChoice('remove')}
            label="Retirer du projet"
          />
          <RadioChoice
            checked={current === 'delete'}
            onSelect={() => setChoice('delete')}
            label="Supprimer l'activité type"
          />
        </div>
        {rows.length > 0 && (
          <ul className="grid">
            {rows.map((r, i) => (
              <li
                key={`${r.key}-${i}`}
                className="flex h-[34px] items-center gap-2.5 border-t border-border/70"
              >
                <span className="w-20 shrink-0 text-[10px] font-semibold tracking-[.05em] text-muted-foreground uppercase">
                  {r.key}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  {r.value}
                </span>
                <span
                  className={cn(
                    'shrink-0 text-[13px] font-medium',
                    r.tone === 'danger' && 'text-destructive',
                    r.tone === 'neutral' && 'text-muted-foreground',
                  )}
                >
                  {r.outcome}
                </span>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={isPending}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            isPending={isPending}
            onClick={() => void confirm()}
          >
            {current === 'delete' ? 'Supprimer' : 'Retirer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
