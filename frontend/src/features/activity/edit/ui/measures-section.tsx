import { Gauge, Hash, Plus, X } from 'lucide-react'
import { useState } from 'react'

import type { Metric } from '@/entities/metric'
import { type Unit, useCreateUnit, useUnits } from '@/entities/unit'
import { defaultTone, unitBadge, unitLabel } from '@/shared/lib/units'
import { cn } from '@/shared/lib/utils'
import {
  InlineMenu,
  MenuSearch,
  PanelSection,
  Rule,
  SectionIconButton,
  toast,
} from '@/shared/ui'

import { ValueField } from './value-field'

/** Une valeur déclarée : ce qu'un Total en valeur additionne. */
export interface ValueDraft {
  unit_id: string
  value: number
}

/** Un relevé tel que le panneau le montre — enregistré (`id`) ou en attente. */
export interface ReadingLine {
  id: string | null
  metric_id: string
  value: number
}

/**
 * La ligne commune aux deux groupes : emoji, nom, champ, unité.
 *
 * `target` : un relevé d'une séance pas encore faite n'est qu'une **cible**
 * (#92) — il ne compte nulle part tant qu'on ne l'a pas cochée. La ligne le
 * dit (« Cible » devant un champ pointillé, la valeur en gris) ; cocher la
 * séance la confirme telle quelle, et le champ reste là pour l'ajuster.
 */
function Line({
  emoji,
  name,
  unit,
  value,
  autoFocus,
  label,
  target = false,
  onCommit,
}: {
  emoji: string | null | undefined
  name: string
  unit: Unit | null | undefined
  value: number | null
  autoFocus?: boolean
  label: string
  target?: boolean
  onCommit: (next: number | null) => void
}) {
  // Le × ne sort qu'au survol de l'emoji, du nom ou de l'unité (et du vide à
  // droite d'un Total) — jamais du chiffre, ni des marges de la ligne qu'on
  // traverse pour l'atteindre — puis reste tant que la souris est sur la
  // ligne.
  const [cross, setCross] = useState(false)
  const show = () => setCross(true)
  return (
    <div
      onMouseLeave={() => setCross(false)}
      className="group/line flex items-center gap-2 rounded-md px-2 py-0.5 text-sm hover:bg-muted/60 has-[input:focus]:bg-transparent"
    >
      {/* L'emoji tient la marge, aligné sur les icônes de section : le nom
          garde la largeur. */}
      <span onMouseEnter={show} className="mr-0.5 w-4 shrink-0 text-center">
        {emoji ?? ''}
      </span>
      {/* Un Total n'a pas de nom : son chiffre se cale sur la colonne du
          texte, au lieu de partir à droite. */}
      {name && (
        <span
          onMouseEnter={show}
          className="min-w-0 flex-1 truncate text-muted-foreground"
        >
          {name}
        </span>
      )}
      {target && (
        <span className="shrink-0 text-[11px] text-muted-foreground">
          Cible
        </span>
      )}
      <span className="flex shrink-0 items-center gap-2">
        <ValueField
          value={value}
          unit={unit}
          onCommit={onCommit}
          autoFocus={autoFocus}
          aria-label={target ? `Cible : ${label}` : label}
          className={cn(
            target && 'text-muted-foreground focus:text-foreground',
          )}
        />
        {/* Collée au chiffre, l'unité n'est jamais tronquée. */}
        <span
          onMouseEnter={show}
          className="-ml-1.5 whitespace-nowrap text-muted-foreground"
        >
          {unitLabel(unit, value ?? 0)}
        </span>
      </span>
      <button
        type="button"
        aria-label={`Retirer : ${label}`}
        title="Retirer"
        onClick={() => onCommit(null)}
        // Cachée, elle ne prend aucune place (le nom garde la largeur) ; elle
        // glisse en place au survol de l'emoji, du nom ou de l'unité — pas du chiffre,
        // qui bougerait sous le curseur —, et reste tant qu'on y est.
        className={cn(
          '-ml-2 grid h-5 w-0 shrink-0 place-items-center overflow-hidden rounded text-muted-foreground opacity-0 transition-[width,margin,opacity] duration-150 hover:text-foreground focus-visible:ml-0 focus-visible:w-5 focus-visible:opacity-100',
          cross && 'ml-0 w-5 opacity-100',
        )}
      >
        <X className="size-3.5" />
      </button>
      {!name && <span onMouseEnter={show} className="self-stretch flex-1" />}
    </div>
  )
}

