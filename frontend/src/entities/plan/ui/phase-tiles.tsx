import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { type CSSProperties, type ReactNode, useMemo, useState } from 'react'

import type { components } from '@/shared/api'
import { cn } from '@/shared/lib/utils'
import { Button, Switch } from '@/shared/ui'

import {
  focusedPhases,
  type PhaseTile,
  phaseTiles,
  type TileRow,
} from '../model/phase-focus'
import type { PhaseKey } from '../model/phases'
import type { Piece } from '../model/pieces'
import type { PhaseState } from '../model/progress'
import type { AcquisitionPlan } from '../model/types'
import { AddFromLibrary, RetentionSpacingControl } from './phase-tile-edit'
import { PhaseTileRow, RowActions, SortableTileRow } from './phase-tile-row'
import {
  RecallTargetControl,
  RecallTileRow,
  type StudyActions,
  StudyGestures,
} from './study-tile'

type LibraryItem = components['schemas']['PracticeItemRead']
type RetentionSpacing = components['schemas']['RetentionSpacing']
type Nature = 'isolated' | 'situation'

/** Le mode Modifier des tuiles (#142) : tout passe par l'appelant. */
export interface PhaseTilesEdit {
  /** Les phases allumées, telles que le brouillon du cycle les tient. */
  phases: Record<PhaseKey, boolean>
  onTogglePhase: (key: PhaseKey) => void
  /** L'ordre voulu d'une rampe, tous ses ids. La tuile l'affiche tout de
   *  suite et revient à l'ordre d'avant si la promesse échoue. */
  onReorder: (nature: Nature, itemIds: string[]) => Promise<unknown>
  onKeep: (itemId: string, keep: boolean) => void
  /** « Retirer du cycle » : l'objet reste dans la bibliothèque. */
  onRemove: (itemId: string) => void
  /** Les objets de la bibliothèque absents du cycle, par nature. */
  candidates: Record<Nature, LibraryItem[]>
  onAdd: (nature: Nature, itemId: string) => void
  /** Remplace la liste d'ajout (créer depuis l'ajout, comme aujourd'hui). */
  renderAdd?: (nature: Nature, close: () => void) => ReactNode
  spacing: {
    mode: RetentionSpacing
    intervalDays: number | null
    onChange: (patch: {
      retention_spacing?: RetentionSpacing
      retention_interval_days?: number | null
    }) => void
  }
  /** Le seuil de l'Étude (#157) : le nombre de tests, du brouillon. */
  recallTarget: { value: number; onChange: (target: number) => void }
  /** Le fond de l'interrupteur allumé : l'encre du domaine (classe). */
  switchClassName?: string
}

/**
 * Les phases d'un cycle sur la page savoir (#136, #142, `kit/Phases cycle`,
 * dans `prod/Savoir`) : une tuile par phase, sur deux colonnes.
 *
 * **Lecture** (#148) : seules les phases activées au cycle ont une tuile — 4
 * ou 2 sur deux colonnes, 3 avec la dernière en pleine largeur dessous, 1 en
 * pleine largeur ; aucune, un cadre pointillé « Aucune phase » et « Modifier
 * le cycle » (`onEditCycle`). Chaque tuile : l'anneau de progression (validées / pièces de la phase ;
 * l'Étude pleine une fois terminée) et sa fraction, le nom, la méta ; une
 * ligne par pièce — l'étude (📓 Notes) et l'interro en sont. Le **focus**
 * (contour à l'encre du domaine) va à toute phase non validée qui a une
 * passe, à défaut à la prochaine non vide ; une tuile validée est teintée,
 * une phase éteinte en pointillé. Un clic : `onNotes` pour l'étude,
 * `onPiece` pour le reste.
 *
 * **L'Étude** (#157) se lit sur son interro : l'anneau sur le prochain cran,
 * « Terminée à J+15 » en méta, la ligne Interro et sa frise ; en pied, ses
 * gestes (`studyActions`, absents : aucun) — Étudier (`onNotes`) et, selon
 * l'état, Lancer l'interro, Passer l'interro ou Valider l'étude sans interro.
 *
 * **Modifier** (`edit`) : les quatre tuiles, l'interrupteur dans l'en-tête (« Hors cycle »
 * éteinte), « n au cycle » / « n gardés » ; Pratique et Mise en situation
 * ont poignée, rétention et × ; étude, interro et générique aucune action ;
 * « + Exercice » / « + Mise en situation » en pied ; la Rétention liste les
 * gardés (un clic les en retire) et son Espacement ; l'Étude, son seuil.
 *
 * Aucun appel réseau ici : données et gestes arrivent par props.
 */
