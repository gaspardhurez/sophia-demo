import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowUpRight, Check, GripVertical, Plus } from 'lucide-react'
import { useState } from 'react'

import {
  type AcquisitionPlan,
  useReorderPlanResources,
  useSetPlanResourceConsumed,
} from '@/entities/plan'
import { resourceEmoji, resourceHref, useResources } from '@/entities/resource'
import { NewResourceDialog } from '@/features/resource/create'
import { ApiError } from '@/shared/api'
import { cn } from '@/shared/lib/utils'
import { toast } from '@/shared/ui'

import {
  cycleResourceLines,
  type ResourceLine as Line,
} from '../../lib/cycle-resources'
import { GROUP_LABEL, ROW_HOVER, ROW_SELECTED } from './styles'

/**
 * « Ressources », dans la colonne des notes (#173, `prod/Notes`) : les
 * ressources que **le cycle** étudie, dans leur **ordre de consommation**.
 *
 * - « + » au survol de la section : Nouvelle ressource — créée depuis le
 *   cycle, elle y entre, en fin.
 * - Une ligne : l'emoji de la ressource, son titre sur deux lignes au plus
 *   (la colonne est étroite) et, dessous en gris, son auteur ; le titre
 *   entier, l'auteur et la partie en infobulle.
 *   Un clic l'ouvre à la place des notes (`?ressource=`, `onSelect`) ; un
 *   second clic sur la ligne choisie ramène aux notes.
 * - Au survol : ✓ « Marquer consommée » et ↗ (son lien, nouvel onglet ; pas
 *   de ↗ pour une référence sans lien).
 * - **Consommée** : à sa place (30/10 : elle ne descend plus en bas), titre
 *   et emoji grisés ; hors survol, seule sa coche reste visible ; un clic sur
 *   elle la remet à consommer.
 * - **Glisser** une ligne la range dans l'ordre de consommation ; l'ordre
 *   entier part au serveur.
 *
 * Sans cycle, les ressources du savoir, sans case ni ordre.
 */
