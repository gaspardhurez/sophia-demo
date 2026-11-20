import { ArrowRight, Trash2 } from 'lucide-react'
import { useState } from 'react'

import {
  type ActivityTypeLink,
  type ActivityTypeLinkSet,
  CardPopover,
  type Planning,
  PlanningField,
  toLinkSet,
  useUpdateActivityType,
} from '@/entities/activity-type'
import { ApiError } from '@/shared/api'
import { toDateISO } from '@/shared/lib/date'
import { Input, Switch, Textarea, toast } from '@/shared/ui'

import { ChangePlanningDialog } from './change-planning-dialog'

const fail = (err: unknown) =>
  toast.error(
    err instanceof ApiError ? err.message : "L'enregistrement a échoué",
  )

/** « 18:30:00 » → « 18:30 ». */
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '')

/**
 * Le popover d'un lien (#38, `kit/Activites types`) : la description de
 * l'activité type (partagée par tous ses projets), sa planification pour cet
 * projet, son créneau, « Préserver après le projet », et la corbeille.
 *
 * Tout changement de planification, de jours ou de créneau sur un lien qui a
 * déjà posé des jours à venir passe par « Changer la planification » (§7) ;
 * sans rien de posé, il s'applique directement. La question se pose **une
 * fois, à la fermeture** : les réglages s'accumulent dans un brouillon que le
 * popover affiche — activer le créneau, changer l'heure puis la durée ne
 * demande plus trois fois s'il faut repartir de zéro.
 */
