import { useCallback, useRef, useState } from 'react'

import {
  type CentralIdea,
  type IdeasFailure,
  ideasFailure,
  useCentralIdeas,
} from '@/entities/companion'

/** Où en sont les idées d'une section : demandées, rendues (vides : rien à
 *  ajouter), ou échouées. */
export type SectionIdeas =
  | { state: 'loading' }
  | { state: 'done'; ideas: CentralIdea[] }
  | { state: 'failed'; failure: IdeasFailure }

/**
 * Les idées centrales de « Préparer les questions » (#173), **le temps de la
 * visite** : une section n'est demandée qu'une fois — à la première fois
 * qu'elle se montre, l'interrupteur allumé —, et son résultat reste tant que
 * la vue est ouverte, même éteint puis rallumé. Rien ne se redemande à la
 * frappe : les notes ne s'écrivent pas ici, et une question posée (« +
 * Question », « Écrire la question ») ne rappelle pas le modèle — la carte
 * écrite part, les autres restent. Quitter la vue oublie tout : le serveur
 * n'a rien gardé.
 *
 * Une carte se dit **écartée** (« Pas besoin ») ou **écrite** (« Écrire la
 * question ») par sa clé `section:rang` ; l'une ou l'autre la retire.
 */
export function useSectionIdeas(skillId: string) {
  const propose = useCentralIdeas(skillId)
  const [bySection, setBySection] = useState<Record<string, SectionIdeas>>({})
  // Ce qui est parti, sans attendre le rendu : deux sections visibles d'un
  // coup, ou un effet rejoué, ne doublent pas l'appel.
  const asked = useRef(new Set<string>())
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set())

  /** Demande les idées d'une section, sauf si c'est déjà fait (`force` :
   *  redemander après un échec). */
  const request = useCallback(
    (sectionId: string, fragment: Record<string, unknown>, force = false) => {
      if (asked.current.has(sectionId) && !force) return
      asked.current.add(sectionId)
      setBySection((m) => ({ ...m, [sectionId]: { state: 'loading' } }))
      propose.mutateAsync(fragment).then(
        (ideas) =>
          setBySection((m) => ({
            ...m,
            [sectionId]: { state: 'done', ideas },
          })),
        (error: unknown) =>
          setBySection((m) => ({
            ...m,
            [sectionId]: { state: 'failed', failure: ideasFailure(error) },
          })),
      )
    },
    // `propose` change d'identité à chaque rendu ; seul `mutateAsync` sert.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  /** Retire une carte (écartée ou écrite) pour la visite. */
  const drop = useCallback(
    (key: string) => setGone((s) => new Set(s).add(key)),
    [],
  )

  return { bySection, request, gone, drop } as const
}
