import {
  useCreateUnit,
  useDeleteUnit,
  useUnits,
  useUpdateUnit,
} from '../api/queries'
import { type ReactNode, useState } from 'react'

import { type PinnedUnit, toast, UnitSelect } from '@/shared/ui'

import type { Unit } from '../model/types'
import { UnitDeleteDialog } from './unit-delete-dialog'

/**
 * Champ « unité » branché sur le référentiel.
 *
 * `UnitSelect` reste présentationnel dans `shared/ui` — c'est ici qu'on câble
 * les mutations. Le composant vit dans l'entité et non dans une feature : ses
 * consommateurs (le dialogue de création, l'en-tête de projet, le formulaire
 * d'activité type) sont sur trois couches différentes, et deux slices de même
 * couche ne peuvent pas s'importer.
 */
export function UnitField({
  value,
  onChange,
  disabled,
  invalid,
  className,
  placeholder,
  pinned,
  trigger,
  exclude,
}: {
  /** Entrées hors catalogue en tête du menu (cf. `UnitSelect`). */
  pinned?: PinnedUnit[]
  /** Déclencheur fourni par l'appelant (cf. `UnitSelect`). */
  trigger?: ReactNode
  /** Unités du catalogue à ne pas proposer. */
  exclude?: (unit: { seconds_per_unit?: number | null }) => boolean
  value: string | null
  onChange: (unitId: string | null) => void
  disabled?: boolean
  invalid?: boolean
  className?: string
  placeholder?: string
}) {
  const { data: units } = useUnits()
  const create = useCreateUnit()
  const update = useUpdateUnit()
  const remove = useDeleteUnit()
  const [deleting, setDeleting] = useState<Unit | null>(null)

  return (
    <>
      <UnitSelect
        units={(units ?? []).filter((u) => !exclude?.(u))}
        pinned={pinned}
        trigger={trigger}
        value={value}
        onChange={onChange}
        disabled={disabled}
        aria-invalid={invalid}
        className={className}
        placeholder={placeholder}
        onCreate={async (name, tone) => {
          try {
            // `kind` par défaut : l'utilisateur l'ajustera si besoin.
            return await create.mutateAsync({ name, tone, kind: 'count' })
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : 'La création a échoué',
            )
            throw err
          }
        }}
        onUpdate={async (id, patch) => {
          try {
            await update.mutateAsync({ id, body: patch })
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : 'La modification a échoué',
            )
          }
        }}
        onDelete={async (id) => {
          await remove.mutateAsync({ id })
        }}
        // Toute suppression passe par la modale : elle annonce le sort de chaque
        // usage et propose de remplacer l'unité (design #27).
        onRequestDelete={(u) =>
          setDeleting((units ?? []).find((x) => x.id === u.id) ?? null)
        }
      />
      <UnitDeleteDialog
        unit={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={(replaceBy) => {
          if (deleting && value === deleting.id) onChange(replaceBy)
        }}
      />
    </>
  )
}
