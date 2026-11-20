import { Ellipsis, StickyNote, Trash2, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import {
  type Unavailability,
  useAddUnavailabilitySlot,
  useCreateUnavailability,
  useDeleteUnavailability,
  useRemoveUnavailabilitySlot,
  useUpdateUnavailability,
  useUpdateUnavailabilitySlot,
} from '@/entities/unavailability'
import { ApiError } from '@/shared/api'
import { toLocalISO } from '@/shared/lib/date'
import { fitPanelTop } from '@/shared/lib/panel-position'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmojiField,
  Input,
  PanelSection,
  Rule,
} from '@/shared/ui'

import type { Period } from '../model/time'
import { PeriodFields } from './period-fields'
import { type SlotBody, type SlotEditing, SlotsSection } from './slots-section'

const fail = (err: unknown, fallback = 'Échec') =>
  toast.error(err instanceof ApiError ? err.message : fallback)

const periodOf = (u: Unavailability): Period => ({
  allDay: u.all_day,
  start: new Date(u.start_at),
  end: new Date(u.end_at),
})

/**
 * Le panneau d'une indisponibilité (#105, `kit/Panneau indispo`), sur le
 * gabarit du panneau d'activité : en-tête « Indisponibilité », ⋯ → Supprimer,
 * × ; emoji et nom ; Dates ; Créneaux bloqués ; Notes.
 *
 * Tout s'enregistre à la volée. Un brouillon (le bouton « Indisponible »)
 * n'existe qu'une fois nommé, comme une activité ; ses créneaux et ses notes
 * paraissent dès qu'il a un nom. Supprimer ne demande pas de confirmation.
 *
 * `pendingSlot` : une plage glissée dans la grille, à nommer en créneau
 * bloqué — l'éditeur s'ouvre dessus.
 */
