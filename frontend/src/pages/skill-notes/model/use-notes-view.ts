import { useSearchParams } from 'react-router-dom'

/** Ce que montre la page à droite de la colonne : une vue à la fois. */
export type NotesView =
  | { kind: 'notes' }
  | { kind: 'questions' }
  | { kind: 'resource'; resourceId: string }

/** Les paramètres d'URL qui choisissent la vue — et `?question=`, qui ne
 *  vaut que pour l'arrivée sur les notes. */
const VIEW_PARAMS = ['vue', 'ressource', 'question'] as const

/**
 * La vue de la page des notes (#173, `prod/Notes`), **dans l'URL** — un
 * rechargement ou un lien la rouvre, Précédent y revient :
 *
 * - rien : les notes du savoir ;
 * - `?vue=questions` : « Préparer les questions » ;
 * - `?ressource=<resource_id>` : une ressource du cycle.
 *
 * Changer de vue retire les paramètres des autres (`?question=` compris :
 * défiler jusqu'à une question ne vaut qu'à l'arrivée).
 */
export function useNotesView() {
  const [params, setParams] = useSearchParams()
  const resourceId = params.get('ressource')
  const view: NotesView = resourceId
    ? { kind: 'resource', resourceId }
    : params.get('vue') === 'questions'
      ? { kind: 'questions' }
      : { kind: 'notes' }

  function go(next: Partial<Record<'vue' | 'ressource', string>>) {
    setParams((prev) => {
      const p = new URLSearchParams(prev)
      VIEW_PARAMS.forEach((k) => p.delete(k))
      Object.entries(next).forEach(([k, v]) => v && p.set(k, v))
      return p
    })
  }

  return {
    view,
    showNotes: () => go({}),
    showQuestions: () => go({ vue: 'questions' }),
    showResource: (id: string) => go({ ressource: id }),
  }
}
