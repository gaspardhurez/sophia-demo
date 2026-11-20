import { useEffect, useState } from 'react'

import type { SaveStatus } from './use-autosave'

/** Combien de temps « Enregistré » reste affiché après une modification. */
const SAVED_FOR = 5000

/**
 * L'état d'enregistrement ne se montre qu'autour d'une modification : visible
 * pendant l'attente et l'envoi, puis « Enregistré » 5 s, puis il s'efface. Une
 * erreur reste affichée. À l'ouverture de la page, rien ne s'affiche.
 */
export function useStatusShown(status: SaveStatus): boolean {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (status !== 'saved') {
      setShown(true)
      return
    }
    const timer = setTimeout(() => setShown(false), SAVED_FOR)
    return () => clearTimeout(timer)
  }, [status])
  return shown
}
