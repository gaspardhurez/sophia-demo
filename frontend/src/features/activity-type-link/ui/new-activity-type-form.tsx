import { useState } from 'react'

import {
  type ActivityType,
  useCreateActivityType,
} from '@/entities/activity-type'
import { type Domain, domainColorValues } from '@/entities/domain'
import { ApiError } from '@/shared/api'
import { cn } from '@/shared/lib/utils'
import { Button, EmojiField, Input, toast } from '@/shared/ui'

const fail = (err: unknown) =>
  toast.error(err instanceof ApiError ? err.message : "L'ajout a échoué")

/**
 * Créer une activité type sur place (#38) : emoji et titre, dans le domaine.
 * La lier au projet revient à l'appelant (`onCreated`) — « Ajouter une
 * activité type » et le « + » des créneaux d'apprentissage (#83).
 *
 * Un projet dans plusieurs domaines (#203) : l'activité type appartient à
 * l'un d'eux, qu'on choisit par une puce — le principal par défaut.
 */
export function NewActivityTypeForm({
  domains,
  initialTitle = '',
  onCreated,
  onCancel,
}: {
  /** Les domaines où elle peut naître, le principal en tête. */
  domains: Domain[]
  initialTitle?: string
  onCreated: (activityType: ActivityType) => Promise<void>
  onCancel: () => void
}) {
  const [emoji, setEmoji] = useState('')
  const [title, setTitle] = useState(initialTitle)
  const [domainId, setDomainId] = useState(domains[0]?.id)
  const [linking, setLinking] = useState(false)
  const create = useCreateActivityType()

  async function submit() {
    if (!title.trim() || !domainId) return
    try {
      const created = await create.mutateAsync({
        domain_id: domainId,
        title: title.trim(),
        emoji: emoji || null,
        fallback_active: false,
        fallback_planning: 'weekly',
      })
      setLinking(true)
      await onCreated(created)
    } catch (err) {
      fail(err)
    } finally {
      setLinking(false)
    }
  }

  return (
    <div className="grid gap-2 p-1">
      <div className="flex gap-1.5">
        <EmojiField
          value={emoji}
          onChange={setEmoji}
          className="w-10 shrink-0"
        />
        <Input
          autoFocus
          value={title}
          placeholder="Titre"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          className="h-9"
        />
      </div>
      {domains.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <span className="font-heading text-xs font-semibold">Domaine</span>
          <div className="flex flex-wrap gap-1.5">
            {domains.map((d) => {
              const on = d.id === domainId
              const c = domainColorValues(d.color)
              return (
                <button
                  key={d.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDomainId(d.id)}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium',
                    on ? 'text-foreground' : 'bg-card text-muted-foreground',
                  )}
                  style={
                    on ? { borderColor: c.base, background: c.soft } : undefined
                  }
                >
                  {d.emoji} {d.name}
                </button>
              )
            })}
          </div>
        </div>
      )}
      <div className="flex justify-end gap-1.5">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Annuler
        </Button>
        <Button
          size="sm"
          disabled={!title.trim()}
          isPending={create.isPending || linking}
          onClick={() => void submit()}
        >
          Créer
        </Button>
      </div>
    </div>
  )
}
