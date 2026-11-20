import { useState } from 'react'

import { useDomain, useUpdateDomain } from '@/entities/domain'
import { ApiError } from '@/shared/api'
import { toast } from '@/shared/ui'

/** La borne du serveur (`resource_preferences`, 2000 caractères). */
export const PREFERENCES_MAX = 2000

/**
 * « Tu as des préférences ? (format, sources…) » (#175, temps 3) : un texte
 * libre **gardé par domaine** (`domain.resource_preferences`), pré-rempli
 * au savoir suivant du domaine, sans limite de durée.
 *
 * - `text` : ce qui est dans le champ — celui du domaine tant qu'on n'y a
 *   pas touché.
 * - `commit` : quand le champ perd le focus (ou sur Entrée), le texte
 *   s'écrit au domaine s'il a changé (`PATCH /domains/{id}` ; vide → nul).
 * - `saved` : le texte gardé, celui que la recherche relit — « Chercher à
 *   nouveau » s'éclaire quand il diffère de celui de la dernière
 *   recherche.
 */
export function useResourcePreferences(domainId: string | undefined) {
  const { data: domain } = useDomain(domainId)
  const update = useUpdateDomain()
  // Nul tant qu'on n'a rien tapé : le champ suit le domaine.
  const [typed, setTyped] = useState<string | null>(null)
  const stored = domain?.resource_preferences ?? ''
  const [saved, setSaved] = useState<string | null>(null)
  const text = typed ?? stored

  function commit() {
    const next = text.trim()
    if (next === (saved ?? stored).trim()) return
    setSaved(next)
    if (!domainId || next === stored.trim()) return
    update
      .mutateAsync({
        id: domainId,
        body: { resource_preferences: next || null },
      })
      .catch((err) =>
        toast.error(
          err instanceof ApiError
            ? err.message
            : 'Les préférences n’ont pas pu s’enregistrer',
        ),
      )
  }

  return {
    text,
    setText: setTyped,
    commit,
    saved: (saved ?? stored).trim(),
    /** Le champ porte un texte pas encore gardé. */
    changed: text.trim() !== (saved ?? stored).trim(),
  }
}

export type ResourcePreferences = ReturnType<typeof useResourcePreferences>
