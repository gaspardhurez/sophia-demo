import { Plus } from 'lucide-react'
import { useState } from 'react'

import { type ActivityType, useActivityTypes } from '@/entities/activity-type'
import { type Domain, domainColorValues } from '@/entities/domain'
import { ApiError } from '@/shared/api'
import {
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  toast,
} from '@/shared/ui'

import { NewActivityTypeForm } from './new-activity-type-form'

const fail = (err: unknown) =>
  toast.error(err instanceof ApiError ? err.message : "L'ajout a échoué")

/**
 * « Ajouter une activité type » (#38) : le catalogue du domaine sans celles
 * déjà planifiées, filtré par la recherche, ou « Créer « … » » sur place
 * (emoji et titre). Créer l'activité type l'écrit dans le domaine ; la lier au
 * projet revient à l'appelant (`onPick`).
 *
 * Un projet dans plusieurs domaines (#203) pioche dans leurs catalogues,
 * groupés par domaine, le principal d'abord ; un seul domaine, pas de titre
 * de groupe.
 */
export function AddActivityTypeMenu({
  domains,
  linkedIds,
  onPick,
}: {
  domains: Domain[]
  linkedIds: string[]
  onPick: (activityType: ActivityType) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  // Le titre proposé à la création sur place, ou `null` : la recherche.
  const [creating, setCreating] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  // Toutes, puis celles des domaines du projet : un appel, quel que soit
  // leur nombre.
  const { data: all } = useActivityTypes()
  const catalogue = (all ?? []).filter((t) =>
    domains.some((d) => d.id === t.domain_id),
  )

  const query = q.trim().toLowerCase()
  const options = catalogue
    .filter((t) => !linkedIds.includes(t.id))
    .filter((t) => !query || t.title.toLowerCase().includes(query))
  const groups = domains
    .map((d, i) => ({
      domain: d,
      principal: i === 0,
      items: options.filter((t) => t.domain_id === d.id),
    }))
    .filter((g) => g.items.length > 0)
  const exact = catalogue.some((t) => t.title.toLowerCase() === query)

  function reset(next: boolean) {
    setOpen(next)
    if (!next) {
      setQ('')
      setCreating(null)
    }
  }

  async function add(activityType: ActivityType) {
    await onPick(activityType)
    reset(false)
  }

  async function pick(activityType: ActivityType) {
    if (adding) return
    setAdding(true)
    try {
      await add(activityType)
    } catch (err) {
      fail(err)
    } finally {
      setAdding(false)
    }
  }

  // `modal` : sa liste défile aussi dans la modale de création (cf.
  // `EmojiField`).
  return (
    <Popover modal open={open} onOpenChange={reset}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <Plus className="size-4" /> Ajouter une activité type
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[300px] p-1.5">
        {creating !== null ? (
          <NewActivityTypeForm
            domains={domains}
            initialTitle={creating}
            onCreated={add}
            onCancel={() => setCreating(null)}
          />
        ) : (
          <>
            <Input
              autoFocus
              value={q}
              placeholder="Rechercher ou créer…"
              onChange={(e) => setQ(e.target.value)}
              className="mb-1 h-8"
            />
            <div className="max-h-64 overflow-y-auto">
              {groups.map((g) => (
                <div key={g.domain.id}>
                  {domains.length > 1 && (
                    <div className="flex items-center gap-1.5 px-2 pt-2 pb-0.5 text-[10px] font-semibold tracking-[.05em] text-muted-foreground uppercase">
                      <span
                        aria-hidden
                        className="size-1.5 rounded-full"
                        style={{
                          background: domainColorValues(g.domain.color).base,
                        }}
                      />
                      {g.domain.emoji} {g.domain.name}
                      {g.principal && ' · principal'}
                    </div>
                  )}
                  {g.items.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => void pick(t)}
                      className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] hover:bg-muted"
                    >
                      <span>{t.emoji}</span>
                      <span className="truncate">{t.title}</span>
                    </button>
                  ))}
                </div>
              ))}
              {query && !exact && (
                <button
                  type="button"
                  onClick={() => setCreating(q.trim())}
                  className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] hover:bg-muted"
                >
                  <Plus className="size-3.5" /> Créer « {q.trim()} »
                </button>
              )}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
