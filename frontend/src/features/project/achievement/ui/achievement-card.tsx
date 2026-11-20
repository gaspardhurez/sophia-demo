import { Trash2 } from 'lucide-react'
import { useState } from 'react'

import {
  type Achievement,
  ObjectiveCheck,
  ObjectiveFrame,
  ObjectiveLabel,
  type Project,
  useCreateAchievement,
  useDeleteAchievement,
  useUpdateAchievement,
} from '@/entities/project'
import { ApiError } from '@/shared/api'
import { fmtShortDate } from '@/shared/lib/date'
import { cn } from '@/shared/lib/utils'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmojiField,
  toast,
} from '@/shared/ui'

const fail = (err: unknown) =>
  toast.error(
    err instanceof ApiError ? err.message : "L'enregistrement a échoué",
  )

/**
 * Une Réalisation en **lecture** (design #27) : la coche de l'en-tête est le
 * geste même de l'axe — on coche le jour où c'est fait, et la carte le date.
 */
export function AchievementCardRead({
  achievement,
  inkClassName,
  softClassName,
  hoverClassName,
  closed = false,
}: {
  achievement: Achievement
  /** Projet clos : une réalisation non faite porte l'anneau rouge à croix. */
  closed?: boolean
  inkClassName: string
  /** `domainColor(...).softHover` — la coche sous le pointeur. */
  hoverClassName: string
  /** `domainColor(...).soft` — le fond de la tuile emoji. */
  softClassName: string
}) {
  const update = useUpdateAchievement()
  return (
    <ObjectiveFrame>
      <div className="flex items-center gap-[9px]">
        <ObjectiveCheck
          done={achievement.done}
          failed={closed}
          inkClassName={inkClassName}
          hoverClassName={hoverClassName}
          label={achievement.done ? 'Décocher' : 'Cocher : c’est fait'}
          onToggle={() =>
            update
              .mutateAsync({
                id: achievement.id,
                body: { done: !achievement.done },
              })
              .catch(fail)
          }
        />
        <ObjectiveLabel>Réalisation</ObjectiveLabel>
        {achievement.done && achievement.done_at && (
          <span className="ml-auto text-[13px] text-muted-foreground tabular-nums">
            {fmtShortDate(new Date(achievement.done_at))}
          </span>
        )}
      </div>
      <div className="my-auto flex items-center gap-2.5">
        <span
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-[9px] border-0 text-[19px]',
            softClassName,
          )}
        >
          {achievement.emoji || '🎯'}
        </span>
        <span className="text-[13px] leading-[1.4] text-pretty">
          {achievement.title}
        </span>
      </div>
    </ObjectiveFrame>
  )
}

/**
 * Une Réalisation en **édition** : emoji et intitulé, sur place. Sans
 * `achievement`, c'est une carte neuve — écrite dès qu'elle a un intitulé.
 */
export function AchievementCardEdit({
  project,
  achievement,
  onDiscard,
}: {
  project: Project
  achievement?: Achievement
  onDiscard?: () => void
}) {
  const create = useCreateAchievement()
  const update = useUpdateAchievement()
  const remove = useDeleteAchievement()
  const [title, setTitle] = useState(achievement?.title ?? '')
  const [emoji, setEmoji] = useState(achievement?.emoji ?? '')
  const [confirming, setConfirming] = useState(false)

  async function save(next: { title?: string; emoji?: string }) {
    const t = (next.title ?? title).trim()
    const e = next.emoji ?? emoji
    if (!t) return
    const body = { title: t, emoji: e || null }
    try {
      if (achievement) await update.mutateAsync({ id: achievement.id, body })
      else {
        await create.mutateAsync({ projectId: project.id, body })
        onDiscard?.()
      }
    } catch (err) {
      fail(err)
    }
  }

  const step = achievement?.step_id
    ? project.steps.find((s) => s.id === achievement.step_id)
    : undefined

  async function onDelete() {
    if (!achievement) return onDiscard?.()
    // Posée sur une étape : on dit laquelle perd sa réalisation.
    if (step && !confirming) return setConfirming(true)
    try {
      await remove.mutateAsync({ id: achievement.id })
      setConfirming(false)
    } catch (err) {
      fail(err)
    }
  }

  return (
    // Une carte neuve n'a pas de survol et garde sa corbeille en vue.
    <ObjectiveFrame className={achievement ? 'hover:border-ring' : undefined}>
      <div className="flex items-center gap-[9px]">
        <ObjectiveLabel editing>Réalisation</ObjectiveLabel>
        <button
          type="button"
          onClick={() => void onDelete()}
          aria-label="Retirer cet objectif"
          className={cn(
            'ml-auto grid size-6 place-items-center rounded-md text-red-700 transition-opacity hover:bg-red-50',
            achievement && 'opacity-0 group-hover/card:opacity-100',
          )}
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <EmojiField
          value={emoji || undefined}
          onChange={(v) => {
            setEmoji(v ?? '')
            void save({ emoji: v ?? '' })
          }}
          aria-label="Emoji de la réalisation"
          // Un bouton nu dans la phrase, pas un champ : ni bord ni fond.
          className="size-7 shrink-0 border-0 bg-transparent text-[15px] hover:bg-muted"
        />
        <input
          value={title}
          autoFocus={!achievement}
          placeholder="Intitulé"
          aria-label="Intitulé de la réalisation"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => void save({ title })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          className="min-w-0 flex-[1_1_200px] border-0 border-b-[1.5px] border-dashed border-ring bg-transparent text-sm font-medium outline-none focus:border-foreground"
        />
      </div>

      {achievement && step && (
        <Dialog open={confirming} onOpenChange={setConfirming}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Supprimer « {achievement.emoji ? `${achievement.emoji} ` : ''}
                {achievement.title} » ?
              </DialogTitle>
            </DialogHeader>
            <p className="flex h-[34px] items-center gap-2.5">
              <span className="w-24 shrink-0 text-[10px] font-semibold uppercase tracking-[.05em] text-muted-foreground">
                Étape {step.order}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
                {step.title}
              </span>
            </p>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Annuler
              </Button>
              <Button
                variant="ghost"
                className="bg-destructive/10 text-destructive hover:bg-destructive/15"
                onClick={() => void onDelete()}
              >
                Supprimer l'objectif
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </ObjectiveFrame>
  )
}