/** Une suggestion : une chip pointillée « + emoji nom ». */
interface MenuChip {
  key: string
  emoji: string | null | undefined
  label: string
  onClick: () => void
}

/** Une entrée du catalogue : emoji, nom, et un repère à droite. */
interface MenuRow {
  key: string
  emoji: string | null | undefined
  name: string
  hint?: string
  onClick: () => void
}

/**
 * Le menu d'ajout d'un Total ou d'un Résultat (#46) : la recherche, puis les
 * suggestions en chips pointillées, puis le catalogue — et, pour les unités,
 * « Créer « … » ». Un clic pose la ligne et ouvre son champ.
 */
export function AddMenu({
  query,
  onQuery,
  placeholder,
  chips,
  rows,
  onCreate,
  empty,
}: {
  query: string
  onQuery: (next: string) => void
  placeholder: string
  chips: MenuChip[]
  rows: MenuRow[]
  onCreate?: () => void
  /** Ce que dit le menu quand il n'a rien à proposer. */
  empty: string
}) {
  return (
    <InlineMenu>
      <MenuSearch value={query} onChange={onQuery} placeholder={placeholder} />
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-border px-2.5 py-2">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.onClick}
              className="inline-flex h-6 items-center gap-1 rounded-md border border-dashed border-border bg-background px-2 text-xs text-muted-foreground hover:border-solid hover:text-foreground"
            >
              <Plus className="size-[11px]" strokeWidth={2.4} />
              {c.emoji && <span>{c.emoji}</span>}
              <span>{c.label}</span>
            </button>
          ))}
        </div>
      )}
      <div className="max-h-52 overflow-y-auto p-1">
        {rows.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={r.onClick}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60"
          >
            <span className="shrink-0">{r.emoji ?? ''}</span>
            <span className="min-w-0 flex-1 truncate">{r.name}</span>
            {r.hint && (
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {r.hint}
              </span>
            )}
          </button>
        ))}
        {rows.length === 0 && chips.length === 0 && !onCreate && (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">{empty}</p>
        )}
        {onCreate && (
          <>
            {rows.length > 0 && <div className="my-1 border-t border-border" />}
            <button
              type="button"
              onClick={onCreate}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            >
              <Plus className="size-3.5 shrink-0" />
              <span className="min-w-0 truncate">Créer « {query.trim()} »</span>
            </button>
          </>
        )}
      </div>
    </InlineMenu>
  )
}

/** Recherche sur le nom (et l'étiquette d'une unité : « km » trouve « KMs »). */
const matches = (q: string, ...texts: (string | null | undefined)[]) =>
  !q || texts.some((t) => t?.toLowerCase().includes(q))

/**
 * **Totaux** : les valeurs déclarées — emoji de l'unité, champ, unité. La
 * section n'existe qu'avec une valeur, ou le temps de son ajout (#46) :
 * « Total » dans le « + » de l'en-tête ouvre le menu d'unités (`adding`) — les
 * attendues en chips (celle de l'activité type, celles des Totaux en valeur
 * des projets liés qui comptent l'activité), puis le catalogue sans unités
 * de temps, ou « Créer ». Jamais de valeur suggérée : le choix ouvre le champ,
 * vide ; quitté vide, la ligne tombe, et la section avec elle si c'était la
 * dernière.
 */