export function PhaseTiles({
  plan,
  library,
  domainEmoji = '',
  colors,
  levels,
  renderLevel,
  focus = plan.state === 'draft' || plan.state === 'active',
  onPiece,
  onNotes,
  onEditCycle,
  studyActions,
  recallSession,
  edit,
}: {
  plan: AcquisitionPlan
  /** La bibliothèque du savoir (la rampe s'y joint, `rampOf`). */
  library: LibraryItem[]
  domainEmoji?: string
  /** Les couleurs CSS du domaine (`domainColorValues`) : teinte et encre. */
  colors: { base: string; ink: string }
  /** Le dernier niveau sur 5 de chaque pièce (#139), par `pieceKey`. */
  levels?: ReadonlyMap<string, number>
  /** La chip du niveau (`LevelChip` d'`entities/activity`, que cette
   *  entité ne peut pas importer). Absente : « n fois ». */
  renderLevel?: (level: number) => ReactNode
  /** Montrer le focus — par défaut sur un cycle prévu ou en cours. */
  focus?: boolean
  onPiece: (piece: Piece) => void
  onNotes: () => void
  /** « Modifier le cycle » du cadre « Aucune phase ». */
  onEditCycle?: () => void
  /** Les gestes de la tuile Étude ; absents, la tuile n'en montre pas. */
  studyActions?: StudyActions
  /** La séance qui porte la prochaine interro (« jeu. 15 · Tennis »). */
  recallSession?: string | null
  edit?: PhaseTilesEdit
}) {
  const tiles = useMemo(
    () => phaseTiles(plan, library, { domainEmoji, levels, recallSession }),
    [plan, library, domainEmoji, levels, recallSession],
  )
  // En Modifier, l'état suit l'interrupteur : allumée, une phase éteinte au
  // cycle se lit « à faire » ; éteinte, en pointillé.
  // En lecture, une phase hors cycle n'a pas de tuile — la Rétention activée
  // en a une, même éteinte avant l'acquis.
  const shown = tiles
    .filter((t) => edit || Boolean(plan[t.key]))
    .map((t) => ({
      ...t,
      state: (edit
        ? !edit.phases[t.key]
          ? 'off'
          : t.state === 'off'
            ? 'todo'
            : t.state
        : t.state) as PhaseState,
    }))
  const focused = focus ? focusedPhases(shown) : []
  const [adding, setAdding] = useState<Nature | null>(null)

  return (
    <div className="grid grid-cols-2 items-stretch gap-2.5 max-[600px]:grid-cols-1">
      {shown.length === 0 && (
        <div className="col-span-full flex min-h-40 flex-col items-center justify-center gap-3 rounded-[14px] border-[1.5px] border-dashed border-border">
          <span className="text-[13px] text-muted-foreground">
            Aucune phase
          </span>
          {onEditCycle && (
            <Button variant="outline" size="sm" onClick={onEditCycle}>
              Modifier le cycle
            </Button>
          )}
        </div>
      )}
      {shown.map((tile, i) => (
        <Tile
          key={tile.key}
          // Un nombre impair : la dernière prend toute la largeur.
          wide={!edit && i === shown.length - 1 && shown.length % 2 === 1}
          tile={tile}
          focused={focused.includes(tile.key)}
          colors={colors}
          domainEmoji={domainEmoji}
          renderLevel={renderLevel}
          onOpen={(row) =>
            row.piece.act.kind === 'study' ? onNotes() : onPiece(row.piece)
          }
          onNotes={onNotes}
          studyActions={studyActions}
          edit={edit}
          adding={adding}
          onAdding={setAdding}
        />
      ))}
    </div>
  )
}

