import { ArrowRight, Clock, X } from 'lucide-react'
import { useState } from 'react'

import { slotRange, type UnavailabilitySlot } from '@/entities/unavailability'
import { addDays, toDateISO, toLocalISO } from '@/shared/lib/date'
import {
  EmojiField,
  Input,
  PanelSection,
  PeriodPicker,
  SectionIconButton,
  SectionOk,
} from '@/shared/ui'

import { at, hhmm, onDay } from '../model/time'

/** Un créneau bloqué tel qu'on l'écrit. */
export interface SlotBody {
  emoji: string | null
  title: string
  start_at: string
  end_at: string
}

/** Ce que l'éditeur ouvre : un créneau existant, ou un nouveau sur une plage. */
export type SlotEditing =
  { slot: UnavailabilitySlot } | { start: Date; end: Date }

const TIME_INPUT =
  'h-7 rounded-md border border-border bg-transparent px-1.5 text-sm tabular-nums outline-none focus:border-foreground/45'

/**
 * **Créneaux bloqués** (`kit/Panneau indispo`) : une ligne par créneau —
 * emoji, nom, plage —, × au survol pour le retirer. Le « + » de la section en
 * ouvre un nouveau ; un clic sur une ligne l'édite en place (ce que la
 * maquette ne dessine pas, #105). Un nouveau créneau n'existe qu'une fois
 * nommé.
 */
export function SlotsSection({
  slots,
  editing,
  onEdit,
  newRange,
  onSave,
  onRemove,
}: {
  slots: UnavailabilitySlot[]
  editing: SlotEditing | null
  onEdit: (next: SlotEditing | null) => void
  /** La plage proposée par le « + ». */
  newRange: () => { start: Date; end: Date }
  onSave: (body: SlotBody, slotId: string | null) => Promise<boolean>
  onRemove: (slotId: string) => void
}) {
  const editedId = editing && 'slot' in editing ? editing.slot.id : null
  return (
    <PanelSection
      icon={Clock}
      title="Créneaux bloqués"
      action={
        <SectionIconButton
          label="Ajouter un créneau bloqué"
          onClick={() => onEdit(newRange())}
        />
      }
    >
      {slots.map((s) =>
        s.id === editedId ? (
          <SlotEditor
            key={s.id}
            initial={editing!}
            onSave={(body) => onSave(body, s.id)}
            onClose={() => onEdit(null)}
          />
        ) : (
          <div
            key={s.id}
            role="button"
            tabIndex={0}
            onClick={() => onEdit({ slot: s })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onEdit({ slot: s })
            }}
            className="group/slot flex cursor-pointer items-center gap-2 rounded-md py-[5px] pr-2 pl-[34px] text-sm hover:bg-muted/60"
          >
            {s.emoji && <span>{s.emoji}</span>}
            <span className="min-w-0 truncate font-medium">{s.title}</span>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
              {slotRange(s)}
            </span>
            <button
              type="button"
              aria-label="Retirer"
              title="Retirer"
              onClick={(e) => {
                e.stopPropagation()
                onRemove(s.id)
              }}
              className="invisible grid size-5 shrink-0 place-items-center rounded-[5px] text-muted-foreground group-hover/slot:visible hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ),
      )}
      {editing && !('slot' in editing) && (
        <SlotEditor
          initial={editing}
          onSave={(body) => onSave(body, null)}
          onClose={() => onEdit(null)}
        />
      )}
    </PanelSection>
  )
}

/**
 * L'édition d'un créneau, dans le flux de la section : emoji et nom, puis le
 * jour et la plage horaire. « OK » ou Entrée l'enregistrent (sans nom, il est
 * abandonné) ; Échap l'abandonne.
 */
function SlotEditor({
  initial,
  onSave,
  onClose,
}: {
  initial: SlotEditing
  onSave: (body: SlotBody) => Promise<boolean>
  onClose: () => void
}) {
  const seed =
    'slot' in initial
      ? {
          emoji: initial.slot.emoji,
          title: initial.slot.title,
          start: new Date(initial.slot.start_at),
          end: new Date(initial.slot.end_at),
        }
      : { emoji: null, title: '', start: initial.start, end: initial.end }
  const [emoji, setEmoji] = useState<string | null>(seed.emoji)
  const [title, setTitle] = useState(seed.title)
  const [day, setDay] = useState(seed.start)
  const [from, setFrom] = useState(hhmm(seed.start))
  const [to, setTo] = useState(hhmm(seed.end))

  async function commit() {
    const t = title.trim()
    if (!t) return onClose()
    const start = at(day, from)
    let end = at(day, to)
    // « 23:00 → 00:00 » finit le lendemain.
    if (end <= start && to === '00:00') end = at(addDays(day, 1), to)
    const ok = await onSave({
      emoji,
      title: t,
      start_at: toLocalISO(start),
      end_at: toLocalISO(end),
    })
    if (ok) onClose()
  }

  return (
    <div className="mx-2 my-1 flex flex-col gap-1.5 rounded-lg border border-border p-2 pl-[26px]">
      <div className="flex items-center gap-1.5">
        <EmojiField
          value={emoji ?? undefined}
          onChange={(e) => setEmoji(e || null)}
          aria-label="Emoji du créneau"
          className="size-7 shrink-0 text-sm"
        />
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commit()
            if (e.key === 'Escape') {
              e.stopPropagation()
              onClose()
            }
          }}
          placeholder="Nom du créneau"
          className="h-7 rounded-md px-1.5 text-sm font-medium"
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <PeriodPicker
          mode="single"
          variant="compact"
          start={toDateISO(day)}
          onChange={(s) => s && setDay(onDay(s, day))}
          aria-label="Jour du créneau"
        />
        <input
          type="time"
          aria-label="Début du créneau"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className={TIME_INPUT}
        />
        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          type="time"
          aria-label="Fin du créneau"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className={TIME_INPUT}
        />
        <span className="ml-auto">
          <SectionOk onClick={() => void commit()} />
        </span>
      </div>
    </div>
  )
}
