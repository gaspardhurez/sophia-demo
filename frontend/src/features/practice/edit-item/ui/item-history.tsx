import { type Activity, actsOfItem, useActivities } from '@/entities/activity'
import type { PracticeItem } from '@/entities/practice'
import { fmtShortDate } from '@/shared/lib/date'

/**
 * L'historique d'un objet — **les séances qui l'ont visé**, rien de plus.
 *
 * Il ne se maintient pas : c'est une projection du calendrier. Une ligne par
 * passe, datée, avec les notes de la séance.
 *
 * À droite, ce que la passe a donné. Sur un objet qu'on juge à la main, c'est
 * le **titre de la séance** — « Match », « Match amical » : le contexte, seule
 * chose qui distingue deux passages d'une même application. Sur un intégré ou
 * une interro, ce sera son score ; tant que la passation n'existe pas, rien ne
 * le produit, et la place reste vide plutôt que d'afficher un score inventé.
 */
export function ItemHistory({ item }: { item: PracticeItem }) {
  const { data: activities } = useActivities({ skillId: item.skill_id })
  const passes = (activities ?? [])
    .filter((a: Activity) => actsOfItem(a, item.id).length > 0)
    .sort((a, b) => (b.start_at ?? '').localeCompare(a.start_at ?? ''))

  if (passes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucune passe. Planifie-la pour qu'elle en ait une.
      </p>
    )
  }

  return (
    <ul className="divide-y divide-border">
      {passes.map((a) => (
        <li key={a.id} className="py-2 first:pt-0 last:border-b-0 last:pb-0">
          <div className="flex items-baseline gap-2.5">
            <span className="min-w-0 flex-1 text-[13px] font-medium">
              {a.start_at ? fmtShortDate(new Date(a.start_at)) : 'non datée'}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {!a.done ? 'à venir' : item.kind === 'manual' ? a.title : null}
            </span>
          </div>
          {a.notes && (
            <p className="mt-1 text-[13px] text-pretty text-foreground/80">
              {a.notes}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}
