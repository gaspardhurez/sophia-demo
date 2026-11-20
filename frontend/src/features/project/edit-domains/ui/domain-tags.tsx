import { GripVertical, X } from 'lucide-react'
import { type CSSProperties, useState } from 'react'

import { type Domain, domainColor, domainColorValues } from '@/entities/domain'
import { cn } from '@/shared/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui'

import { moveDomain, rankLabel, toggleDomain } from '../model/order'

/**
 * Les domaines d'un projet en étiquettes (#203, `kit/Domaines`). La première
 * est le **principal** — teinte pleine, « · principal ». On réordonne en
 * glissant (la poignée paraît au survol) : l'origine reste un creux
 * pointillé, une ligne à l'encre du domaine glissé marque où il tombera ;
 * déposé en tête, il devient principal, rien d'autre ne change. La croix au
 * survol retire un domaine (jamais le dernier). « + Domaine » ouvre la liste
 * à choix multiple.
 *
 * Contrôlée : `onRemove` laisse l'appelant confirmer un retrait qui délie ;
 * sans lui, retirer passe par `onChange`.
 */
export function DomainTags({
  domains,
  value,
  onChange,
  onRemove,
}: {
  /** Tous les domaines qu'on peut choisir. */
  domains: Domain[]
  /** Les domaines du projet, le principal en tête. */
  value: string[]
  onChange: (ids: string[]) => void
  onRemove?: (id: string) => void
}) {
  const [drag, setDrag] = useState<string | null>(null)
  const [target, setTarget] = useState<string | null>(null)
  const byId = new Map(domains.map((d) => [d.id, d]))
  const dragged = drag ? byId.get(drag) : undefined
  const remove = (id: string) =>
    onRemove ? onRemove(id) : onChange(toggleDomain(value, id))
  const end = () => {
    setDrag(null)
    setTarget(null)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((id, i) => {
        const d = byId.get(id)
        if (!d) return null
        const c = domainColorValues(d.color)
        const held = drag === id
        return (
          <span
            key={id}
            draggable={value.length > 1}
            title={
              i === 0
                ? 'Domaine principal · glisser pour réordonner'
                : 'Glisser en tête pour en faire le principal'
            }
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move'
              setDrag(id)
            }}
            onDragOver={(e) => {
              if (!drag) return
              e.preventDefault()
              setTarget(id)
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (drag && drag !== id) onChange(moveDomain(value, drag, id))
              end()
            }}
            onDragEnd={end}
            className={cn(
              'group/tag relative inline-flex h-[26px] items-center gap-[5px] rounded-md border pr-1.5 pl-2 text-xs font-medium transition-opacity',
              domainColor(d.color).text,
              value.length > 1 && 'cursor-grab',
              held &&
                'border-dashed border-muted-foreground/50 !bg-transparent',
            )}
            style={
              {
                background: `color-mix(in oklab, ${c.base} ${i === 0 ? 35 : 12}%, transparent)`,
                borderColor: held
                  ? undefined
                  : `color-mix(in oklab, ${c.base} ${i === 0 ? 70 : 40}%, transparent)`,
              } as CSSProperties
            }
          >
            {drag && target === id && !held && (
              <span
                aria-hidden
                className="absolute inset-y-0.5 -left-[5px] w-0.5 rounded-full"
                style={{
                  background: domainColorValues(dragged?.color).ink,
                }}
              />
            )}
            {value.length > 1 && (
              <GripVertical
                aria-hidden
                className={cn(
                  'size-3 shrink-0 transition-all duration-150',
                  drag
                    ? '-mr-[5px] w-0 opacity-0'
                    : '-mr-[5px] w-0 opacity-0 group-hover/tag:mr-0 group-hover/tag:w-3 group-hover/tag:opacity-55',
                )}
              />
            )}
            <span className={cn(held && 'invisible')}>{d.emoji}</span>
            <span className={cn(held && 'invisible')}>{d.name}</span>
            {i === 0 && (
              <span
                className={cn(
                  'text-[11px] font-semibold opacity-70',
                  held && 'invisible',
                )}
              >
                · principal
              </span>
            )}
            {value.length > 1 && (
              <button
                type="button"
                aria-label={`Retirer ${d.name}`}
                onClick={() => remove(id)}
                className={cn(
                  'grid h-[18px] place-items-center overflow-hidden rounded-[4px] transition-all duration-150 hover:bg-foreground/10',
                  drag
                    ? '-ml-[5px] w-0 opacity-0'
                    : '-ml-[5px] w-0 opacity-0 group-hover/tag:ml-0 group-hover/tag:w-[18px] group-hover/tag:opacity-100 focus-visible:ml-0 focus-visible:w-[18px] focus-visible:opacity-100',
                )}
              >
                <X className="size-3" strokeWidth={2.5} />
              </button>
            )}
          </span>
        )
      })}
      {/* `modal` : dans la modale de création, le verrou de défilement du
          Dialog bloquerait la molette sur la liste, portée hors de lui (cf.
          `EmojiField`). */}
      <Popover modal>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex h-[26px] items-center gap-1 rounded-md border border-dashed px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            + Domaine
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[220px] p-1">
          <DomainChoices
            domains={domains}
            value={value}
            onPick={(id) =>
              value.includes(id) ? remove(id) : onChange([...value, id])
            }
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

/**
 * La liste à choix multiple des domaines : le principal dit « Principal »,
 * les autres choisis « ✓ ». Partagée par « + Domaine » et la tuile de la
 * création.
 */
export function DomainChoices({
  domains,
  value,
  onPick,
}: {
  domains: Domain[]
  value: string[]
  onPick: (id: string) => void
}) {
  return (
    <div className="scrollbar-quiet flex max-h-[min(20rem,var(--radix-popover-content-available-height))] flex-col overflow-y-auto">
      {domains.map((d) => (
        <button
          key={d.id}
          type="button"
          onClick={() => onPick(d.id)}
          className={cn(
            // `shrink-0` : dans la colonne bornée, une ligne garde sa hauteur
            // et la liste défile au lieu de se tasser.
            'flex h-8 shrink-0 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-muted',
            value.includes(d.id) && 'bg-muted',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'grid size-[22px] shrink-0 place-items-center rounded-md border text-[13px]',
              domainColor(d.color).soft,
            )}
          >
            {d.emoji}
          </span>
          <span className="flex-1 truncate">{d.name}</span>
          <span className="text-[11px] text-muted-foreground">
            {rankLabel(value, d.id)}
          </span>
        </button>
      ))}
    </div>
  )
}
