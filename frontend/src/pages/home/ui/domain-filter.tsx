import { ArrowUpRight, Check, ChevronDown, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { type Domain, domainColor, isDomainActive } from '@/entities/domain'
import { CreateDomainDialog } from '@/features/domain/create'
import { cn } from '@/shared/lib/utils'
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/ui'

/**
 * Le filtre de domaines de l'accueil (design #52) — et, depuis que la liste
 * des domaines n'existe plus, l'accès aux domaines.
 *
 * Un bouton menu : recherche, les domaines actifs à cocher (plusieurs à la
 * fois), une flèche au survol d'une ligne pour ouvrir sa page ; en pied, les
 * domaines En veille (des liens : on ne filtre pas sur une piste rangée) et
 * « Nouveau domaine ». Les domaines choisis s'affichent en jetons retirables à
 * gauche du bouton. Aucun choix : tout.
 */
export function DomainFilter({
  domains,
  selected,
  onChange,
}: {
  domains: Domain[]
  selected: readonly string[]
  onChange: (ids: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)

  const q = query.trim().toLowerCase()
  const matches = (d: Domain) => !q || d.name.toLowerCase().includes(q)
  const active = domains.filter((d) => isDomainActive(d) && matches(d))
  const paused = domains.filter((d) => !isDomainActive(d) && matches(d))
  const chips = domains.filter((d) => selected.includes(d.id))

  const toggle = (id: string) =>
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    )

  return (
    <div className="flex min-w-0 items-center gap-2">
      {chips.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1.5">
          {chips.map((d) => (
            <span
              key={d.id}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-md border pr-1.5 pl-2.5 text-xs font-semibold',
                domainColor(d.color).soft,
              )}
            >
              {d.emoji} {d.name}
              <button
                type="button"
                aria-label={`Retirer ${d.name}`}
                onClick={() => toggle(d.id)}
                className="grid size-5 place-items-center rounded hover:bg-background/50"
              >
                <X className="size-3" strokeWidth={2.5} />
              </button>
            </span>
          ))}
        </div>
      )}

      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) setQuery('')
        }}
      >
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="shadow-xs">
            {selected.length > 0
              ? `${selected.length} domaine${selected.length > 1 ? 's' : ''}`
              : 'Tous les domaines'}
            <ChevronDown />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="flex w-[260px] flex-col p-1.5">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un domaine"
            className="mb-1 h-[30px] text-xs"
          />
          <div className="flex max-h-80 flex-col overflow-y-auto">
            {active.map((d) => {
              const on = selected.includes(d.id)
              return (
                <div
                  key={d.id}
                  className="group/row flex h-[30px] items-center gap-2 rounded-md px-1.5 hover:bg-muted"
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(d.id)}
                    className="flex h-full min-w-0 flex-1 items-center gap-2 text-left text-[13px]"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'grid size-3.5 shrink-0 place-items-center rounded',
                        on
                          ? cn(domainColor(d.color).ink, 'text-white')
                          : 'border-[1.5px] border-ring',
                      )}
                    >
                      {on && <Check className="size-2.5" strokeWidth={3.5} />}
                    </span>
                    <span aria-hidden>{d.emoji}</span>
                    <span className="truncate">{d.name}</span>
                  </button>
                  <Link
                    to={`/domains/${d.id}`}
                    aria-label={`Ouvrir ${d.name}`}
                    title={`Ouvrir ${d.name}`}
                    className="grid size-[22px] shrink-0 place-items-center rounded-md bg-card text-muted-foreground opacity-0 shadow-xs group-hover/row:opacity-100 hover:text-foreground focus-visible:opacity-100"
                  >
                    <ArrowUpRight className="size-3" />
                  </Link>
                </div>
              )
            })}
          </div>
          <div className="mt-1 flex flex-col border-t pt-1">
            {paused.length > 0 && (
              <>
                <span className="px-1.5 py-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                  En veille
                </span>
                {paused.map((d) => (
                  <Link
                    key={d.id}
                    to={`/domains/${d.id}`}
                    className="flex h-7 items-center gap-2 rounded-md pr-1.5 pl-7 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <span aria-hidden>{d.emoji}</span>
                    <span className="truncate">{d.name}</span>
                  </Link>
                ))}
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setCreating(true)
              }}
              className="flex h-[30px] items-center gap-1.5 rounded-md px-1.5 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Plus className="size-3.5" />
              Nouveau domaine
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <CreateDomainDialog
        trigger={null}
        open={creating}
        onOpenChange={setCreating}
      />
    </div>
  )
}