export function ColumnResources({
  skillId,
  plan,
  selectedId,
  onSelect,
}: {
  skillId: string
  plan: AcquisitionPlan | null
  selectedId: string | null
  onSelect: (resourceId: string) => void
}) {
  const { data: resources } = useResources(skillId)
  const [creating, setCreating] = useState(false)
  const reorder = useReorderPlanResources(skillId)
  const consume = useSetPlanResourceConsumed(skillId)
  const sensors = useSensors(
    // Au-delà de 6 px, c'est un glisser ; en deçà, un clic.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const lines = cycleResourceLines(plan, resources)

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!plan || !over || active.id === over.id) return
    const ids = lines.map((l) => l.resource.id)
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    const resourceIds = arrayMove(ids, from, to)
    reorder
      .mutateAsync({ planId: plan.id, resourceIds })
      .catch((err) => fail(err, "L'ordre n'a pas pu s'enregistrer"))
  }

  function toggle(line: Line) {
    if (!plan) return
    consume
      .mutateAsync({
        planId: plan.id,
        resourceId: line.resource.id,
        consumed: !line.consumed,
      })
      .catch((err) => fail(err, "La ressource n'a pas pu se cocher"))
  }

  return (
    <div className="group/resources flex flex-col gap-px">
      <div className="flex h-6 items-center gap-1.5 px-2">
        <span className={GROUP_LABEL}>Ressources</span>
        <button
          type="button"
          aria-label="Nouvelle ressource"
          title="Nouvelle ressource"
          onClick={() => setCreating(true)}
          className="ml-auto grid size-[22px] cursor-pointer place-items-center rounded-[5px] text-muted-foreground opacity-0 transition-opacity duration-[120ms] group-hover/resources:opacity-100 hover:bg-foreground/[0.07] hover:text-foreground focus-visible:opacity-100"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={lines.map((l) => l.resource.id)}
          strategy={verticalListSortingStrategy}
          disabled={!plan}
        >
          {lines.map((line) => (
            <ResourceLine
              key={line.resource.id}
              line={line}
              checkable={Boolean(plan)}
              selected={line.resource.id === selectedId}
              onSelect={() => onSelect(line.resource.id)}
              onToggle={() => toggle(line)}
            />
          ))}
        </SortableContext>
      </DndContext>
      {creating && (
        <NewResourceDialog
          skillId={skillId}
          planId={plan?.id}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  )
}

function fail(err: unknown, fallback: string) {
  toast.error(err instanceof ApiError ? err.message : fallback)
}

/** Une ressource — 30 px, plus quand son titre passe sur deux lignes —,
 *  qu'on glisse par son titre. Emoji et boutons calés sur la première ligne. */
function ResourceLine({
  line: { resource, consumed },
  checkable,
  selected,
  onSelect,
  onToggle,
}: {
  line: Line
  checkable: boolean
  selected: boolean
  onSelect: () => void
  onToggle: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: resource.id })
  const href = resourceHref(resource.reference)
  const tip = [resource.title, resource.author, resource.part]
    .filter(Boolean)
    .join(' · ')
  // Au survol (ou au focus) seulement ; la coche d'une consommée, toujours.
  const onHover = 'hidden group-focus-within/line:grid group-hover/line:grid'

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group/line relative flex min-h-[30px] items-start gap-1 rounded-md py-1 pr-1',
        selected ? ROW_SELECTED : ROW_HOVER,
        isDragging && 'z-10 opacity-60',
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        // Le bouton est la poignée du glisser, mais il reste un bouton : un
        // clic l'ouvre, Entrée aussi (pas de glisser au clavier).
        role={undefined}
        aria-roledescription={undefined}
        aria-pressed={selected}
        title={tip}
        onClick={onSelect}
        className="flex min-h-[22px] min-w-0 flex-1 cursor-pointer items-start gap-2 pl-2 text-left text-[13px] leading-[18px] font-medium"
      >
        {/* L'emoji ; au survol d'une ligne qu'on peut glisser, la poignée
            classique ⋮⋮ prend sa place — elle dit qu'on la range en la
            tirant. */}
        <span
          aria-hidden
          className={cn(
            'grid w-5 shrink-0 place-items-center pt-[2px] text-xs',
            consumed && 'opacity-50',
          )}
        >
          <span
            className={cn(
              checkable &&
                'group-hover/line:hidden group-has-[:focus-visible]/line:hidden',
            )}
          >
            {resourceEmoji(resource)}
          </span>
          {checkable && (
            <GripVertical className="hidden size-3.5 text-muted-foreground group-hover/line:block group-has-[:focus-visible]/line:block" />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col pt-[2px]">
          <span
            className={cn(
              'line-clamp-2 break-words',
              consumed && 'text-muted-foreground/80',
            )}
          >
            {resource.title}
          </span>
          {resource.author && (
            <span className="truncate text-xs font-normal text-muted-foreground">
              {resource.author}
            </span>
          )}
        </span>
      </button>
      {checkable && (
        <button
          type="button"
          onClick={onToggle}
          aria-label={consumed ? 'Remettre à consommer' : 'Marquer consommée'}
          title={consumed ? 'Remettre à consommer' : 'Marquer consommée'}
          className={cn(
            'size-[22px] shrink-0 cursor-pointer place-items-center rounded-[5px] hover:bg-foreground/[0.07]',
            consumed
              ? 'grid text-muted-foreground/80'
              : cn(onHover, 'text-muted-foreground'),
          )}
        >
          <Check className="size-[13px]" strokeWidth={2.5} />
        </button>
      )}
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Ouvrir dans un nouvel onglet"
          title="Ouvrir dans un nouvel onglet"
          className={cn(
            onHover,
            'size-[22px] shrink-0 place-items-center rounded-[5px] text-muted-foreground hover:bg-foreground/[0.07] hover:text-foreground',
          )}
        >
          <ArrowUpRight className="size-[13px]" />
        </a>
      )}
    </div>
  )
}
