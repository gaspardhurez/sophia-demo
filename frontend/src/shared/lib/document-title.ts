import { useEffect } from 'react'

const APP_NAME = 'Sophia'

/**
 * Titre de l'onglet.
 *
 * Toutes les pages s'appelaient « Sophia » : deux onglets ouverts ou trois
 * entrées d'historique étaient indiscernables. `undefined` (chargement, entité
 * introuvable) retombe sur le nom de l'app seul.
 */
export function useDocumentTitle(title?: string | null) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME
  }, [title])
}
