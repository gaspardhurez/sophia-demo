import { useState } from 'react'

import { type Resource, useUpdateResource } from '@/entities/resource'
import { ApiError } from '@/shared/api'
import { toast } from '@/shared/ui'

/**
 * « Section(s) concernée(s) » (#173, `prod/Notes`) : la **partie** de la
 * ressource (`part` — « 4:10 → 9:30 », « chapitre 6 »), éditable sur place,
 * comme dans la maquette. Vide, elle dit « Toute la ressource », en gris.
 *
 * Elle part en quittant le champ ou à Entrée ; Échap rend la valeur d'avant.
 * Un champ vidé remet la partie à nul : toute la ressource.
 */
export function ResourcePart({ resource }: { resource: Resource }) {
  const update = useUpdateResource(resource.skill_id)
  const saved = resource.part ?? ''
  // Le brouillon n'existe que pendant la saisie : hors d'elle, la valeur
  // enregistrée (qui peut changer depuis « Modifier la ressource »).
  const [draft, setDraft] = useState<string | null>(null)

  async function commit() {
    if (draft === null) return
    const part = draft.trim() || null
    setDraft(null)
    if (part === resource.part) return
    try {
      await update.mutateAsync({ id: resource.id, body: { part } })
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : 'La section n’a pas été enregistrée',
      )
    }
  }

  return (
    <label className="flex items-center gap-2.5 text-[13px]">
      <span className="shrink-0 text-muted-foreground">
        Section(s) concernée(s)
      </span>
      <input
        value={draft ?? saved}
        placeholder="Toute la ressource"
        onFocus={() => setDraft(saved)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            const field = e.currentTarget
            setDraft(null)
            // Après le rendu : le brouillon effacé, quitter n'envoie rien.
            requestAnimationFrame(() => field.blur())
          }
        }}
        className="min-w-0 flex-1 bg-transparent p-0 font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
      />
    </label>
  )
}
