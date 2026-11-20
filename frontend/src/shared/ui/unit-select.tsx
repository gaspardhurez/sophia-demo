import { type ReactNode, useMemo, useState } from 'react'
import { MoreHorizontal, Trash2, X } from 'lucide-react'

import {
  defaultTone,
  pluralOf,
  toneClasses,
  UNIT_TONES,
  unitBadge,
  type UnitKind,
  type UnitTone,
} from '@/shared/lib/units'
import { cn } from '@/shared/lib/utils'

import { Chip } from './chip'
import { EmojiField } from './emoji-field'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

/**
 * Pastille colorée d'une unité.
 *
 * `onRemove` affiche une croix **dans** la pastille, pas à côté : c'est un seul
 * objet manipulable, pas une étiquette flanquée d'un bouton.
 */
export function UnitPill({
  unit,
  onRemove,
  className,
}: {
  unit: { name: string; tone: UnitTone; effective_label?: string }
  onRemove?: () => void
  className?: string
}) {
  // Le gabarit vient de `Chip` : c'est LUI qui porte le radius, les marges et la
  // taille de texte. Les recopier ici, c'était laisser les deux pastilles
  // rediverger — l'unité restait d'un cran plus grande que les autres alors que
  // tout le reste avait déjà convergé. Ne restent en propre que la teinte (au
  // choix de l'utilisateur, pas sémantique) et la croix de retrait.
  return (
    <Chip className={cn(toneClasses(unit.tone), onRemove && 'pr-1', className)}>
      {unitBadge(unit)}
      {onRemove && (
        <button
          type="button"
          aria-label={`Retirer ${unit.name}`}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="opacity-60 transition-opacity hover:opacity-100"
        >
          <X className="size-3.5" />
        </button>
      )}
    </Chip>
  )
}

/** Première lettre en capitale — la règle par défaut du libellé de pastille. */
const cap = (v: string) => (v ? v[0].toUpperCase() + v.slice(1) : v)

/** Une option du catalogue, telle que le sélecteur la manipule. */
export interface UnitOption {
  id: string
  name: string
  plural: string | null
  label: string | null
  effective_plural: string
  effective_label: string
  kind: UnitKind
  tone: UnitTone
  emoji?: string | null
}

/**
 * Une entrée **épinglée** en tête du menu, hors catalogue — Heures et Fois pour
 * un Total (design #27) : elles ne se créent, ne se renomment ni ne se
 * suppriment. Son `id` est rendu tel quel par `onChange`.
 */
export interface PinnedUnit {
  id: string
  label: string
  icon: ReactNode
  /** Un kebab propre à la ligne, fourni par l'appelant — le mot d'un Total
   *  au nombre se règle depuis la ligne Fois (#58). */
  menu?: ReactNode
}

export interface UnitSelectProps {
  units: UnitOption[]
  /** Entrées hors catalogue, en tête, séparées du reste. */
  pinned?: PinnedUnit[]
  /**
   * Déclencheur fourni par l'appelant — par exemple le mot souligné d'une
   * phrase. Absent : le champ habituel, avec la pastille de l'unité.
   */
  trigger?: ReactNode
  /** `unit_id` sélectionné. */
  value: string | null
  onChange: (unitId: string | null) => void
  /** Crée l'unité et renvoie la ligne créée, pour la sélectionner aussitôt. */
  onCreate: (name: string, tone: UnitTone) => Promise<UnitOption>
  onUpdate: (
    id: string,
    patch: {
      name?: string
      plural?: string | null
      label?: string | null
      tone?: UnitTone
      emoji?: string | null
    },
  ) => Promise<void>
  onDelete: (id: string) => Promise<void>
  /**
   * Demande de suppression, confiée à l'appelant — qui annonce ce qu'elle
   * touche et propose un remplacement (design #27). Absent : suppression
   * directe via `onDelete`.
   */
  onRequestDelete?: (unit: UnitOption) => void
  placeholder?: string
  disabled?: boolean
  'aria-invalid'?: boolean
  className?: string
}

/**
 * Sélecteur d'unité, sur le modèle du select Notion.
 *
 * Le catalogue est **ouvert** : le champ filtre les options existantes et
 * propose de créer celle qu'on est en train de taper. Une liste figée
 * obligerait à toucher au code pour ajouter « brasses » ; une saisie libre
 * laissait s'installer « km », « Km » et « kilomètres » côte à côte.
 */
