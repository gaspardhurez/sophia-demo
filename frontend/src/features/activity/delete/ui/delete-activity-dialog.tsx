import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui'
import { useState } from 'react'

import {
  type Activity,
  LearningChoiceDialog,
  useActivities,
} from '@/entities/activity'
import { toLocalISO } from '@/shared/lib/date'
import { cn } from '@/shared/lib/utils'

import {
  carriedActs,
  type PendingDeletion,
} from '../model/use-activity-deletion'
import { DeletionLines, MeasuresLostNote } from './deletion-lines'

const s = (n: number) => (n > 1 ? 's' : '')

interface DeleteActivityDialogProps {
  /** `null` = fermée. Non nulle, elle porte déjà ce qui va disparaître. */
  pending: PendingDeletion | null
  isPending: boolean
  /** `carryTo` : la séance où reporter l'apprentissage (#140). */
  onConfirm: (carryTo?: Activity) => void
  onCancel: () => void
}

/**
 * Confirmation de suppression d'une séance **qui porte quelque chose**.
 *
 * Elle n'apparaît jamais pour une séance vide : le hook tranche avant, et une
 * modale posée à chaque suppression cesserait d'être lue.
 *
 * Elle **énumère les relevés plutôt que de les compter** (`DeletionLines`).
 * C'est tout l'objet de cette modale — depuis le CASCADE, ces valeurs ne
 * survivent plus à la séance.
 */
export function DeleteActivityDialog({
  pending,
  isPending,
  onConfirm,
  onCancel,
}: DeleteActivityDialogProps) {
  // Seuls les relevés qui comptent s'annoncent : une cible (séance non faite)
  // n'a rien mesuré, elle part avec la séance sans rien faire perdre.
  const values = (pending?.values ?? []).filter((v) => v.counts)

  // Une séance qui porte de l'apprentissage : que devient-il (#140) ?
  if (pending && carriedActs(pending.activity).length > 0)
    return (
      <LearningDeletion
        key={pending.activity.id}
        activity={pending.activity}
        measures={values.length}
        isPending={isPending}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )

  return (
    <Dialog open={pending !== null} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Supprimer{' '}
            {pending ? `« ${pending.activity.title} »` : 'cette séance'} ?
          </DialogTitle>
          <DialogDescription>
            Cette séance porte des données saisies. Elles partent avec elle.
          </DialogDescription>
        </DialogHeader>

        {pending && <DeletionLines pending={pending} />}
        <MeasuresLostNote count={values.length} />

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isPending}
          >
            Annuler
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => onConfirm()}
            disabled={isPending}
          >
            Supprimer
            {values.length > 0 &&
              ` (${values.length} relevé${s(values.length)})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Le nombre de séances proposées au report. */
const CARRY_CHOICES = 4

/**
 * Supprimer une séance qui porte de l'apprentissage (#140, `kit/Retirer
 * seance`) : ne pas reporter (ses passes et leurs retours partent avec
 * elle), ou reporter sur une des prochaines séances à faire du domaine.
 */
function LearningDeletion({
  activity,
  measures,
  isPending,
  onConfirm,
  onCancel,
}: {
  activity: Activity
  measures: number
  isPending: boolean
  onConfirm: (carryTo?: Activity) => void
  onCancel: () => void
}) {
  const [choice, setChoice] = useState(0)
  const [target, setTarget] = useState(0)
  const [now] = useState(() => new Date())
  const { data: upcoming } = useActivities({
    domainId: activity.domain_id,
    start: toLocalISO(now),
    end: toLocalISO(new Date(now.getTime() + 60 * 86_400_000)),
  })
  const candidates = (upcoming ?? [])
    .filter((a) => a.id !== activity.id && !a.done && a.start_at)
    .sort((a, b) => a.start_at!.localeCompare(b.start_at!))
    .slice(0, CARRY_CHOICES)
  const carryTo = choice === 1 ? candidates[target] : undefined

  return (
    <LearningChoiceDialog
      title={`Supprimer « ${activity.title} » ?`}
      acts={carriedActs(activity)}
      choices={[
        {
          title: 'Ne pas reporter',
          description:
            (measures > 0
              ? `Leurs passes et leurs retours disparaissent avec la séance, comme ses ${measures} relevé${s(measures)}.`
              : 'Leurs passes et leurs retours disparaissent avec la séance.') +
            (carriedActs(activity).some((x) => x.kind === 'recall')
              ? " L'interro reste due à son jour, sans séance."
              : ''),
        },
        {
          title: 'Reporter sur une autre séance',
          description:
            candidates.length === 0 ? 'Aucune séance à venir.' : undefined,
          extra: candidates.length > 0 && (
            <span className="mt-1.5 flex flex-wrap gap-1">
              {candidates.map((a, i) => (
                <span
                  key={a.id}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation()
                    setTarget(i)
                  }}
                  className={cn(
                    'inline-flex h-[26px] items-center rounded-md px-2.5 text-xs',
                    target === i
                      ? 'bg-foreground text-background'
                      : 'border bg-background',
                  )}
                >
                  {dayOf(a)} · {a.title}
                </span>
              ))}
            </span>
          ),
        },
      ]}
      value={choice}
      onChange={setChoice}
      action="Supprimer"
      danger
      pending={isPending}
      onConfirm={() => {
        if (choice === 1 && !carryTo) return
        onConfirm(carryTo)
      }}
      onCancel={onCancel}
    />
  )
}

/** « mar. 15 ». */
function dayOf(a: Activity): string {
  return new Date(a.start_at!).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
  })
}
