import { ArrowUp, MoreHorizontal, Trash2 } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import {
  DeleteMetricDialog,
  type Metric,
  type MetricFormValues,
  metricToFormValues,
  toMetricPayload,
  useCreateMetric,
  useUpdateMetric,
} from '@/entities/metric'
import { ApiError } from '@/shared/api'
import { cn } from '@/shared/lib/utils'
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  toast,
} from '@/shared/ui'

import { MetricFields } from './metric-fields'

const fail = (err: unknown) =>
  toast.error(
    err instanceof ApiError ? err.message : "L'enregistrement a échoué",
  )

/**
 * Le menu des métriques du domaine (design #27) :
 * recherche, création sur place, options de chaque métrique. Une métrique
 * appartient au domaine ; le projet ne fait que la viser.
 *
 * Créer transforme le menu en formulaire (2c). Les options s'ouvrent à côté de
 * la ligne et s'écrivent au fil de l'eau (2d).
 */
export function MetricMenu({
  metrics,
  domainId,
  domainEmoji,
  value,
  onChange,
  trigger,
}: {
  metrics: Metric[]
  domainId: string
  domainEmoji?: string | null
  value: string | null
  onChange: (metricId: string) => void
  trigger: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<MetricFormValues | null>(null)
  const [optionsFor, setOptionsFor] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Metric | null>(null)
  const create = useCreateMetric(domainId)

  const q = query.trim().toLowerCase()
  const shown = q
    ? metrics.filter((m) => m.name.toLowerCase().includes(q))
    : metrics
  const canCreate =
    q.length > 0 && !metrics.some((m) => m.name.toLowerCase() === q)

  function close() {
    setOpen(false)
    setQuery('')
    setDraft(null)
    setOptionsFor(null)
  }

  function pick(id: string) {
    onChange(id)
    close()
  }

  function startCreate() {
    setDraft({ name: query.trim(), emoji: '', unit_id: null, direction: 'up' })
  }

  async function submit() {
    if (!draft || !draft.name.trim()) return
    try {
      const created = await create.mutateAsync(toMetricPayload(draft))
      pick(created.id)
    } catch (err) {
      fail(err)
    }
  }

  return (
    <>
      {/* `modal` : sa liste défile aussi dans la modale de création (cf.
          `EmojiField`). */}
      <Popover
        modal
        open={open}
        onOpenChange={(o) => (o ? setOpen(true) : close())}
      >
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          align="start"
          className={cn('p-0', draft ? 'w-[256px]' : 'w-[272px]')}
        >
          {draft ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void submit()
              }}
            >
              <MetricFields
                values={draft}
                onChange={(patch) => setDraft({ ...draft, ...patch })}
                autoFocusName={!draft.name}
              />
              <div className="flex justify-end gap-1.5 border-t border-border p-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setDraft(null)}
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  isPending={create.isPending}
                  disabled={!draft.name.trim()}
                >
                  Créer la métrique
                </Button>
              </div>
            </form>
          ) : (
            <>
              <div className="border-b border-border p-2">
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    if (shown[0]) pick(shown[0].id)
                    else if (canCreate) startCreate()
                  }}
                  placeholder="Rechercher ou créer…"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <div className="max-h-64 overflow-y-auto p-1">
                {shown.length > 0 && (
                  <p className="px-2 py-1 text-xs text-muted-foreground">
                    {domainEmoji ? `${domainEmoji} ` : ''}Métriques du domaine
                  </p>
                )}
                {shown.map((m) => (
                  <Popover
                    key={m.id}
                    open={optionsFor === m.id}
                    onOpenChange={(o) => setOptionsFor(o ? m.id : null)}
                  >
                    <div
                      className={cn(
                        'flex h-[30px] items-center gap-2 rounded-md px-2 hover:bg-muted',
                        (value === m.id || optionsFor === m.id) && 'bg-muted',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => pick(m.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
                      >
                        <span className="grid size-4 shrink-0 place-items-center text-[13px]">
                          {m.emoji}
                        </span>
                        <span className="truncate">{m.name}</span>
                        <span className="ml-auto flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
                          {/* L'unité brute, en ligne : pas la pastille. */}
                          {m.unit ? m.unit.name : '—'}
                          <ArrowUp
                            className={cn(
                              'size-3',
                              m.direction === 'down' && 'rotate-180',
                            )}
                          />
                        </span>
                      </button>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Options de ${m.name}`}
                          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                        >
                          <MoreHorizontal className="size-4" />
                        </button>
                      </PopoverTrigger>
                    </div>
                    <PopoverContent
                      side="right"
                      align="start"
                      sideOffset={10}
                      className="w-[300px] p-0"
                    >
                      <MetricOptions
                        metric={m}
                        onDelete={() => {
                          setDeleting(m)
                          close()
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                ))}
                {canCreate && (
                  <button
                    type="button"
                    onClick={startCreate}
                    className="flex h-[30px] w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-muted"
                  >
                    <span className="text-muted-foreground">Créer</span>
                    <span className="font-medium">« {query.trim()} »</span>
                  </button>
                )}
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>

      <DeleteMetricDialog
        metric={deleting}
        onDeleted={() => setDeleting(null)}
        onCancel={() => setDeleting(null)}
      />
    </>
  )
}

/** Les options d'une métrique, écrites au fil de l'eau (2d). */
function MetricOptions({
  metric,
  onDelete,
}: {
  metric: Metric
  onDelete: () => void
}) {
  const update = useUpdateMetric()
  const [values, setValues] = useState(() => metricToFormValues(metric))

  function save(next: MetricFormValues) {
    if (!next.name.trim()) return
    update
      .mutateAsync({ id: metric.id, body: toMetricPayload(next) })
      .catch(fail)
  }

  return (
    <>
      <MetricFields
        values={values}
        onChange={(patch) => {
          const next = { ...values, ...patch }
          setValues(next)
          // Le nom s'écrit quand on le quitte ; le reste, tout de suite.
          if (!('name' in patch)) save(next)
        }}
        onNameCommit={() => {
          if (values.name.trim() !== metric.name) save(values)
        }}
      />
      <div className="border-t border-border p-1">
        <button
          type="button"
          onClick={onDelete}
          className="flex h-[30px] w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="size-3.5" />
          Supprimer la métrique
        </button>
      </div>
    </>
  )
}
