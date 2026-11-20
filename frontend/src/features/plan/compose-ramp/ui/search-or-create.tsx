import { Plus } from 'lucide-react'
import { useState } from 'react'

import type { DomainColorClasses } from '@/entities/domain'
import type { PracticeItem } from '@/entities/practice'
import { cn } from '@/shared/lib/utils'
import { CHIP_TONES, Input } from '@/shared/ui'

import { PICK_LABEL, type PickNature, pickNatureOf } from '../model/pick'

/**
 * « Chercher ou créer » (`kit/Chercher ou creer`) : les objets de la
 * bibliothèque proposés (déjà filtrés par l'appelant : absents du cycle, de
 * la bonne nature), filtrés par la saisie ; puis « Créer « … » » par sorte,
 * tant que le titre tapé n'existe pas déjà dans la bibliothèque.
 */
export function SearchOrCreate({
  candidates,
  library,
  natures,
  accent,
  onPick,
  onCreate,
}: {
  candidates: PracticeItem[]
  /** Toute la bibliothèque, pour repérer un titre déjà pris. */
  library: PracticeItem[]
  natures: PickNature[]
  accent: DomainColorClasses
  onPick: (itemId: string) => void
  onCreate: (title: string, nature: PickNature) => void
}) {
  const [q, setQ] = useState('')
  const t = q.trim().toLowerCase()
  const list = candidates.filter((o) => !t || o.title.toLowerCase().includes(t))
  const exact = library.some((o) => o.title.toLowerCase() === t)

  return (
    <div className="flex w-[300px] flex-col">
      <Input
        autoFocus
        placeholder="Chercher ou créer"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-1 h-[30px] text-xs"
      />
      {list.length > 0 && (
        <span className="px-1.5 py-1 text-[10px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
          Bibliothèque
        </span>
      )}
      {list.map((o) => {
        const nature = pickNatureOf(o)
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => {
              setQ('')
              onPick(o.id)
            }}
            className="flex min-h-[34px] items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] hover:bg-muted"
          >
            <span
              aria-hidden
              className={cn(
                'grid size-[22px] shrink-0 place-items-center rounded-md border text-[11px]',
                nature === 'int' ? CHIP_TONES.sky : accent.soft,
              )}
            >
              {o.emoji || '•'}
            </span>
            <span className="min-w-0 flex-1 leading-snug">{o.title}</span>
            {nature && (
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {PICK_LABEL[nature]}
              </span>
            )}
          </button>
        )
      })}
      {t && !exact && (
        <div className="mt-1 flex flex-col border-t pt-1">
          {natures.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                const title = q.trim()
                setQ('')
                onCreate(title, n)
              }}
              className="flex min-h-[30px] items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[13px] hover:bg-muted"
            >
              <Plus className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1">Créer « {q.trim()} »</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {PICK_LABEL[n]}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
