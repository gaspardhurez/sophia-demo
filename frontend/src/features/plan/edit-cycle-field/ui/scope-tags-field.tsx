import { Plus, X } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'

import {
  type AcquisitionPlan,
  formatScope,
  parseScope,
  scopeLabel,
  useUpdatePlan,
} from '@/entities/plan'
import { ApiError } from '@/shared/api'
import { cn } from '@/shared/lib/utils'
import { toast } from '@/shared/ui'

/** Une étiquette : blanche, bordée, 26 px (`prod/Notes`, #176). */
const TAG =
  'inline-flex h-[26px] max-w-full items-center rounded-full bg-card px-2.5 text-[13px] shadow-[inset_0_0_0_1px_var(--border)]'
/** L'écart entre deux étiquettes (`gap-1.5`), pour la mesure du repli. */
const GAP = 6

/**
 * Le **Périmètre** du cycle en étiquettes, écrit en place (#176, `prod/Notes`,
 * idéation `Perimetre entete` 2b) — en tête des notes, à la place du texte
 * libre.
 *
 * - Le périmètre reste un texte (`scope`) : chaque partie retenue est une
 *   étiquette (`parseScope`) ; les **bords** (« Hors de ce cycle : … ») ne
 *   s'affichent pas, mais se gardent à chaque écriture. Un périmètre écrit à
 *   la main se lit ligne à ligne : une ligne, une étiquette (tronquée si elle
 *   déborde, le texte entier en infobulle) ; une modification le réécrit au
 *   format du cadrage.
 * - **Repli sur deux lignes** : ce qui tient sur deux lignes, puis « n
 *   autres » ; déplié, « Moins ». La mesure se fait sur un double invisible
 *   de la liste, à la largeur de l'encart, et se refait quand elle change.
 * - **Un clic renomme** (Entrée ou quitter le champ enregistre, Échap
 *   renonce ; vide = supprimer) — le renommage part avec le texte
 *   (`scope_renames`) : les ressources liées à la partie la suivent (30/10) ;
 *   une partie supprimée perd ses liens. ✕ au survol supprime ; « + » en pointillé
 *   ajoute, une fois tout déplié. Sans périmètre : « + Ajouter », comme
 *   l'Intention.
 * - Un échec le dit dans un toast : le cycle reste la seule vérité.
 */
