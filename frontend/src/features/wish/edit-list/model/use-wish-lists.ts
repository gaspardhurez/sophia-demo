import { useCallback, useEffect, useRef, useState } from 'react'

import {
  useReplaceWishes,
  useWishes,
  type WishItem,
  type WishKind,
} from '@/entities/wish'
import { ApiError } from '@/shared/api'
import { toast } from '@/shared/ui'

export type WishLists = Record<WishKind, WishItem[]>

const KINDS: WishKind[] = ['wish', 'commitment']
const DELAY = 400

/**
 * Les deux listes, tenues ici dès le chargement : on écrit dans cet état,
 * le serveur suit. Chaque changement d'une liste l'enregistre entière après
 * une courte pause de frappe (les écritures d'une même liste partent l'une
 * après l'autre) ; ce qui attend part au démontage.
 */
export function useWishLists() {
  const { data } = useWishes()
  const replace = useReplaceWishes()
  const [lists, setLists] = useState<WishLists | null>(null)
  const latest = useRef<WishLists | null>(null)
  latest.current = lists
  const timers = useRef<Partial<Record<WishKind, number>>>({})
  const chain = useRef<Promise<boolean>>(Promise.resolve(true))
  const replaceRef = useRef(replace.mutateAsync)
  replaceRef.current = replace.mutateAsync

  /** Enregistre la liste d'un genre telle qu'elle est ; dit si c'est fait. */
  const flush = useCallback((kind: WishKind): Promise<boolean> => {
    window.clearTimeout(timers.current[kind])
    delete timers.current[kind]
    const items = latest.current?.[kind]
    if (!items) return chain.current
    chain.current = chain.current.then(() =>
      replaceRef.current({ kind, items }).then(
        () => true,
        (err) => {
          toast.error(
            err instanceof ApiError ? err.message : "L'enregistrement a échoué",
          )
          return false
        },
      ),
    )
    return chain.current
  }, [])

  // Au chargement : les deux listes telles que la base les tient.
  useEffect(() => {
    if (!data || lists) return
    const next: WishLists = {
      wish: data.filter((w) => w.kind === 'wish'),
      commitment: data.filter((w) => w.kind === 'commitment'),
    }
    latest.current = next
    setLists(next)
  }, [data, lists])

  useEffect(
    () => () => {
      for (const kind of KINDS) if (timers.current[kind]) void flush(kind)
    },
    [flush],
  )

  const setList = useCallback(
    (kind: WishKind, update: (items: WishItem[]) => WishItem[]) => {
      setLists((cur) => {
        if (!cur) return cur
        const next = { ...cur, [kind]: update(cur[kind]) }
        latest.current = next
        return next
      })
      window.clearTimeout(timers.current[kind])
      timers.current[kind] = window.setTimeout(() => void flush(kind), DELAY)
    },
    [flush],
  )

  return { lists, setList }
}
