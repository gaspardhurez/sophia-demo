import { useEffect, useState } from 'react'

/** Heure courante, rafraîchie chaque minute — source de l'indicateur
 * « maintenant » (trait rouge + pastilles). */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  return now
}
