import {
  Library,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import type { ReactNode } from 'react'

import type { Project } from '@/entities/project'
import {
  type AcquisitionPlan,
  cycleDates,
  CycleMark,
  type CycleStage,
  cycleName,
  cycleStage,
} from '@/entities/plan'
import { cn } from '@/shared/lib/utils'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui'

/**
 * Les onglets des cycles d'un savoir (design #65 à #67, `kit/Onglets
 * cycles`), dans tous les états de la page : « Bibliothèque » (#75, ex-« Vue
 * d'ensemble » ; une icône, son nom en infobulle), un onglet par cycle du plus ancien au plus récent — sa date
 * en infobulle —, l'onglet brouillon « Nouveau cycle »
 * pendant qu'on en crée un, puis « + » (nouveau cycle). Un nom d'onglet n'est
 * jamais tronqué : les onglets défilent.
 *
 * À droite, les **actions** de ce qui est montré, visibles au survol de la
 * barre (et tant que leur menu est ouvert). L'état d'un cycle se lit dans la
 * marque de son onglet : il n'y a plus de ligne dessous.
 */
export function CycleTabs({
  plans,
  selected,
  draft,
  projects,
  color,
  onSelect,
  onNew,
  actions,
}: {
  plans: AcquisitionPlan[]
  /** Le cycle montré, `null` pour la vue d'ensemble, `'draft'` pour le
   * cycle qu'on crée. */
  selected: string | null
  /** Le statut choisi pour le cycle qu'on crée, s'il y en a un. */
  draft?: CycleStage
  projects: Project[]
  /** La couleur du domaine (CSS). */
  color: string
  onSelect: (planId: string | null) => void
  onNew: () => void
  actions?: ReactNode
}) {
  const titleOf = (id: string) =>
    projects.find((o) => o.id === id)?.title ?? 'Projet'

  const tab = (on: boolean) =>
    cn(
      'inline-flex h-10 shrink-0 items-center gap-[7px] px-2.5 text-[13px] font-medium whitespace-nowrap hover:text-foreground',
      on
        ? 'text-foreground shadow-[inset_0_-2px_0_var(--foreground)]'
        : 'text-muted-foreground',
    )

  return (
    <div className="group/tabs flex items-end gap-0.5 border-b bg-card px-[18px]">
      <div
        role="tablist"
        aria-label="Cycles"
        className="flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto [scrollbar-width:none]"
      >
        <button
          type="button"
          role="tab"
          aria-selected={selected === null}
          onClick={() => onSelect(null)}
          aria-label="Bibliothèque"
          title="Bibliothèque"
          className={tab(selected === null)}
        >
          <Library className="size-4" />
        </button>
        {plans.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={p.id === selected}
            onClick={() => onSelect(p.id)}
            title={cycleDates(p) || undefined}
            className={tab(p.id === selected)}
          >
            <CycleMark stage={cycleStage(p)} color={color} />
            {cycleName(p, plans, titleOf)}
          </button>
        ))}
        {draft && (
          <span role="tab" aria-selected className={tab(true)}>
            <CycleMark stage={draft} color={color} />
            <span className="italic">Nouveau cycle</span>
          </span>
        )}
        <button
          type="button"
          aria-label="Nouveau cycle"
          title="Nouveau cycle"
          onClick={onNew}
          className="mb-1.5 grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-1.5 self-center pl-3 opacity-0 transition-opacity group-hover/tabs:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100">
          {actions}
        </div>
      )}
    </div>
  )
}

export interface CycleActions {
  onStart: () => void
  onClose: () => void
  onEdit: () => void
  onUnstart: () => void
  onReopen: () => void
  onDelete: () => void
}

/**
 * Les actions d'un cycle, à droite des onglets (design #67) : un bouton et le
 * menu ⋯. Prévu → ▶ Démarrer ; ⋯ Modifier. En cours et à clore → Terminer ;
 * ⋯ Modifier, Annuler le démarrage. Clos → ⋯ Modifier, Rouvrir. Supprimer
 * (rouge) s'ajoute au menu d'un cycle **sans projet**, quel que soit son
 * état.
 */
export function CycleStageActions({
  plan,
  ink,
  actions,
}: {
  plan: AcquisitionPlan
  /** L'encre foncée du domaine (CSS), fond de « Démarrer ». */
  ink: string
  actions: CycleActions
}) {
  const stage = cycleStage(plan)
  const open = stage === 'active' || stage === 'toClose'
  const closed = stage === 'acquired' || stage === 'abandoned'
  const item = 'h-8 gap-2 px-2 text-[13px]'

  return (
    <>
      {stage === 'planned' && (
        <Button
          size="sm"
          className="h-[30px] gap-1.5 text-white hover:opacity-90"
          style={{ background: ink }}
          onClick={actions.onStart}
        >
          <Play className="size-[11px] fill-current" /> Démarrer
        </Button>
      )}
      {open && (
        <Button size="sm" className="h-[30px]" onClick={actions.onClose}>
          Terminer
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            aria-label="Plus d'actions"
            className="size-[30px] text-foreground/80 data-[state=open]:bg-muted"
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[220px] p-1">
          <DropdownMenuItem className={item} onSelect={actions.onEdit}>
            <Pencil className="size-[13px]" /> Modifier
          </DropdownMenuItem>
          {open && (
            <DropdownMenuItem className={item} onSelect={actions.onUnstart}>
              <RotateCcw className="size-[13px]" /> Annuler le démarrage
            </DropdownMenuItem>
          )}
          {closed && (
            <DropdownMenuItem className={item} onSelect={actions.onReopen}>
              <RotateCcw className="size-[13px]" /> Rouvrir
            </DropdownMenuItem>
          )}
          {plan.project_ids.length === 0 && (
            <DropdownMenuItem
              className={cn(
                item,
                'text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive',
              )}
              onSelect={actions.onDelete}
            >
              <Trash2 className="size-[13px]" /> Supprimer
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
