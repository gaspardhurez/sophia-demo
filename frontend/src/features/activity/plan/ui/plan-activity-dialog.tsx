import { useMemo, useState } from 'react'

import {
  type Activity,
  type ActivityActSet,
  useActivities,
  useAddActivityAct,
  useCreateActivity,
} from '@/entities/activity'
import type { DomainColorClasses } from '@/entities/domain'
import { type PracticeItem, usePracticeItems } from '@/entities/practice'
import { ApiError } from '@/shared/api'
import {
  addDays,
  fmtTime,
  startOfDay,
  toDateISO,
  toLocalISO,
} from '@/shared/lib/date'
import { cn } from '@/shared/lib/utils'
import {
  Button,
  CHIP_TONES,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
  MonthCalendar,
  toast,
} from '@/shared/ui'

/** Le créneau par défaut d'une séance à l'heure — modifiable, comme le reste. */
const DEFAULT_SLOT = { from: '18:00', to: '19:00' }

/**
 * Planifier une séance sur un savoir.
 *
 * **Reprogrammer un rappel, c'est planifier** : il n'y a pas deux gestes. D'où
 * une seule modale, où l'objet visé se choisit — ou pas, une séance libre étant
 * le cas le plus fréquent quand on ouvre un sujet sans savoir encore ce qu'on y
 * fera.
 *
 * Elle naît avec **un acte** (#82) : l'exercice choisi, ou l'étude du savoir
 * pour une séance libre — ou la pièce **imposée** (`piece`) quand on planifie
 * depuis sa fiche une pièce sans objet : l'interro, ou la pratique / mise en
 * situation libre. Planifier l'interro la **déplace** (le serveur retire celle
 * qui attendait ailleurs). Posée depuis un cycle (`planId`), l'acte **sert ce
 * cycle** : la séance compte pour ses projets, et se lit dans son
 * calendrier.
 */
/** Une pièce sans objet qu'on planifie depuis sa fiche — ou l'**Étude**,
 *  imposée depuis les notes (« Planifier une séance », #173). */
export type FixedPiece = 'recall' | 'study' | 'isolated' | 'situation'

const FIXED: Record<FixedPiece, { emoji: string; label: string }> = {
  recall: { emoji: '🧠', label: 'Interro' },
  study: { emoji: '📖', label: 'Étude' },
  isolated: { emoji: '🌱', label: 'Pratique libre' },
  situation: { emoji: '🌱', label: 'Mise en situation libre' },
}