export function TotalsGroup({
  values,
  suggested,
  onChange,
  adding,
  onDone,
}: {
  values: ValueDraft[]
  suggested: Unit[]
  onChange: (next: ValueDraft[]) => void
  /** Le « + » de l'en-tête a choisi « Total » : le menu d'unités s'ouvre. */
  adding: boolean
  onDone: () => void
}) {
  // Le « + » au survol du titre (#109) ouvre le même menu.
  const [own, setOwn] = useState(false)
  const menu = adding || own
  const { data: units } = useUnits()
  const createUnit = useCreateUnit()
  const [opened, setOpened] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const byId = new Map((units ?? []).map((u) => [u.id, u]))
  const taken = new Set([...values.map((v) => v.unit_id), ...opened])

  function open(unitId: string) {
    setQuery('')
    setOwn(false)
    onDone()
    if (!taken.has(unitId)) setOpened((o) => [...o, unitId])
  }

  async function create() {
    const name = query.trim()
    try {
      // `kind` par défaut : l'utilisateur l'ajustera si besoin.
      const unit = await createUnit.mutateAsync({
        name,
        tone: defaultTone(name),
        kind: 'count',
      })
      open(unit.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'La création a échoué')
    }
  }

  function commit(unitId: string, next: number | null) {
    setOpened((o) => o.filter((id) => id !== unitId))
    const exists = values.some((v) => v.unit_id === unitId)
    if (next === null) {
      if (exists) onChange(values.filter((v) => v.unit_id !== unitId))
      return
    }
    onChange(
      exists
        ? values.map((v) => (v.unit_id === unitId ? { ...v, value: next } : v))
        : [...values, { unit_id: unitId, value: next }],
    )
  }

  if (!values.length && !opened.length && !menu) return null

  const q = query.trim().toLowerCase()
  // La recherche filtre aussi les suggestions (réponse #46).
  const chips = suggested.filter(
    (u) => !taken.has(u.id) && matches(q, u.name, u.effective_label),
  )
  const suggestedIds = new Set(suggested.map((u) => u.id))
  // Une durée se lit au calendrier : pas d'unité de temps ici.
  const catalogue = (units ?? []).filter(
    (u) =>
      !u.seconds_per_unit &&
      !taken.has(u.id) &&
      !suggestedIds.has(u.id) &&
      matches(q, u.name, u.effective_label),
  )
  const canCreate =
    q.length > 0 && !(units ?? []).some((u) => u.name.toLowerCase() === q)

  function close() {
    setQuery('')
    setOwn(false)
    onDone()
  }

  return (
    <>
      <Rule />
      <PanelSection
        icon={Hash}
        title="Totaux"
        open={menu}
        action={
          <SectionIconButton
            label="Ajouter un total"
            active={menu}
            onClick={() => (menu ? close() : setOwn(true))}
          />
        }
        onDismiss={menu ? close : undefined}
      >
        {values.map((v) => {
          const unit = byId.get(v.unit_id)
          return (
            <Line
              key={v.unit_id}
              emoji={unit?.emoji}
              name=""
              unit={unit}
              value={v.value}
              label={`Valeur en ${unit?.name ?? 'unité'}`}
              onCommit={(next) => commit(v.unit_id, next)}
            />
          )
        })}
        {opened.map((id) => {
          const unit = byId.get(id)
          return (
            <Line
              key={id}
              emoji={unit?.emoji}
              name=""
              unit={unit}
              value={null}
              autoFocus
              label={`Valeur en ${unit?.name ?? 'unité'}`}
              onCommit={(next) => commit(id, next)}
            />
          )
        })}
        {menu && (
          <AddMenu
            query={query}
            onQuery={setQuery}
            placeholder="Rechercher une unité…"
            chips={chips.map((u) => ({
              key: u.id,
              emoji: u.emoji,
              label: unitBadge(u),
              onClick: () => open(u.id),
            }))}
            rows={catalogue.map((u) => ({
              key: u.id,
              emoji: u.emoji,
              name: unitBadge(u),
              onClick: () => open(u.id),
            }))}
            onCreate={canCreate ? () => void create() : undefined}
            empty="Aucune autre unité"
          />
        )}
      </PanelSection>
    </>
  )
}

/**
 * **Résultats** : les relevés pris pendant l'activité — emoji et nom de la
 * métrique, champ, unité. Tant que la séance n'est pas faite, ce sont des
 * **cibles** (`targets`, #92) : posées sur la séance, elles ne comptent qu'une
 * fois celle-ci cochée. La section n'existe qu'avec un relevé, ou le temps
 * de son ajout (#46) : « Résultat » dans le « + » de l'en-tête ouvre le menu
 * de métriques (`adding`) — celles des Résultats des projets liés en chips,
 * puis celles du domaine. Un relevé remplace le précédent sur la courbe ; il
 * ne se cumule pas (cf. Totaux).
 */
