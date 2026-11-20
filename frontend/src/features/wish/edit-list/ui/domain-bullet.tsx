import { Check, Plus } from 'lucide-react'

import type { Domain } from '@/entities/domain'
import { cn } from '@/shared/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui'

/**
 * La puce d'une envie ou d'un engagement (#215) : l'emoji de son domaine, un
 * point gris sans domaine. Au survol de la ligne (ou menu ouvert), elle
 * devient un bouton de 20 px — « + » en pointillé sans domaine, l'emoji
 * bordé avec — qui ouvre le menu des domaines.
 */
export function DomainBullet({
  domainId,
  domains,
  onChange,
}: {
  domainId: string | null
  domains: Domain[]
  onChange: (domainId: string | null) => void
}) {
  const domain = domains.find((d) => d.id === domainId) ?? null
  const label = domain ? 'Changer de domaine' : 'Rattacher à un domaine'
  return (
    <DropdownMenu>
      <span className="grid h-[22px] w-5 shrink-0 place-items-center">
        {/* Au repos : l'emoji, ou le point. */}
        <span className="grid place-items-center group-hover/row:hidden group-has-data-[state=open]/row:hidden">
          {domain ? (
            <span className="text-[13px] leading-none">{domain.emoji}</span>
          ) : (
            <span className="size-[5px] rounded-full bg-muted-foreground/50" />
          )}
        </span>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={label}
            title={label}
            className={cn(
              'hidden size-5 place-items-center rounded-[5px] bg-card text-[13px] leading-none text-muted-foreground group-hover/row:grid focus-visible:grid data-[state=open]:grid',
              domain
                ? 'border border-border'
                : 'border border-dashed border-muted-foreground/50',
            )}
          >
            {domain ? domain.emoji : <Plus className="size-3" />}
          </button>
        </DropdownMenuTrigger>
      </span>
      <DropdownMenuContent align="start" className="w-[200px]">
        <span className="block px-2 pt-1.5 pb-1 text-[10.5px] font-semibold tracking-[.05em] text-muted-foreground uppercase">
          Domaine
        </span>
        {domains.map((d) => {
          const on = d.id === domainId
          return (
            <DropdownMenuItem
              key={d.id}
              onSelect={() => onChange(d.id)}
              className={cn(on && 'bg-muted font-medium')}
            >
              <span className="w-4 text-center">{d.emoji}</span>
              <span className="flex-1 truncate">{d.name}</span>
              {on && <Check className="size-3.5" />}
            </DropdownMenuItem>
          )
        })}
        {domain && (
          <>
            <div className="mx-1 my-1 h-px bg-border" />
            <DropdownMenuItem onSelect={() => onChange(null)}>
              <span className="w-4 text-center text-muted-foreground">·</span>
              Sans domaine
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
