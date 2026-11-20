import type { ReactNode } from 'react'

import { cn } from '@/shared/lib/utils'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui'

import type { ActivityAct } from '../model/types'
import { LevelChip } from './level-chip'

/** Une option du choix : son titre, ce qu'elle fait, et ce qu'elle déplie
 *  une fois choisie (les séances où reporter). */
export type LearningChoice = {
  title: string
  description?: string
  extra?: ReactNode
}

/**
 * **Décocher** ou **supprimer** une séance qui porte de l'apprentissage
 * (#140, `kit/Retirer seance`) : ce qu'elle porte, avec le niveau de chaque
 * retour, puis un choix — que devient l'apprentissage. Annuler / l'action.
 */
export function LearningChoiceDialog({
  title,
  acts,
  choices,
  value,
  onChange,
  action,
  danger = false,
  pending,
  onConfirm,
  onCancel,
}: {
  title: string
  acts: ActivityAct[]
  choices: LearningChoice[]
  value: number
  onChange: (index: number) => void
  action: string
  danger?: boolean
  pending: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent
        data-activity-ui
        showCloseButton={false}
        className="max-w-[440px] gap-3.5"
      >
        <DialogHeader>
          <DialogTitle className="text-lg">{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-0.5 rounded-[9px] bg-muted/50 px-2.5 py-2">
          {acts.map((a) => (
            <div
              key={a.id}
              className="flex min-h-[26px] items-center gap-2 text-[13px]"
            >
              <span className="w-4 shrink-0 text-center">{actEmoji(a)}</span>
              <span className="min-w-0 flex-1 truncate">{actTitle(a)}</span>
              {a.level && <LevelChip level={a.level} />}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          {choices.map((c, i) => (
            <button
              key={c.title}
              type="button"
              onClick={() => onChange(i)}
              className={cn(
                'flex items-start gap-2.5 rounded-[10px] bg-background px-3 py-2.5 text-left',
                value === i
                  ? 'border-[1.5px] border-foreground'
                  : 'border border-border',
              )}
            >
              <span
                className={cn(
                  'mt-px size-4 shrink-0 rounded-full bg-background',
                  value === i
                    ? 'border-[5px] border-foreground'
                    : 'border-[1.5px] border-muted-foreground/50',
                )}
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[13.5px] font-semibold">{c.title}</span>
                {c.description && (
                  <span className="text-[12.5px] text-pretty text-foreground/75">
                    {c.description}
                  </span>
                )}
                {value === i && c.extra}
              </span>
            </button>
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

/** L'emoji d'une ligne : celui de l'objet, 📓 l'étude, 🧠 l'interro, 🌱 une
 *  pièce générique. */
function actEmoji(a: ActivityAct): string {
  if (a.kind === 'study') return '📓'
  if (a.kind === 'recall') return '🧠'
  if (a.nature) return '🌱'
  return a.item_emoji || '🧺'
}

/** Le titre d'une ligne : l'objet, sinon ce qu'on y fait du savoir. */
function actTitle(a: ActivityAct): string {
  if (a.item_title) return a.item_title
  if (a.kind === 'study') return `Étude · ${a.skill_name}`
  if (a.kind === 'recall') return `Interro · ${a.skill_name}`
  return `${a.nature === 'situation' ? 'Mise en situation' : 'Pratique'} · ${a.skill_name}`
}
