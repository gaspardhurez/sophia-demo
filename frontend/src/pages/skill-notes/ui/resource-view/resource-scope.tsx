import { Check, Plus } from 'lucide-react'
import { useState } from 'react'

import {
  parseScope,
  pickCycle,
  usePlans,
  useSetPlanResourceScopeParts,
} from '@/entities/plan'
import { ApiError } from '@/shared/api'
import { cn } from '@/shared/lib/utils'
import { toast } from '@/shared/ui'

/** Une étiquette, au gabarit du Périmètre de l'en-tête (26 px, #176). */
const TAG =
  'inline-flex h-[26px] max-w-full items-center gap-1 rounded-full px-2.5 text-[13px]'
/** Liée : foncée, comme une partie cochée de « Cadrer l'étude ». */
const LINKED = 'bg-foreground text-background'
/** Non liée : blanche bordée, comme les étiquettes de l'en-tête. */
const UNLINKED =
  'bg-card text-foreground/65 shadow-[inset_0_0_0_1px_var(--border)] hover:text-foreground hover:shadow-[inset_0_0_0_1px_var(--ring)]'

/**
 * « Périmètre » (30/10), sous « Section(s) concernée(s) » : les parties du
 * périmètre du cycle que **cette ressource couvre** (`scope_parts` de son
 * lien au cycle), en étiquettes.
 *
 * - Le cycle est celui des notes (`pickCycle`). Sans cycle, sans partie
 *   retenue au périmètre, ou pour une ressource hors de l'étude du cycle :
 *   la ligne n'apparaît pas.
 * - **Replié** (par défaut) : seules les parties liées, foncées ; un clic
 *   sur elles déplie. Sans lien : « + Lier au périmètre », discret, comme
 *   les « + Ajouter » de l'en-tête.
 * - **Déplié** : toutes les parties retenues, dans l'ordre du périmètre —
 *   liée foncée et cochée, non liée blanche bordée ; **un clic lie ou
 *   délie**. « Moins » (ou Échap) replie.
 * - Le cache suit avant la réponse ; un échec rend l'état d'avant et le
 *   dit dans un toast.
 *
 * Les liens suivent le périmètre : renommer une partie dans l'en-tête les
 * emporte, la supprimer (ou la passer hors du cycle) les défait — c'est le
 * serveur qui s'en charge.
 */
export function ResourceScope({
  skillId,
  resourceId,
}: {
  skillId: string
  resourceId: string
}) {
  const { data: plans } = usePlans(skillId)
  const plan = pickCycle(plans ?? [], null)
  const setParts = useSetPlanResourceScopeParts(skillId)
  const [open, setOpen] = useState(false)

  const parts = parseScope(plan?.scope)
    .filter((t) => t.inCycle)
    .map((t) => t.label)
  const entry = plan?.resources.find((r) => r.resource_id === resourceId)
  if (!plan || !entry || !parts.length) return null
  const planId = plan.id
  // Un lien vers une partie disparue ne s'affiche pas (le serveur les
  // retire ; le cache peut avoir un temps de retard).
  const linked = parts.filter((p) => entry.scope_parts.includes(p))

  function toggle(part: string) {
    const next = linked.includes(part)
      ? linked.filter((p) => p !== part)
      : parts.filter((p) => p === part || linked.includes(p))
    setParts.mutate(
      { planId, resourceId, scopeParts: next },
      {
        onError: (err) =>
          toast.error(
            err instanceof ApiError
              ? err.message
              : "Le lien au périmètre n'a pas pu s'enregistrer",
          ),
      },
    )
  }

  let body
  if (open)
    body = (
      <>
        {parts.map((part) => {
          const on = linked.includes(part)
          return (
            <button
              key={part}
              type="button"
              aria-pressed={on}
              title={part}
              onClick={() => toggle(part)}
              className={cn(TAG, 'cursor-pointer', on ? LINKED : UNLINKED)}
            >
              {on && <Check className="size-3 shrink-0" strokeWidth={3} />}
              <span className="truncate">{part}</span>
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-[26px] cursor-pointer px-1 text-[13px] text-muted-foreground underline decoration-border underline-offset-[3px] hover:text-foreground"
        >
          Moins
        </button>
      </>
    )
  else if (linked.length)
    body = (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Lier ou délier des parties du périmètre"
        className="flex min-w-0 cursor-pointer flex-wrap gap-1.5 rounded-[14px] text-left"
      >
        {linked.map((part) => (
          <span key={part} title={part} className={cn(TAG, LINKED)}>
            <span className="truncate">{part}</span>
          </span>
        ))}
      </button>
    )
  else
    body = (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-ml-1.5 inline-flex h-[26px] cursor-pointer items-center gap-[5px] rounded-[5px] px-1.5 text-[13px] text-muted-foreground/80 hover:bg-foreground/5 hover:text-foreground"
      >
        <Plus className="size-3" />
        Lier au périmètre
      </button>
    )

  return (
    <div
      className="flex items-start gap-2.5 text-[13px]"
      onKeyDown={(e) => {
        if (open && e.key === 'Escape') {
          // Pas plus haut : Échap ne ferme pas la ressource.
          e.stopPropagation()
          setOpen(false)
        }
      }}
    >
      <span className="shrink-0 leading-[26px] text-muted-foreground">
        Périmètre
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">{body}</div>
    </div>
  )
}
