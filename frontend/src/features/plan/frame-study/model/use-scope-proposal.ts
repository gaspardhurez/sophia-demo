import { useRef, useState } from 'react'

import { useFramingScope } from '@/entities/plan'

import type { ScopeTag } from '../lib/scope-text'

/**
 * Le périmètre proposé par Sophia (#175, temps 2) — tenu par la modale :
 * revenir au périmètre ne redemande rien tant que l'intention n'a pas
 * changé.
 *
 * - `ask(intention)` : demandé **à l'arrivée sur l'étape**, d'après
 *   l'intention de l'écran ; une même intention ne redemande pas (sauf
 *   après un échec). Les parties rendues passent à `onProposals`, qui les
 *   fond dans les éléments (`mergeProposals`).
 * - `loading` : le squelette ; `failed` : l'erreur et Réessayer (`retry`).
 */
export function useScopeProposal(
  planId: string,
  onProposals: (tags: ScopeTag[]) => void,
) {
  const { mutateAsync: propose } = useFramingScope(planId)
  // L'attente se tient ici, comme dans le chat (`use-intention-chat.ts`) :
  // demandée à l'arrivée sur l'étape, la mutation peut perdre son
  // observateur au double montage de StrictMode.
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  // L'intention de la dernière demande aboutie (ou en cours).
  const asked = useRef<string | null | undefined>(undefined)

  function request(intention: string | null) {
    asked.current = intention
    setFailed(false)
    setLoading(true)
    propose(intention)
      .then((tags) =>
        onProposals(tags.map((t) => ({ label: t.label, inCycle: t.in_cycle }))),
      )
      .catch(() => {
        asked.current = undefined
        setFailed(true)
      })
      .finally(() => setLoading(false))
  }

  function ask(intention: string | null) {
    if (loading || asked.current === intention) return
    request(intention)
  }

  return {
    ask,
    loading,
    failed,
    retry: (intention: string | null) => request(intention),
  }
}

export type ScopeProposal = ReturnType<typeof useScopeProposal>
