import { useState } from 'react'

import { type ResourceProposal, useFramingResources } from '@/entities/plan'

/** Les cartes montrées à la fois (`prod/Cadrer etude - Ressources` : 3) ;
 *  une ajoutée, la suivante des propositions la remplace. */
const SHOWN = 3

/**
 * La recherche de ressources de Sophia (#175, temps 3) — tenue par la
 * modale, pour qu'un Retour au périmètre ne perde pas ses cartes.
 *
 * **Elle part au clic, jamais seule** : « Chercher des ressources » à
 * l'arrivée, puis « Chercher à nouveau ».
 *
 * - `run(preferences, added)` : les préférences de l'écran, et les liens
 *   déjà dans « Ajoutées ». Sont écartés de la recherche ces liens et
 *   **ceux déjà proposés** (les cartes montrées, celles ajoutées d'ici).
 * - `shown` : les `SHOWN` premières propositions pas encore ajoutées.
 *   `take` en retire une (on l'ajoute), `untake` la rend (l'ajout a
 *   échoué).
 * - `stale` : « Chercher à nouveau » s'éclaire — une préférence gardée ou
 *   une ressource (à soi) a changé depuis la dernière recherche
 *   (`touch`).
 * - `proposals` nul : pas encore cherché ; vide : rien de solide.
 */
export function useResourceSearch(planId: string, savedPreferences: string) {
  const search = useFramingResources(planId)
  const [proposals, setProposals] = useState<ResourceProposal[] | null>(null)
  const [taken, setTaken] = useState<ReadonlySet<string>>(new Set())
  const [failed, setFailed] = useState(false)
  // Les préférences de la dernière recherche aboutie, et si une ressource
  // a changé depuis.
  const [searchedWith, setSearchedWith] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  const [last, setLast] = useState<{
    preferences: string
    exclude: string[]
  } | null>(null)

  const remaining = (proposals ?? []).filter((p) => !taken.has(p.url))
  const shown = remaining.slice(0, SHOWN)

  function request(body: { preferences: string; exclude: string[] }) {
    setLast(body)
    setFailed(false)
    search.mutate(body, {
      onSuccess: (found) => {
        setProposals(found)
        setSearchedWith(body.preferences)
        setTouched(false)
      },
      onError: () => setFailed(true),
    })
  }

  function run(preferences: string, added: readonly string[]) {
    if (search.isPending) return
    const exclude = new Set([...added, ...taken, ...shown.map((p) => p.url)])
    request({ preferences: preferences.trim(), exclude: [...exclude] })
  }

  return {
    run,
    retry: () => last && request(last),
    loading: search.isPending,
    failed,
    proposals,
    shown,
    /** Toutes les propositions ont été ajoutées. */
    exhausted: proposals !== null && proposals.length > 0 && !remaining.length,
    stale:
      searchedWith !== null &&
      (touched || savedPreferences.trim() !== searchedWith),
    take: (url: string) => setTaken((s) => new Set(s).add(url)),
    untake: (url: string) =>
      setTaken((s) => {
        const next = new Set(s)
        next.delete(url)
        return next
      }),
    /** Une ressource à soi a été ajoutée ou retirée. */
    touch: () => setTouched(true),
  }
}

export type ResourceSearch = ReturnType<typeof useResourceSearch>