export function UnitSelect({
  units,
  pinned = [],
  trigger,
  value,
  onChange,
  onCreate,
  onUpdate,
  onDelete,
  onRequestDelete,
  placeholder = 'Choisir une unité',
  disabled,
  'aria-invalid': ariaInvalid,
  className,
}: UnitSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = useMemo(
    () => units.find((u) => u.id === value) ?? null,
    [units, value],
  )
  const q = query.trim()
  const matches = (text: string) => text.toLowerCase().includes(q.toLowerCase())
  // Sur le nom ou l'étiquette : on cherche « km » comme « KMs ».
  const filtered = q
    ? units.filter((u) => matches(u.name) || matches(u.effective_label))
    : units
  const pins = q ? pinned.filter((p) => matches(p.label)) : pinned
  // On ne propose la création que si la saisie n'existe pas déjà, casse comprise.
  const canCreate =
    q.length > 0 &&
    !units.some((u) => u.name.toLowerCase() === q.toLowerCase()) &&
    !pinned.some((p) => p.label.toLowerCase() === q.toLowerCase())

  function close() {
    setOpen(false)
    setQuery('')
  }

  async function create() {
    const created = await onCreate(q, defaultTone(q))
    onChange(created.id)
    close()
  }

  return (
    <Popover open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      {/* Le champ par défaut est un `div` et non un `button` : la pastille
          contient elle-même un bouton (la croix), et un bouton dans un bouton
          est invalide. */}
      <PopoverTrigger asChild>
        {trigger ?? (
          <div
            role="combobox"
            aria-expanded={open}
            aria-invalid={ariaInvalid}
            tabIndex={disabled ? -1 : 0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setOpen(true)
              }
            }}
            className={cn(
              'flex h-9 w-full cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-card px-2 text-sm outline-none',
              'transition-[border-color] duration-300',
              'hover:border-ring data-[state=open]:border-foreground/45',
              'focus-visible:border-foreground/45',
              'aria-invalid:border-destructive',
              disabled && 'pointer-events-none bg-muted opacity-60',
              className,
            )}
          >
            {selected ? (
              <UnitPill
                unit={selected}
                // La croix ne sert qu'une fois le menu ouvert : au repos, le
                // champ est une lecture, pas un contrôle à défaire.
                onRemove={open ? () => onChange(null) : undefined}
              />
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </div>
        )}
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className={cn(
          'min-w-60 p-0',
          !trigger && 'w-[var(--radix-popover-trigger-width)]',
        )}
      >
        {/* Pas de rappel de la sélection ici : elle est déjà dans le champ
            juste au-dessus, sur lequel on vient de cliquer. */}
        <div className="border-b border-border p-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              const first = pins[0]?.id ?? filtered[0]?.id
              if (first) {
                onChange(first)
                close()
              } else if (canCreate) void create()
            }}
            placeholder="Rechercher ou créer…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="max-h-60 overflow-y-auto p-1">
          {pins.map((p) => (
            <div
              key={p.id}
              className={cn(
                'flex h-[30px] items-center gap-2 rounded-md px-2 transition-colors hover:bg-muted',
                value === p.id && 'bg-muted',
              )}
            >
              <button
                type="button"
                onClick={() => {
                  onChange(p.id)
                  close()
                }}
                className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
              >
                <span className="grid size-4 shrink-0 place-items-center text-[13px] leading-none text-muted-foreground [&>svg]:size-3.5">
                  {p.icon}
                </span>
                <span className="truncate">{p.label}</span>
              </button>
              {p.menu}
            </div>
          ))}
          {pins.length > 0 && (filtered.length > 0 || canCreate) && (
            <div className="-mx-1 my-1 h-px bg-border" />
          )}
          {filtered.map((u) => (
            <div
              key={u.id}
              className={cn(
                'group flex h-[30px] items-center gap-2 rounded-md px-2 transition-colors hover:bg-muted',
                value === u.id && 'bg-muted',
              )}
            >
              {/* Emoji et étiquette, sans teinte (kit « UnitSelect · menu ») :
                  la liste se lit, la pastille colorée reste pour le champ. */}
              <button
                type="button"
                onClick={() => {
                  onChange(u.id)
                  close()
                }}
                className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
              >
                <span className="grid size-4 shrink-0 place-items-center text-[13px] leading-none">
                  {u.emoji}
                </span>
                <span className="truncate">{u.effective_label}</span>
              </button>
              <UnitMenu
                unit={u}
                onUpdate={onUpdate}
                onDelete={async () => {
                  if (onRequestDelete) {
                    close()
                    onRequestDelete(u)
                    return
                  }
                  await onDelete(u.id)
                  if (value === u.id) onChange(null)
                }}
              />
            </div>
          ))}
          {canCreate && (
            <button
              type="button"
              onClick={() => void create()}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
            >
              <span className="text-muted-foreground">Créer</span>
              <span className="font-medium">« {q} »</span>
            </button>
          )}
          {filtered.length === 0 && pins.length === 0 && !canCreate && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              Aucune unité.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Menu d'une option : emoji, accord, étiquette, teinte, suppression.
 *
 * Popover imbriqué, ancré **sur le bouton** — il se superpose à la liste au
 * lieu de la remplacer, et s'ouvre là où on a cliqué.
 */
function UnitMenu({
  unit,
  onUpdate,
  onDelete,
}: {
  unit: UnitOption
  onUpdate: UnitSelectProps['onUpdate']
  onDelete: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(unit.name)
  const [plural, setPlural] = useState(unit.plural ?? '')
  const [label, setLabel] = useState(unit.label ?? '')

  function commitName() {
    const n = name.trim()
    if (n && n !== unit.name) void onUpdate(unit.id, { name: n })
  }
  function commitPlural() {
    const p = plural.trim()
    if (p !== (unit.plural ?? '')) void onUpdate(unit.id, { plural: p || null })
  }
  function commitLabel() {
    const l = label.trim()
    if (l !== (unit.label ?? '')) void onUpdate(unit.id, { label: l || null })
  }

  // Le singulier tel qu'il se tape : l'accord et l'aperçu le suivent.
  const singular = name.trim() || unit.name
  const field =
    'h-7 min-w-0 rounded-md border border-transparent bg-muted px-2 text-[13px] outline-none placeholder:text-muted-foreground hover:border-border focus:border-foreground/45 focus:bg-card'

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setName(unit.name)
          setPlural(unit.plural ?? '')
          setLabel(unit.label ?? '')
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Options de ${unit.name}`}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </PopoverTrigger>

      {/* Kit « UnitSelect · menu » : l'emoji et le singulier en tête, puis
          l'accord et l'étiquette avec leur aperçu, les teintes, la suppression. */}
      <PopoverContent align="start" side="right" className="w-[248px] p-0">
        {/* L'emoji vit sur l'UNITÉ : une barre annonce une mesure, et c'est la
            mesure qui se dessine. */}
        <div className="flex items-center gap-2 px-2.5 pt-2.5 pb-2">
          <EmojiField
            value={unit.emoji ?? undefined}
            onChange={(emoji) => void onUpdate(unit.id, { emoji })}
            aria-label={`Emoji de ${unit.name}`}
            className="size-8 shrink-0 text-[17px]"
          />
          <input
            autoFocus
            aria-label="Singulier"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === 'Enter' && commitName()}
            className="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 font-heading text-[15px] font-semibold outline-none hover:border-border focus:border-foreground/45"
          />
        </div>

        <div className="grid grid-cols-[56px_minmax(0,1fr)] items-start gap-x-2 gap-y-1 px-2.5 pb-2.5 text-xs">
          <label
            htmlFor={`u-plural-${unit.id}`}
            className="leading-7 text-muted-foreground"
          >
            Pluriel
          </label>
          <input
            id={`u-plural-${unit.id}`}
            value={plural}
            onChange={(e) => setPlural(e.target.value)}
            onBlur={commitPlural}
            onKeyDown={(e) => e.key === 'Enter' && commitPlural()}
            placeholder={pluralOf(singular)}
            className={field}
          />
          <span />
          <span className="-mt-0.5 mb-1 text-muted-foreground tabular-nums">
            1 {singular} · 12 {plural.trim() || pluralOf(singular)}
          </span>
          <label
            htmlFor={`u-label-${unit.id}`}
            className="leading-7 text-muted-foreground"
          >
            Étiquette
          </label>
          <input
            id={`u-label-${unit.id}`}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => e.key === 'Enter' && commitLabel()}
            placeholder={cap(singular)}
            className={field}
          />
          <span />
          <span className="-mt-0.5 mb-1">
            <Chip className={toneClasses(unit.tone)}>
              {label.trim() || cap(singular)}
            </Chip>
          </span>
        </div>

        <div className="grid grid-cols-5 gap-1.5 border-t border-border p-2.5">
          {UNIT_TONES.map(({ key, label: toneLabel }) => (
            <button
              key={key}
              type="button"
              title={toneLabel}
              aria-label={toneLabel}
              aria-pressed={unit.tone === key}
              onClick={() => void onUpdate(unit.id, { tone: key })}
              className={cn(
                'grid h-7 place-items-center rounded-md text-xs font-semibold',
                toneClasses(key),
                unit.tone === key
                  ? 'ring-[1.5px] ring-foreground ring-offset-2 ring-offset-popover'
                  : 'hover:ring-[1.5px] hover:ring-ring',
              )}
            >
              Aa
            </button>
          ))}
        </div>

        <div className="border-t border-border p-1">
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              void onDelete()
            }}
            className="flex h-[30px] w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-destructive hover:bg-destructive/[.08]"
          >
            <Trash2 className="size-3.5" />
            Supprimer l&apos;unité
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