export function ResultsGroup({
  readings,
  metrics,
  suggested,
  onAdd,
  onUpdate,
  onRemove,
  targets,
  adding,
  onDone,
}: {
  readings: ReadingLine[]
  /** La séance n'est pas faite : ses relevés sont des cibles. */
  targets: boolean
  /** Les métriques du domaine. */
  metrics: Metric[]
  suggested: Metric[]
  onAdd: (metricId: string, value: number) => void
  onUpdate: (reading: ReadingLine, value: number) => void
  onRemove: (reading: ReadingLine) => void
  /** Le « + » de l'en-tête a choisi « Résultat » : le menu s'ouvre. */
  adding: boolean
  onDone: () => void
}) {
  // Le « + » au survol du titre (#109) ouvre le même menu.
  const [own, setOwn] = useState(false)
  const menu = adding || own
  const [opened, setOpened] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const byId = new Map(metrics.map((m) => [m.id, m]))
  for (const m of suggested) if (!byId.has(m.id)) byId.set(m.id, m)
  const taken = new Set([...readings.map((r) => r.metric_id), ...opened])

  function open(metricId: string) {
    setQuery('')
    setOwn(false)
    onDone()
    if (!taken.has(metricId)) setOpened((o) => [...o, metricId])
  }

  function close() {
    setQuery('')
    setOwn(false)
    onDone()
  }

  if (!readings.length && !opened.length && !menu) return null

  const q = query.trim().toLowerCase()
  const chips = suggested.filter((m) => !taken.has(m.id) && matches(q, m.name))
  const suggestedIds = new Set(suggested.map((m) => m.id))
  const others = metrics.filter(
    (m) => !taken.has(m.id) && !suggestedIds.has(m.id) && matches(q, m.name),
  )

  return (
    <>
      <Rule />
      <PanelSection
        icon={Gauge}
        title="Résultats"
        open={menu}
        action={
          <SectionIconButton
            label="Ajouter un résultat"
            active={menu}
            onClick={() => (menu ? close() : setOwn(true))}
          />
        }
        onDismiss={menu ? close : undefined}
      >
        {readings.map((r, i) => {
          const metric = byId.get(r.metric_id)
          return (
            <Line
              key={r.id ?? `${r.metric_id}-${i}`}
              emoji={metric?.emoji}
              name={metric?.name ?? 'Métrique'}
              unit={metric?.unit}
              value={r.value}
              label={`Relevé de ${metric?.name ?? 'la métrique'}`}
              target={targets}
              onCommit={(next) =>
                next === null ? onRemove(r) : onUpdate(r, next)
              }
            />
          )
        })}
        {opened.map((id) => {
          const metric = byId.get(id)
          return (
            <Line
              key={id}
              emoji={metric?.emoji}
              name={metric?.name ?? 'Métrique'}
              unit={metric?.unit}
              value={null}
              autoFocus
              label={`Relevé de ${metric?.name ?? 'la métrique'}`}
              target={targets}
              onCommit={(next) => {
                setOpened((o) => o.filter((x) => x !== id))
                if (next !== null) onAdd(id, next)
              }}
            />
          )
        })}
        {menu && (
          <AddMenu
            query={query}
            onQuery={setQuery}
            placeholder="Rechercher une métrique…"
            chips={chips.map((m) => ({
              key: m.id,
              emoji: m.emoji,
              label: m.name,
              onClick: () => open(m.id),
            }))}
            rows={others.map((m) => ({
              key: m.id,
              emoji: m.emoji,
              name: m.name,
              hint: m.unit ? unitLabel(m.unit, 2) : undefined,
              onClick: () => open(m.id),
            }))}
            empty={
              metrics.length === 0
                ? 'Aucune métrique dans ce domaine'
                : 'Aucune autre métrique'
            }
          />
        )}
      </PanelSection>
    </>
  )
}