export function PlanActivityDialog({
  skillId,
  skillName,
  domainId,
  accent,
  domainEmoji,
  /** Objet présélectionné : ouvert depuis sa modale, il est déjà désigné. */
  target,
  piece,
  initialDay,
  projectIds = [],
  planId,
  onOpenChange,
}: {
  skillId: string
  skillName: string
  domainId: string
  accent: DomainColorClasses
  domainEmoji: string
  target?: PracticeItem | null
  /** Une pièce sans objet, imposée : « Sur quoi » ne propose qu'elle. */
  piece?: FixedPiece
  /** Le jour proposé à l'ouverture (aujourd'hui par défaut). */
  initialDay?: Date
  /** Les projets du cycle : leurs séances prévues se marquent sous les
   *  jours, et celles du jour choisi se proposent au rattachement. Vide : les
   *  séances du domaine. */
  projectIds?: string[]
  planId?: string
  onOpenChange: (open: boolean) => void
}) {
  const { data: items } = usePracticeItems(skillId)
  const create = useCreateActivity()
  const addAct = useAddActivityAct()

  const [itemId, setItemId] = useState<string | null>(target?.id ?? null)
  const [day, setDay] = useState(() => startOfDay(initialDay ?? new Date()))
  const [month, setMonth] = useState(
    () => new Date(day.getFullYear(), day.getMonth(), 1),
  )
  const [allDay, setAllDay] = useState(true)
  const [slot, setSlot] = useState(DEFAULT_SLOT)
  // Rattacher à une séance prévue du jour choisi, plutôt qu'en créer une.
  const [attachId, setAttachId] = useState<string | null>(null)
  function pickDay(d: Date) {
    setDay(d)
    setAttachId(null)
  }

  // Les séances prévues (pas faites) des projets du cycle — à défaut, du
  // domaine — autour du mois affiché : un rond sous leurs jours.
  const { data: around } = useActivities({
    domainId,
    start: toDateISO(addDays(month, -7)),
    end: toDateISO(
      addDays(new Date(month.getFullYear(), month.getMonth() + 1, 1), 7),
    ),
  })
  const projectKey = projectIds.join(',')
  const candidates = useMemo(
    () =>
      (around ?? []).filter(
        (a) =>
          !a.done &&
          a.start_at &&
          // Une séance qui n'est qu'une interro n'est pas une séance à rejoindre.
          !(a.acts.length > 0 && a.acts.every((x) => x.kind === 'recall')) &&
          (projectIds.length === 0 ||
            a.projects.some((o) => projectIds.includes(o.project_id))),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [around, projectKey],
  )
  const marks = useMemo(
    () =>
      new Map(
        candidates.map((a) => [
          toDateISO(new Date(a.start_at!)),
          'planned' as const,
        ]),
      ),
    [candidates],
  )
  const ofDay = candidates
    .filter((a) => toDateISO(new Date(a.start_at!)) === toDateISO(day))
    .sort(byTime)
  const attachTo = ofDay.find((a) => a.id === attachId) ?? null

  async function plan() {
    const item = items?.find((i) => i.id === itemId)
    const at = allDay ? toLocalISO(day) : `${toDateISO(day)}T${slot.from}:00`
    const end = allDay ? at : `${toDateISO(day)}T${slot.to}:00`
    const act: ActivityActSet =
      piece === 'recall'
        ? { skill_id: skillId, kind: 'recall', plan_id: planId ?? null }
        : piece === 'study'
          ? {
              skill_id: skillId,
              kind: 'study',
              practice_item_id: null,
              plan_id: planId ?? null,
            }
          : piece
            ? {
                skill_id: skillId,
                kind: 'practice',
                nature: piece,
                plan_id: planId ?? null,
              }
            : {
                skill_id: skillId,
                kind: itemId ? 'practice' : 'study',
                practice_item_id: itemId,
                plan_id: planId ?? null,
              }
    if (attachTo) {
      try {
        await addAct.mutateAsync({ id: attachTo.id, act })
        toast.success(`Rattachée à « ${attachTo.title} »`)
        onOpenChange(false)
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : 'Le rattachement a échoué',
        )
      }
      return
    }
    try {
      await create.mutateAsync({
        domain_id: domainId,
        acts: [act],
        // Le titre nomme ce qu'on va faire, pas le savoir : « Match du samedi »
        // se relit mieux qu'un énième nom de savoir dans une semaine chargée.
        title:
          piece === 'recall'
            ? `Interro · ${skillName}`
            : (item?.title ?? skillName),
        emoji: piece === 'recall' ? '🧠' : (item?.emoji ?? null),
        all_day: allDay,
        start_at: at,
        end_at: end,
        done: false,
      })
      toast.success('Séance posée')
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'La planification a échoué',
      )
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-[512px]">
        <DialogTitle className="text-lg">Planifier</DialogTitle>

        <section className="flex flex-col gap-2">
          <h3 className="font-heading text-[13px] font-semibold">Sur quoi</h3>
          <div className="overflow-hidden rounded-lg border border-border">
            {piece ? (
              <Target
                selected
                onSelect={() => {}}
                emoji={FIXED[piece].emoji}
                badge={accent.soft}
                label={FIXED[piece].label}
                accent={accent}
              />
            ) : (
              <>
                {(items ?? []).map((item) => (
                  <Target
                    key={item.id}
                    selected={itemId === item.id}
                    onSelect={() => setItemId(item.id)}
                    emoji={item.emoji || domainEmoji || '•'}
                    badge={
                      item.kind === 'integrated' ? CHIP_TONES.sky : accent.soft
                    }
                    label={item.title}
                    accent={accent}
                  />
                ))}
                <Target
                  selected={itemId === null}
                  onSelect={() => setItemId(null)}
                  emoji="＋"
                  badge="border-dashed border-border bg-transparent text-muted-foreground"
                  label="Séance libre, sans objet rattaché"
                  accent={accent}
                />
              </>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="font-heading text-[13px] font-semibold">Quand</h3>
          <div className="rounded-lg border border-border p-4">
            <MonthCalendar
              month={month}
              onMonthChange={setMonth}
              selected={day}
              onSelect={pickDay}
              marks={marks}
              accentClassName={accent.dot}
              accentBorderClassName={accent.soft}
            />
          </div>
        </section>

        {ofDay.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="font-heading text-[13px] font-semibold">
              Rattacher à
            </h3>
            <div className="overflow-hidden rounded-lg border border-border">
              {ofDay.map((a) => (
                <Target
                  key={a.id}
                  selected={attachId === a.id}
                  onSelect={() => setAttachId(a.id)}
                  emoji={a.emoji || domainEmoji || '•'}
                  badge={accent.soft}
                  label={`${a.title} · ${a.all_day ? 'journée' : fmtTime(a.start_at!)}`}
                  accent={accent}
                />
              ))}
              <Target
                selected={attachId === null}
                onSelect={() => setAttachId(null)}
                emoji="＋"
                badge="border-dashed border-border bg-transparent text-muted-foreground"
                label="Nouvelle séance"
                accent={accent}
              />
            </div>
          </section>
        )}

        {!attachTo && (
          <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <h3 className="font-heading text-sm font-semibold">Horaire</h3>
              <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                Toute la journée
                <button
                  type="button"
                  role="switch"
                  aria-checked={allDay}
                  aria-label="Toute la journée"
                  onClick={() => setAllDay((v) => !v)}
                  className={cn(
                    'relative h-[18px] w-[30px] rounded-full transition-colors',
                    allDay ? 'bg-foreground' : 'bg-border',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'absolute top-[3px] size-3 rounded-full bg-white shadow-sm transition-[left]',
                      allDay ? 'left-[15px]' : 'left-[3px]',
                    )}
                  />
                </button>
              </label>
            </div>
            {!allDay && (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="time"
                  value={slot.from}
                  onChange={(e) =>
                    setSlot((s) => ({ ...s, from: e.target.value }))
                  }
                  className="h-9 w-28 rounded-[10px] border border-border bg-card px-3 text-sm"
                />
                <span className="text-muted-foreground">→</span>
                <input
                  type="time"
                  value={slot.to}
                  onChange={(e) =>
                    setSlot((s) => ({ ...s, to: e.target.value }))
                  }
                  className="h-9 w-28 rounded-[10px] border border-border bg-card px-3 text-sm"
                />
              </div>
            )}
          </section>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            disabled={create.isPending || addAct.isPending}
            onClick={() => void plan()}
          >
            {attachTo ? 'Rattacher' : 'Planifier'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Dans une journée : journée entière d'abord, puis l'heure. */
function byTime(a: Activity, b: Activity) {
  if (a.all_day !== b.all_day) return a.all_day ? -1 : 1
  return (a.start_at ?? '').localeCompare(b.start_at ?? '')
}

/** Une cible possible — l'objet visé, ou la séance libre. */
function Target({
  selected,
  onSelect,
  emoji,
  badge,
  label,
  accent,
}: {
  selected: boolean
  onSelect: () => void
  emoji: string
  badge: string
  label: string
  accent: DomainColorClasses
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-center gap-3 border-b border-border/60 px-3 py-2.5 text-left last:border-b-0',
        selected ? cn(accent.soft, 'border-transparent') : 'hover:bg-muted/40',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'grid size-7 shrink-0 place-items-center rounded-md border text-sm',
          badge,
        )}
      >
        {emoji}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px]">{label}</span>
    </button>
  )
}
