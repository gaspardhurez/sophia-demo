import { useDraggable } from '@dnd-kit/core'

import { domainColor } from '@/entities/domain'
import { cn } from '@/shared/lib/utils'

/**
 * Chip d'activité type (#57) : emoji et titre, teinte du domaine. Elle se
 * glisse dans la grille pour y poser une occurrence de ce type.
 *
 * C'était une tuile carrée à l'emoji seul : à dix-sept activités types sur
 * neuf domaines, la bande ne se lisait plus.
 */
export function HabitTile({
  id,
  emoji,
  color,
  title,
}: {
  id: string
  emoji: string | null
  color: string | null
  title: string
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `habit:${id}`,
  })
  return (
    <button
      ref={setNodeRef}
      type="button"
      title={title}
      {...listeners}
      {...attributes}
      className={cn(
        'inline-flex h-8 max-w-full min-w-0 shrink-0 cursor-grab items-center gap-1.5 rounded-lg border pr-2.5 pl-2 text-[13px] font-medium active:cursor-grabbing',
        domainColor(color).soft,
        isDragging && 'opacity-40',
      )}
    >
      <span className="text-[15px] leading-none">{emoji}</span>
      <span className="truncate">{title}</span>
    </button>
  )
}