export function ScopeTagsField({ plan }: { plan: AcquisitionPlan }) {
  const update = useUpdatePlan()
  // Le périmètre affiché pendant l'envoi : celui qu'on vient d'écrire.
  const pending =
    update.isPending &&
    update.variables?.id === plan.id &&
    'scope' in update.variables.body
  const scope = pending
    ? ((update.variables!.body.scope as string | null | undefined) ?? null)
    : (plan.scope ?? null)
  const tags = parseScope(scope)
  const kept = tags.filter((t) => t.inCycle).map((t) => t.label)
  const outside = tags.filter((t) => !t.inCycle)

  const [open, setOpen] = useState(false)
  // L'étiquette qu'on écrit : son rang (`kept.length` : une nouvelle).
  const [editing, setEditing] = useState<number | null>(null)
  const [value, setValue] = useState('')
  // Échap : le blur qui suit ne doit rien écrire.
  const cancelled = useRef(false)

  // Combien d'étiquettes tiennent sur deux lignes, « n autres » compris.
  const probe = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(Infinity)
  const key = kept.join('\n')
  useLayoutEffect(() => {
    const el = probe.current
    if (!el) return
    const measure = () => {
      const items = [...el.children] as HTMLElement[]
      const link = items.pop()
      if (!link || !items.length) return setFit(Infinity)
      const rows = [...new Set(items.map((t) => t.offsetTop))].sort(
        (a, b) => a - b,
      )
      if (rows.length <= 2) return setFit(Infinity)
      let n = items.filter((t) => t.offsetTop <= rows[1]).length
      // « n autres » se pose après la dernière étiquette gardée, sur la
      // deuxième ligne : on en retire tant qu'il n'y tient pas.
      while (
        n > 1 &&
        items[n - 1].offsetTop === rows[1] &&
        items[n - 1].offsetLeft +
          items[n - 1].offsetWidth +
          GAP +
          link.offsetWidth >
          el.clientWidth
      )
        n--
      setFit(n)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [key])

  function save(labels: string[], rename?: { from: string; to: string }) {
    const next = formatScope([
      ...labels.map((label) => ({ label, inCycle: true })),
      ...outside,
    ])
    // Rien n'a changé : un périmètre écrit à la main n'est pas reformaté.
    if (next === formatScope(tags)) return
    update
      .mutateAsync({
        id: plan.id,
        // Le renommage part avec le texte : les ressources liées à la
        // partie la suivent (sans lui, le serveur défait leurs liens).
        body: { scope: next, ...(rename && { scope_renames: [rename] }) },
      })
      .catch((err) =>
        toast.error(
          err instanceof ApiError
            ? err.message
            : "Le périmètre n'a pas pu s'enregistrer",
        ),
      )
  }

  function start(i: number, text: string) {
    cancelled.current = false
    setEditing(i)
    setValue(text)
  }

  function commit() {
    if (editing === null) return
    const at = editing
    setEditing(null)
    if (cancelled.current) return
    const label = scopeLabel(value)
    const labels = [...kept]
    if (at >= labels.length) {
      if (label) labels.push(label)
    } else if (label) {
      labels[at] = label
      if (label !== kept[at]) return save(labels, { from: kept[at], to: label })
    } else labels.splice(at, 1)
    save(labels)
  }

  function add() {
    setOpen(true)
    start(kept.length, '')
  }

  if (!kept.length && editing === null)
    return (
      <button
        type="button"
        onClick={add}
        className="-ml-1.5 inline-flex h-[22px] cursor-pointer items-center gap-[5px] self-start rounded-[5px] px-1.5 text-[13px] text-muted-foreground/80 hover:bg-foreground/5 hover:text-foreground"
      >
        <Plus className="size-3" />
        Ajouter
      </button>
    )

  const folded = !open && fit < kept.length
  const shown = folded ? kept.slice(0, fit) : kept

  const input = (
    <input
      aria-label="Partie du périmètre"
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          // Pas plus haut : Échap ne ferme rien d'autre.
          e.preventDefault()
          e.stopPropagation()
          cancelled.current = true
          e.currentTarget.blur()
        }
      }}
      style={{ width: `${Math.max(6, value.length + 2)}ch` }}
      className="h-[26px] max-w-full rounded-full bg-card px-2.5 text-[13px] shadow-[inset_0_0_0_1.5px_var(--foreground)] outline-none"
    />
  )

  return (
    <div className="relative min-w-0">
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {shown.map((label, i) =>
          editing === i ? (
            <span key={`${i}-${label}`} className="inline-flex max-w-full">
              {input}
            </span>
          ) : (
            <span
              key={`${i}-${label}`}
              className={cn(
                TAG,
                'group/tag gap-0.5 hover:pr-1 hover:shadow-[inset_0_0_0_1px_var(--ring)] focus-within:pr-1',
              )}
            >
              <button
                type="button"
                title={label}
                onClick={() => start(i, label)}
                className="min-w-0 cursor-text truncate text-left outline-none"
              >
                {label}
              </button>
              <button
                type="button"
                aria-label={`Retirer « ${label} » du périmètre`}
                title="Supprimer"
                onClick={() => save(kept.filter((_, j) => j !== i))}
                className="hidden size-[18px] shrink-0 cursor-pointer place-items-center rounded-full text-foreground/60 group-focus-within/tag:grid group-hover/tag:grid hover:bg-foreground/[0.06] hover:text-foreground"
              >
                <X className="size-2.5" strokeWidth={2.6} />
              </button>
            </span>
          ),
        )}
        {editing !== null && editing >= kept.length && (
          <span className="inline-flex max-w-full">{input}</span>
        )}
        {fit < kept.length && (
          <button
            type="button"
            onClick={() => {
              setOpen((o) => !o)
              setEditing(null)
            }}
            className="h-[26px] cursor-pointer px-1 text-[13px] text-muted-foreground underline decoration-border underline-offset-[3px] hover:text-foreground"
          >
            {folded ? `${kept.length - fit} autres` : 'Moins'}
          </button>
        )}
        {!folded && editing === null && (
          <button
            type="button"
            onClick={add}
            aria-label="Ajouter au périmètre"
            title="Ajouter au périmètre"
            className="grid size-[26px] cursor-pointer place-items-center rounded-full border border-dashed border-foreground/25 text-muted-foreground hover:bg-card hover:text-foreground"
          >
            <Plus className="size-3" strokeWidth={2.2} />
          </button>
        )}
      </div>
      {/* Le double invisible qui mesure le repli : toutes les étiquettes, à
          la même largeur, puis le plus long « n autres ». */}
      <div
        ref={probe}
        aria-hidden
        className="pointer-events-none invisible absolute inset-x-0 top-0 flex flex-wrap gap-1.5"
      >
        {kept.map((label, i) => (
          <span key={i} className={TAG}>
            <span className="truncate">{label}</span>
          </span>
        ))}
        <span className="h-[26px] px-1 text-[13px]">{kept.length} autres</span>
      </div>
    </div>
  )
}
