import { type Domain, isDomainActive } from '@/entities/domain'
import { visibleWishes, type WishItem, type WishKind } from '@/entities/wish'
import type { UndoStack } from '@/shared/lib/undo-stack'
import { Skeleton } from '@/shared/ui'

import { useWishLists } from '../model/use-wish-lists'
import { WishBox } from './wish-box'

const BOXES: {
  kind: WishKind
  title: string
  placeholder: string
  addLabel: string
  tone: 'amber' | 'neutral'
}[] = [
  {
    kind: 'wish',
    title: 'Envies',
    placeholder: 'Écrire une envie…',
    addLabel: 'Ajouter une envie',
    tone: 'amber',
  },
  {
    kind: 'commitment',
    title: 'Engagements',
    placeholder: 'Écrire un engagement…',
    addLabel: 'Ajouter un engagement',
    tone: 'neutral',
  },
]

/**
 * Envies et Engagements (#215, `kit/Envies`), en tête de la colonne du
 * calendrier : deux encadrés qu'on écrit sur place, sans date ni coche.
 * Filtrés par les domaines choisis dans la colonne ; une puce écrite pendant
 * un filtre prend le premier domaine choisi. Le × supprime sans confirmer :
 * ⌘Z la remet (la pile du calendrier).
 */
export function WishLists({
  domains,
  selected,
  undoStack,
}: {
  /** Tous les domaines, dans leur ordre (le menu d'une puce : les actifs
   *  d'abord ; une puce garde l'emoji d'un domaine en veille). */
  domains: Domain[]
  /** Les domaines choisis dans la colonne, dans l'ordre du choix. */
  selected: string[]
  undoStack?: UndoStack
}) {
  const { lists, setList } = useWishLists()
  if (!lists)
    return (
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-20 rounded-[10px]" />
        <Skeleton className="h-14 rounded-[10px]" />
      </div>
    )

  const order = domains.map((d) => d.id)
  const menu = [
    ...domains.filter(isDomainActive),
    ...domains.filter((d) => !isDomainActive(d)),
  ]

  function remove(kind: WishKind, item: WishItem) {
    const at = lists![kind].findIndex((i) => i.id === item.id)
    setList(kind, (list) => list.filter((i) => i.id !== item.id))
    undoStack?.push(async () =>
      setList(kind, (list) => {
        if (list.some((i) => i.id === item.id)) return list
        const next = [...list]
        next.splice(Math.min(at, next.length), 0, item)
        return next
      }),
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      {BOXES.map((b) => (
        <WishBox
          key={b.kind}
          title={b.title}
          placeholder={b.placeholder}
          addLabel={b.addLabel}
          tone={b.tone}
          items={lists[b.kind]}
          view={visibleWishes(lists[b.kind], selected, order)}
          domains={menu}
          newDomainId={selected[0] ?? null}
          onChange={(update) => setList(b.kind, update)}
          onRemove={(item) => remove(b.kind, item)}
        />
      ))}
    </div>
  )
}
