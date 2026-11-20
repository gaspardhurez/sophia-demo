import { Trash2 } from 'lucide-react'
import { useState } from 'react'

import {
  type ActivityType,
  type ActivityTypeUpdate,
  CardPopover,
  fallbackPlanning,
  type Planning,
  PlanningField,
  useUpdateActivityType,
} from '@/entities/activity-type'
import { UnitField } from '@/entities/unit'
import { ApiError } from '@/shared/api'
import { EmojiField, Input, Textarea, toast } from '@/shared/ui'

const fail = (err: unknown) =>
  toast.error(
    err instanceof ApiError ? err.message : "L'enregistrement a échoué",
  )

/**
 * Le popover d'une activité type sur la page domaine — le pendant de celui
 * d'un lien sur la page projet (#38), aligné le 18/11 : ce qui la définit
 * (emoji, titre, description, unité) et son repli « Hors projet », en
 * Quotidienne · Hebdomadaire · Manuelle. Tout s'enregistre aussitôt ; un repli
 * changé vaut pour les jours pas encore posés, sans question (cf.
 * `activites.md`, *Le repli du domaine*).
 */
export function ActivityTypePopover({
  activityType: type,
  carriedBy,
  anchor,
  soft,
  onClose,
  onDelete,
}: {
  activityType: ActivityType
  /** Les projets ouverts qui la portent : tant qu'il y en a, le repli ne
   *  pose rien. */
  carriedBy: string[]
  /** La carte d'où il s'ouvre. */
  anchor: DOMRect
  /** Fond doux du domaine (tuile), en valeur CSS. */
  soft: string
  onClose: () => void
  /** La corbeille : l'appelant ouvre la confirmation. */
  onDelete: () => void
}) {
  const update = useUpdateActivityType()
  // Le repli affiché suit le clic sans attendre le serveur : deux clics
  // rapides partent chacun de l'état qu'on voit.
  const [pending, setPending] = useState<ActivityTypeUpdate | null>(null)
  const shown = { ...type, ...pending } as ActivityType
  const planning = fallbackPlanning(shown)

  function save(body: ActivityTypeUpdate) {
    update.mutateAsync({ id: type.id, body }).catch(fail)
  }

  function saveFallback(body: ActivityTypeUpdate) {
    setPending(body)
    update.mutate(
      { id: type.id, body },
      {
        onError: fail,
        onSettled: () => setPending((cur) => (cur === body ? null : cur)),
      },
    )
  }

  function choosePlanning(next: Planning) {
    if (next === 'manual') saveFallback({ fallback_active: false })
    else
      saveFallback({
        fallback_active: true,
        fallback_planning: next,
        fallback_weekdays:
          next === 'weekly' && shown.fallback_weekdays.length === 0
            ? [0, 2, 4]
            : shown.fallback_weekdays,
      })
  }

  function toggleDay(day: number) {
    const days = shown.fallback_weekdays
    const next = days.includes(day)
      ? days.filter((d) => d !== day)
      : [...days, day].sort((a, b) => a - b)
    // Plus aucun jour : le repli s'éteint (Manuelle), comme avant le 18/11.
    saveFallback(
      next.length === 0
        ? { fallback_active: false }
        : {
            fallback_active: true,
            fallback_planning: 'weekly',
            fallback_weekdays: next,
          },
    )
  }

  return (
    <CardPopover anchor={anchor} onClose={onClose}>
      <div className="flex items-center gap-2">
        <span className="shrink-0 rounded-md" style={{ background: soft }}>
          <EmojiField
            value={type.emoji ?? ''}
            onChange={(emoji) => save({ emoji: emoji || null })}
            className="size-[30px] rounded-md border-0 bg-transparent text-[15px]"
          />
        </span>
        <Input
          aria-label="Titre"
          defaultValue={type.title}
          onBlur={(e) => {
            const next = e.target.value.trim()
            if (!next) e.target.value = type.title
            else if (next !== type.title) save({ title: next })
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="h-8 min-w-0 flex-1 text-sm font-medium"
        />
        <button
          type="button"
          aria-label="Supprimer l'activité type"
          title="Supprimer l'activité type"
          onClick={onDelete}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <div className="grid gap-1.5">
        <span className="text-xs font-medium">Description</span>
        <Textarea
          rows={2}
          defaultValue={type.description ?? ''}
          placeholder="Ce qui compte comme fait"
          onBlur={(e) => {
            const next = e.target.value.trim() || null
            if (next !== (type.description ?? null)) save({ description: next })
          }}
        />
      </div>

      <div className="grid gap-1.5">
        <span className="text-xs font-medium">Unité de quantité</span>
        <UnitField
          value={type.unit_id ?? null}
          onChange={(unitId) => save({ unit_id: unitId })}
          placeholder="fait / pas fait"
        />
      </div>

      <div className="grid gap-1.5">
        <span className="text-xs font-medium">Hors projet</span>
        <span className="-mt-1 text-[11px] text-muted-foreground">
          Les jours où aucun projet en cours ne la porte.
          {carriedBy.length > 0 &&
            ` En pause : ${carriedBy.join(', ')} la porte.`}
        </span>
        <PlanningField
          planning={planning}
          weekdays={shown.fallback_weekdays}
          onPlanning={choosePlanning}
          onToggleDay={toggleDay}
        />
      </div>
    </CardPopover>
  )
}
