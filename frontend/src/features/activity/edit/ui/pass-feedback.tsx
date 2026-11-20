import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
} from '@/shared/ui'
import { MessageSquarePlus } from 'lucide-react'
import { useState } from 'react'

import { LEVELS, levelLabel } from '@/entities/activity'
import { cn } from '@/shared/lib/utils'

/**
 * Le **retour d'une passe** dans le panneau (#139, `kit/Pieces savoir`) : sur
 * une séance faite, chaque ligne de Pratique ou de Mise en situation prend un
 * niveau sur 5 et une note. Sans retour, la bulle paraît au survol de la
 * ligne ; avec, la chip « 4/5 » au bout et la note dessous — un clic sur le
 * bloc rouvre la saisie.
 */

/** La bulle « + » juste après le nom, au survol de la ligne. */
export function FeedbackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      title="Ajouter un retour"
      aria-label="Ajouter un retour"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="grid size-5 shrink-0 place-items-center rounded-[5px] text-muted-foreground opacity-0 group-hover/read:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"
    >
      <MessageSquarePlus className="size-3.5" />
    </button>
  )
}

/** La note du retour, sous la ligne. */
export function FeedbackNote({ text }: { text: string }) {
  return (
    <p className="mb-0.5 ml-[23px] text-xs leading-[1.4] text-pretty text-foreground/70">
      {text}
    </p>
  )
}

/** La saisie : cinq boutons, le libellé du niveau, la note, Annuler / OK.
 *  Le niveau est facultatif (un second clic le retire) ; OK demande un
 *  niveau ou une note. */
export function FeedbackEditor({
  level: initialLevel,
  feedback: initialNote,
  pending,
  onCancel,
  onSave,
}: {
  level: number | null
  feedback: string | null
  pending: boolean
  onCancel: () => void
  onSave: (level: number | null, feedback: string) => void
}) {
  const [level, setLevel] = useState(initialLevel ?? 0)
  const [hover, setHover] = useState(0)
  const [note, setNote] = useState(initialNote ?? '')
  const shown = hover || level

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="mt-1 mb-1.5 ml-[23px] flex cursor-default flex-col gap-1.5 rounded-lg bg-muted/50 p-2"
    >
      <div className="grid grid-cols-5 gap-[3px]">
        {LEVELS.map((l, i) => {
          const n = i + 1
          return (
            <button
              key={n}
              type="button"
              title={`${levelLabel(n)} — ${l.meaning}`}
              onClick={() => setLevel(level === n ? 0 : n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              className={cn(
                'h-7 rounded-md text-[13px] font-semibold',
                level === n
                  ? 'bg-emerald-800 text-white'
                  : 'border bg-background text-foreground/70 hover:bg-muted',
              )}
            >
              {n}
            </button>
          )
        })}
      </div>
      <span className="min-h-4 text-xs font-semibold">
        {shown ? levelLabel(shown) : ''}
      </span>
      <Textarea
        rows={2}
        value={note}
        placeholder="Comment ça s'est passé ?"
        onChange={(e) => setNote(e.target.value)}
        className="min-h-0 resize-none bg-background px-2 py-1.5 text-[12.5px]"
      />
      <div className="flex justify-end gap-1.5">
        <Button variant="ghost" size="xs" onClick={onCancel}>
          Annuler
        </Button>
        <Button
          size="xs"
          disabled={!level && !note.trim()}
          isPending={pending}
          onClick={() => onSave(level || null, note)}
        >
          OK
        </Button>
      </div>
    </div>
  )
}

/** Retirer une passe qui a un retour : il part avec elle, on le confirme. */
export function RemoveRatedDialog({
  title,
  level,
  feedback,
  pending,
  onConfirm,
  onCancel,
}: {
  title: string
  level: number | null
  feedback: string | null
  pending: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent
        data-activity-ui
        showCloseButton={false}
        className="max-w-[400px]"
      >
        <DialogHeader>
          <DialogTitle className="text-lg">
            Retirer « {title} » de la séance ?
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm leading-normal text-foreground/80">
          Son retour est supprimé :{' '}
          {[level ? levelLabel(level) : null, feedback && `« ${feedback} »`]
            .filter(Boolean)
            .join(', ')}
          .
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Annuler
          </Button>
          <Button variant="destructive" isPending={pending} onClick={onConfirm}>
            Retirer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