function Tile({
  tile,
  wide,
  focused,
  colors,
  domainEmoji,
  renderLevel,
  onOpen,
  onNotes,
  studyActions,
  edit,
  adding,
  onAdding,
}: {
  tile: PhaseTile
  wide: boolean
  focused: boolean
  colors: { base: string; ink: string }
  domainEmoji: string
  renderLevel?: (level: number) => ReactNode
  onOpen: (row: TileRow) => void
  onNotes: () => void
  studyActions?: StudyActions
  edit?: PhaseTilesEdit
  adding: Nature | null
  onAdding: (nature: Nature | null) => void
}) {
  const { key, state, rows } = tile
  const done = state === 'done'
  const off = state === 'off'
  const active = !edit || edit.phases[key]
  const ramp = key === 'isolated' || key === 'situation' ? key : null

  const meta = edit
    ? active
      ? key === 'retention'
        ? `${rows.length} gardé${rows.length > 1 ? 's' : ''}`
        : `${rows.length} au cycle`
      : 'Hors cycle'
    : tile.meta

  const box: CSSProperties = {}
  if (focused)
    box.boxShadow = `inset 0 0 0 1.5px ${colors.ink}, 0 4px 14px -6px oklch(0.21 0.008 285 / 0.18)`
  // Phase réussie : le fond du kit (`Phases cycle`, #160).
  else if (done)
    box.background = `color-mix(in oklch, ${colors.base} 12%, transparent)`
  const label = done ? { color: colors.ink } : undefined

  return (
    <div
      style={box}
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-[14px] p-4',
        wide && 'col-span-full',
        focused
          ? 'bg-card'
          : off
            ? 'border-[1.5px] border-dashed border-ring/60'
            : !done && 'bg-muted',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn(
            'relative size-[52px] shrink-0 rounded-full',
            off && 'bg-border',
          )}
          style={
            off
              ? undefined
              : {
                  background: `conic-gradient(${colors.ink} 0 ${tile.ratio * 100}%, var(--color-border) 0 100%)`,
                }
          }
        >
          <span
            className={cn(
              'absolute inset-1.5 grid place-items-center rounded-full bg-card font-heading text-[13px] font-semibold tabular-nums',
              off && 'text-muted-foreground',
            )}
            style={label}
          >
            {tile.fraction}
          </span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span
            className={cn(
              'font-heading text-base font-semibold',
              off && 'text-muted-foreground',
            )}
            style={label}
          >
            {tile.label}
          </span>
          <span className="text-xs text-muted-foreground">{meta}</span>
        </span>
        {edit && (
          <button
            type="button"
            onClick={() => edit.onTogglePhase(key)}
            className="shrink-0 rounded-full"
          >
            <Switch
              on={active}
              onClassName={edit.switchClassName}
              label={`Activer ${tile.label.toLowerCase()}`}
            />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        {edit && ramp && active ? (
          <SortableRows nature={ramp} rows={rows} onReorder={edit.onReorder}>
            {(row, handle) => {
              const item = row.item
              return (
                <PhaseTileRow
                  row={row}
                  colors={colors}
                  handle={item ? handle : undefined}
                  actions={
                    item && (
                      <RowActions
                        kept={item.in_retention}
                        colors={colors}
                        inRetention={false}
                        onKeep={() => edit.onKeep(item.id, !item.in_retention)}
                        onRemove={() => edit.onRemove(item.id)}
                      />
                    )
                  }
                />
              )
            }}
          </SortableRows>
        ) : (
          rows.map((row) => {
            const item = row.item
            if (tile.study && row.piece.act.kind === 'recall')
              return (
                <RecallTileRow
                  key={row.piece.key}
                  row={row}
                  study={tile.study}
                  colors={colors}
                  onOpen={edit ? undefined : () => onOpen(row)}
                />
              )
            return (
              <PhaseTileRow
                key={row.piece.key}
                row={row}
                colors={colors}
                renderLevel={renderLevel}
                onOpen={edit ? undefined : () => onOpen(row)}
                actions={
                  edit &&
                  active &&
                  key === 'retention' &&
                  item && (
                    <RowActions
                      kept
                      colors={colors}
                      inRetention
                      onKeep={() => edit.onKeep(item.id, false)}
                    />
                  )
                }
              />
            )
          })
        )}
        {rows.length === 0 && active && (
          <div className="grid min-h-10 place-items-center rounded-lg border border-dashed border-ring/60 text-xs text-muted-foreground">
            Rien encore
          </div>
        )}
        {edit && active && ramp && (
          <AddFromLibrary
            label={ramp === 'isolated' ? '+ Exercice' : '+ Mise en situation'}
            open={adding === ramp}
            onOpenChange={(o) => onAdding(o ? ramp : null)}
            candidates={edit.candidates[ramp]}
            domainEmoji={domainEmoji}
            onAdd={(id) => edit.onAdd(ramp, id)}
          >
            {edit.renderAdd?.(ramp, () => onAdding(null))}
          </AddFromLibrary>
        )}
        {edit && active && key === 'retention' && (
          <RetentionSpacingControl
            mode={edit.spacing.mode}
            intervalDays={edit.spacing.intervalDays}
            onChange={edit.spacing.onChange}
          />
        )}
        {edit && active && key === 'study' && (
          <RecallTargetControl
            value={edit.recallTarget.value}
            onChange={edit.recallTarget.onChange}
            ink={colors.ink}
          />
        )}
      </div>
      {!edit && tile.study && studyActions && (
        <StudyGestures
          study={tile.study}
          onStudy={onNotes}
          actions={studyActions}
        />
      )}
    </div>
  )
}

/**
 * Les lignes d'une rampe en Modifier, réordonnables à la poignée (même
 * bibliothèque et mêmes seuils que `sortable-ramp`). **Vue optimiste** : le
 * nouvel ordre s'affiche tout de suite ; la promesse tenue, le cycle
 * rafraîchi fait autorité ; échouée, l'ordre d'avant revient. La générique
 * reste en dernier, hors du glisser.
 */
function SortableRows({
  nature,
  rows,
  onReorder,
  children,
}: {
  nature: Nature
  rows: TileRow[]
  onReorder: PhaseTilesEdit['onReorder']
  children: (row: TileRow, handle: ReactNode) => ReactNode
}) {
  const [local, setLocal] = useState<string[] | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )
  // Les objets de la rampe, par id ; la générique (sans objet) à part.
  const items = rows.flatMap((row) =>
    row.item ? [{ id: row.item.id, row }] : [],
  )
  const rest = rows.filter((r) => !r.item)
  const byId = new Map(items.map((e) => [e.id, e]))
  const ordered =
    local === null
      ? items
      : local.flatMap((id) => {
          const e = byId.get(id)
          return e ? [e] : []
        })

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const ids = ordered.map((e) => e.id)
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    const next = arrayMove(ids, from, to)
    setLocal(next)
    onReorder(nature, next).then(
      () => setLocal(null),
      () => setLocal(ids),
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={ordered.map((e) => e.id)}
        strategy={verticalListSortingStrategy}
      >
        {ordered.map(({ id, row }) => (
          <SortableTileRow key={id} id={id}>
            {(handle) => children(row, handle)}
          </SortableTileRow>
        ))}
      </SortableContext>
      {rest.map((row) => (
        <div key={row.piece.key}>{children(row, null)}</div>
      ))}
    </DndContext>
  )
}
