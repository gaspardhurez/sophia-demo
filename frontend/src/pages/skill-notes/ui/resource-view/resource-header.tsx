import { ArrowUpRight, Pencil, Trash2, X } from 'lucide-react'
import { useState } from 'react'

import {
  type Resource,
  resourceEmoji,
  resourceHref,
  useDeleteResource,
} from '@/entities/resource'
import { EditResourceDialog } from '@/features/resource/edit'
import { ApiError } from '@/shared/api'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  toast,
} from '@/shared/ui'

const ICON_BUTTON =
  'grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground'

/**
 * L'en-tête d'une ressource ouverte (#173, `prod/Notes`) : sa tuile, son
 * titre, ↗ (son lien dans un nouvel onglet — seulement si elle en a un), ⋯ et
 * ✕ (retour aux notes).
 *
 * ⋯ : **Modifier la ressource** (le dialogue de toujours, `features/resource/
 * edit`) et **Retirer la ressource**, en rouge. Retirer demande confirmation
 * **sur place**, sous l'en-tête — « Retirer « titre » et ses notes ? » quand
 * ses notes portent du texte (`hasNotes`, lu à ce moment-là) : elles partent
 * avec elle. Échap renonce.
 */
export function ResourceHeader({
  resource,
  hasNotes,
  onClose,
}: {
  resource: Resource
  hasNotes: () => boolean
  onClose: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  const remove = useDeleteResource(resource.skill_id)
  const href = resourceHref(resource.reference)

  async function onRemove() {
    try {
      await remove.mutateAsync(resource.id)
      onClose()
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : 'La ressource n’a pas été retirée',
      )
    }
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-[10px] border bg-muted text-[22px]"
        >
          {resourceEmoji(resource)}
        </span>
        <h1 className="min-w-0 flex-1 font-heading text-[28px] leading-[1.2] font-bold tracking-[-0.02em] text-pretty">
          {resource.title}
        </h1>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Ouvrir dans un nouvel onglet"
            title="Ouvrir dans un nouvel onglet"
            className={ICON_BUTTON}
          >
            <ArrowUpRight className="size-[15px]" />
          </a>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Plus" className={ICON_BUTTON}>
              {/* Trois points pleins, comme la maquette. */}
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden
              >
                <circle cx="5" cy="12" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="19" cy="12" r="1.8" />
              </svg>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[220px] text-[13px]">
            <DropdownMenuItem onSelect={() => setEditing(true)}>
              <Pencil className="size-3.5" /> Modifier la ressource
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive"
              onSelect={() =>
                setConfirm(
                  hasNotes()
                    ? `Retirer « ${resource.title} » et ses notes ?`
                    : `Retirer « ${resource.title} » ?`,
                )
              }
            >
              <Trash2 className="size-3.5" /> Retirer la ressource
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          aria-label="Fermer"
          title="Revenir aux notes"
          onClick={onClose}
          className={ICON_BUTTON}
        >
          <X className="size-[15px]" />
        </button>
      </div>
      {confirm && (
        <div
          role="alertdialog"
          aria-label="Retirer la ressource"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setConfirm(null)
          }}
          className="flex max-w-[520px] flex-col gap-2.5 rounded-[10px] border px-3.5 py-3"
        >
          <span className="text-[13.5px] font-medium text-pretty">
            {confirm}
          </span>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-[13px] font-medium"
              autoFocus
              onClick={() => setConfirm(null)}
            >
              Annuler
            </Button>
            <Button
              size="sm"
              className="bg-destructive text-[13px] font-medium text-white hover:bg-destructive/90"
              isPending={remove.isPending}
              onClick={() => void onRemove()}
            >
              Retirer
            </Button>
          </div>
        </div>
      )}
      {editing && (
        <EditResourceDialog
          resource={resource}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  )
}