export function LinkPopover({
  link,
  anchor,
  soft,
  inkClassName,
  onClose,
  onRemove,
  onChange,
}: {
  link: ActivityTypeLink
  /** La carte d'où il s'ouvre : il se pose à sa gauche. */
  anchor: DOMRect
  /** Fond doux du domaine (tuile), en valeur CSS. */
  soft: string
  /** Encre du domaine pour les interrupteurs. */
  inkClassName?: string
  onClose: () => void
  onRemove: () => void
  /** Écrit la planification — en base sur la page, dans le brouillon du
   *  formulaire. `reset` = « Repartir de zéro ». */
  onChange: (body: ActivityTypeLinkSet, reset: boolean) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const updateType = useUpdateActivityType()
  // Les réglages en attente de la question de fermeture, et la question.
  const [draft, setDraft] = useState<Partial<ActivityTypeLinkSet> | null>(null)
  const [asking, setAsking] = useState(false)
  const [start, setStart] = useState(hhmm(link.slot_start) || '18:30')
  const [minutes, setMinutes] = useState(String(link.slot_minutes ?? 45))

  const posedAhead =
    link.posed_until !== null && link.posed_until >= toDateISO(new Date())
  /** Le lien tel qu'il sera : l'enregistré, plus le brouillon. */
  const shown = { ...link, ...draft } as ActivityTypeLink
  const hasSlot = shown.slot_start !== null && shown.slot_minutes !== null

  function send(body: ActivityTypeLinkSet, reset = false) {
    setSaving(true)
    onChange(body, reset)
      .catch(fail)
      .finally(() => setSaving(false))
  }

  /** Un changement qui touche ce qui se pose : gardé pour la question de
   *  fermeture s'il y a du posé, écrit tout de suite sinon. */
  function change(patch: Partial<ActivityTypeLinkSet>) {
    if (posedAhead) setDraft((d) => ({ ...d, ...patch }))
    else send(toLinkSet(link, patch))
  }

  /** Fermer : la question d'abord, s'il reste des réglages en attente. */
  function close() {
    if (draft) setAsking(true)
    else onClose()
  }

  function choosePlanning(planning: Planning) {
    change({
      planning,
      weekdays:
        planning === 'weekly' && shown.weekdays.length === 0
          ? [0, 2, 4]
          : shown.weekdays,
      ...(planning === 'manual'
        ? { slot_start: null, slot_minutes: null }
        : {}),
    })
  }

  function toggleDay(day: number) {
    const weekdays = shown.weekdays.includes(day)
      ? shown.weekdays.filter((d) => d !== day)
      : [...shown.weekdays, day].sort((a, b) => a - b)
    change({ weekdays })
  }

  function commitSlot() {
    const n = Number(minutes)
    if (!/^\d{2}:\d{2}$/.test(start) || !(n > 0)) return
    if (`${start}:00` === shown.slot_start && n === shown.slot_minutes) return
    change({ slot_start: `${start}:00`, slot_minutes: n })
  }

  return (
    <>
      <CardPopover anchor={anchor} onClose={close}>
        <div className="flex items-center gap-2">
          <span
            className="grid size-[30px] shrink-0 place-items-center rounded-md text-[15px]"
            style={{ background: soft }}
          >
            {link.emoji}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {link.title}
          </span>
          <button
            type="button"
            aria-label="Retirer du projet"
            title="Retirer du projet"
            onClick={onRemove}
            className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </button>
        </div>

        <div className="grid gap-1.5">
          <span className="text-xs font-medium">Description</span>
          <Textarea
            rows={2}
            defaultValue={link.description ?? ''}
            placeholder="Ce qui compte comme fait"
            onBlur={(e) => {
              const next = e.target.value.trim() || null
              if (next === (link.description ?? null)) return
              updateType
                .mutateAsync({
                  id: link.activity_type_id,
                  body: { description: next },
                })
                .catch(fail)
            }}
          />
        </div>

        <div className="grid gap-1.5">
          <span className="text-xs font-medium">Planification</span>
          <PlanningField
            planning={shown.planning}
            weekdays={shown.weekdays}
            onPlanning={choosePlanning}
            onToggleDay={toggleDay}
          />
        </div>

        {shown.planning !== 'manual' && (
          <>
            <div className="grid gap-1.5">
              <button
                type="button"
                onClick={() =>
                  change(
                    hasSlot
                      ? { slot_start: null, slot_minutes: null }
                      : {
                          slot_start: `${start}:00`,
                          slot_minutes: Number(minutes) || 45,
                        },
                  )
                }
                className="flex items-center justify-between text-xs font-medium"
              >
                Créneau
                <Switch on={hasSlot} onClassName={inkClassName} />
              </button>
              {hasSlot && (
                <div className="flex items-center gap-1.5">
                  <Input
                    type="time"
                    aria-label="Heure"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    onBlur={commitSlot}
                    className="h-8 w-28"
                  />
                  <Input
                    inputMode="numeric"
                    aria-label="Durée en minutes"
                    value={minutes}
                    onChange={(e) =>
                      setMinutes(e.target.value.replace(/\D/g, ''))
                    }
                    onBlur={commitSlot}
                    className="h-8 w-16"
                  />
                  <span className="text-xs text-muted-foreground">min</span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() =>
                send(toLinkSet(link, { preserve_after: !link.preserve_after }))
              }
              className="-mx-3 -mb-3 flex items-center gap-2 rounded-b-xl border-t border-border bg-muted/50 px-3 py-2.5 text-xs"
            >
              <ArrowRight className="size-3.5 text-muted-foreground" />
              <span className="flex-1 text-left">
                Préserver après le projet
              </span>
              <Switch on={link.preserve_after} onClassName={inkClassName} />
            </button>
          </>
        )}
      </CardPopover>

      <ChangePlanningDialog
        title={asking ? link.title : null}
        posedUntil={link.posed_until}
        isPending={saving}
        // Annuler abandonne les réglages en attente : rien n'a été écrit.
        onCancel={() => {
          setAsking(false)
          setDraft(null)
          onClose()
        }}
        onConfirm={(reset) => {
          if (draft) send(toLinkSet(link, draft), reset)
          setAsking(false)
          setDraft(null)
          onClose()
        }}
      />
    </>
  )
}