export function UnavailabilityPanel({
  unavailability,
  draft,
  pendingSlot,
  pos,
  onClose,
  onCreated,
}: {
  unavailability: Unavailability | null
  draft: Period | null
  pendingSlot?: { start: Date; end: Date } | null
  pos: { top: number; left: number }
  onClose: () => void
  onCreated?: (created: Unavailability) => void
}) {
  const create = useCreateUnavailability()
  const update = useUpdateUnavailability()
  const remove = useDeleteUnavailability()
  const addSlot = useAddUnavailabilitySlot()
  const updateSlot = useUpdateUnavailabilitySlot()
  const removeSlot = useRemoveUnavailabilitySlot()

  // Né dans ce panneau : la réponse du POST tient lieu d'indisponibilité tant
  // que la liste ne l'a pas relue.
  const [born, setBorn] = useState<Unavailability | null>(null)
  const current = unavailability ?? born
  const id = current?.id ?? null

  const [title, setTitle] = useState(current?.title ?? '')
  const [emoji, setEmoji] = useState<string | null>(current?.emoji ?? null)
  const [notes, setNotes] = useState(current?.notes ?? '')
  const [period, setPeriod] = useState<Period>(
    current ? periodOf(current) : draft!,
  )
  const [menuOpen, setMenuOpen] = useState(false)
  const [editingSlot, setEditingSlot] = useState<SlotEditing | null>(
    pendingSlot ?? null,
  )

  // Une date changée ailleurs se relit ici.
  const serverPeriod = current ? JSON.stringify(periodOf(current)) : null
  useEffect(() => {
    if (current) setPeriod(periodOf(current))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverPeriod])

  async function persist(): Promise<Unavailability | null> {
    const t = title.trim()
    if (!t) return null
    try {
      if (id) {
        if (t !== current?.title)
          await update.mutateAsync({ id, body: { title: t } })
        return current
      }
      const created = await create.mutateAsync({
        title: t,
        emoji,
        all_day: period.allDay,
        start_at: toLocalISO(period.start),
        end_at: toLocalISO(period.end),
        notes: notes.trim() || null,
      })
      setBorn(created)
      onCreated?.(created)
      return created
    } catch (err) {
      fail(err, "Échec de l'enregistrement")
      return null
    }
  }

  async function chooseEmoji(next: string | null) {
    setEmoji(next)
    if (!id) return
    try {
      await update.mutateAsync({ id, body: { emoji: next } })
    } catch (err) {
      setEmoji(current?.emoji ?? null)
      fail(err)
    }
  }

  async function choosePeriod(next: Period) {
    const before = period
    setPeriod(next)
    if (!id) return
    try {
      await update.mutateAsync({
        id,
        body: {
          all_day: next.allDay,
          start_at: toLocalISO(next.start),
          end_at: toLocalISO(next.end),
        },
      })
    } catch (err) {
      // Un créneau sortirait de la période : rien ne bouge (#105).
      setPeriod(before)
      fail(err)
    }
  }

  async function saveNotes() {
    if (!id || (notes.trim() || null) === (current?.notes ?? null)) return
    try {
      await update.mutateAsync({ id, body: { notes: notes.trim() || null } })
    } catch (err) {
      fail(err)
    }
  }

  async function saveSlot(body: SlotBody, slotId: string | null) {
    const target = id ? current : await persist()
    if (!target) return false
    try {
      if (slotId) await updateSlot.mutateAsync({ id: target.id, slotId, body })
      else await addSlot.mutateAsync({ id: target.id, body })
      return true
    } catch (err) {
      fail(err)
      return false
    }
  }

  async function dropSlot(slotId: string) {
    if (!id) return
    try {
      await removeSlot.mutateAsync({ id, slotId })
    } catch (err) {
      fail(err)
    }
  }

  async function handleDelete() {
    if (!id) return onClose()
    try {
      await remove.mutateAsync({ id })
      onClose()
    } catch (err) {
      fail(err)
    }
  }

  /** Le « + » des créneaux : une heure au début de la période. */
  function newSlotRange() {
    const start = new Date(period.start)
    if (period.allDay) start.setHours(9, 0, 0, 0)
    return { start, end: new Date(start.getTime() + 3_600_000) }
  }

  // Le nom et les notes en cours partent à la fermeture.
  const latest = useRef({ persist, saveNotes })
  latest.current = { persist, saveNotes }
  useEffect(
    () => () => {
      void latest.current.persist()
      void latest.current.saveNotes()
    },
    [],
  )

  // Comme le panneau d'activité : ancré sur ce qu'on a cliqué, il ne remonte
  // que de ce qui dépasserait la fenêtre.
  const panelRef = useRef<HTMLDivElement>(null)
  const [top, setTop] = useState(pos.top)
  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el) return
    const fit = () => setTop(fitPanelTop(pos.top, el.scrollHeight))
    fit()
    const observer = new ResizeObserver(fit)
    for (const child of Array.from(el.children)) observer.observe(child)
    return () => observer.disconnect()
  })

  const named = Boolean(id || title.trim())

  return (
    <div
      ref={panelRef}
      data-activity-ui
      style={{
        top,
        left: pos.left,
        maxHeight: `calc(100vh - ${top}px - 12px)`,
      }}
      className="fixed z-50 flex w-80 flex-col overflow-y-auto overflow-x-hidden rounded-xl border border-border bg-background/80 p-3 shadow-xl backdrop-blur-xl"
    >
      <div className="flex items-center gap-0.5 text-muted-foreground">
        <span className="mr-auto px-1.5 py-1 text-sm">Indisponibilité</span>
        {id && (
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Plus"
                className="rounded p-1 hover:bg-muted/60 hover:text-foreground data-[state=open]:bg-muted/60"
              >
                <Ellipsis className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[180px]">
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => void handleDelete()}
              >
                <Trash2 className="size-[15px]" />
                Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="rounded p-1 hover:bg-muted/60 hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 px-1 pt-0.5 pb-1.5">
        <EmojiField
          value={emoji ?? undefined}
          onChange={(e) => void chooseEmoji(e || null)}
          aria-label="Emoji de l'indisponibilité"
          className="size-8 shrink-0 text-base"
        />
        <Input
          autoFocus={!id && !pendingSlot}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          onBlur={() => void persist()}
          placeholder="Nom"
          aria-label="Nom"
          className="h-8 rounded-md border-transparent bg-transparent px-1.5 text-base font-medium hover:border-input focus:border-foreground/45"
        />
      </div>

      <Rule />
      <PeriodFields period={period} onChange={(p) => void choosePeriod(p)} />

      {named && (
        <>
          <Rule />
          <SlotsSection
            slots={current?.slots ?? []}
            editing={editingSlot}
            onEdit={setEditingSlot}
            newRange={newSlotRange}
            onSave={saveSlot}
            onRemove={(slotId) => void dropSlot(slotId)}
          />
          <Rule />
          <PanelSection icon={StickyNote} title="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => void saveNotes()}
              rows={2}
              placeholder="Ajouter une note"
              aria-label="Notes"
              className="mt-0.5 mr-2 mb-1 ml-[34px] resize-none rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm leading-[1.45] outline-none [field-sizing:content] hover:border-border focus:border-foreground/45"
            />
          </PanelSection>
        </>
      )}
    </div>
  )
}
