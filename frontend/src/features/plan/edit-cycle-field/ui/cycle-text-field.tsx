import { Plus } from 'lucide-react'
import { useState } from 'react'

import { type AcquisitionPlan, useUpdatePlan } from '@/entities/plan'
import { ApiError } from '@/shared/api'
import { toast } from '@/shared/ui'

/** Les textes libres d'un cycle qui s'écrivent en place, en tête des notes. */
export type CycleTextKey = 'target_level' | 'scope'

/** La borne du serveur sur l'Intention (`string(200)`) ; le périmètre est un
 *  texte sans borne. */
const MAX: Record<CycleTextKey, number | undefined> = {
  target_level: 200,
  scope: undefined,
}

/**
 * Un texte du cycle écrit **en place** (#173, en-tête des notes de
 * `prod/Notes`) : l'Intention (`target_level`) ou le Périmètre (`scope`). Il
 * se lit comme du texte — pas de cadre, la maquette le dessine éditable sur
 * place — et s'écrit au clic.
 *
 * - Entrée (ou quitter le champ) enregistre ; ⇧Entrée passe à la ligne ;
 *   Échap rend le texte d'avant. Rien ne part si rien n'a changé.
 * - Vide, le champ redevient « + Ajouter » (`prod/Notes`, état a) ; vider un
 *   texte l'efface au serveur (`null`).
 * - Un échec le dit dans un toast et rend le texte d'avant : le cycle reste
 *   la seule vérité.
 */
export function CycleTextField({
  plan,
  field,
  label,
}: {
  plan: AcquisitionPlan
  field: CycleTextKey
  /** Le nom du champ, pour les lecteurs d'écran. */
  label: string
}) {
  const saved = plan[field] ?? ''
  const update = useUpdatePlan()
  // `null` : on lit ; une chaîne : on écrit.
  const [draft, setDraft] = useState<string | null>(null)

  function commit(value: string) {
    setDraft(null)
    const next = value.trim()
    if (next === saved) return
    update
      .mutateAsync({ id: plan.id, body: { [field]: next || null } })
      .catch((err) =>
        toast.error(
          err instanceof ApiError
            ? err.message
            : `${label} n'a pas pu s'enregistrer`,
        ),
      )
  }

  // Le texte affiché pendant l'envoi : celui qu'on vient d'écrire.
  const shown =
    update.isPending && update.variables?.id === plan.id
      ? ((update.variables.body[field] as string | null | undefined) ?? '')
      : saved

  if (draft === null && !shown)
    return (
      <button
        type="button"
        onClick={() => setDraft('')}
        className="-ml-1.5 inline-flex h-[22px] cursor-pointer items-center gap-[5px] self-start rounded-[5px] px-1.5 text-[13px] text-muted-foreground/80 hover:bg-foreground/5 hover:text-foreground"
      >
        <Plus className="size-3" />
        Ajouter
      </button>
    )

  return (
    <textarea
      aria-label={label}
      rows={1}
      value={draft ?? shown}
      maxLength={MAX[field]}
      // Ouvert par « + Ajouter » : on écrit tout de suite.
      autoFocus={draft === ''}
      onFocus={() => draft === null && setDraft(shown)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          setDraft(null)
          // Le blur qui suit relit `saved` : rien ne part.
          e.currentTarget.value = saved
          e.currentTarget.blur()
        }
      }}
      className="block min-h-[22px] w-full resize-none bg-transparent p-0 text-pretty outline-none [field-sizing:content]"
    />
  )
}
