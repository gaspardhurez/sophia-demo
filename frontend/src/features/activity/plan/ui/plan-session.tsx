import { CalendarPlus } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { useCreateActivity } from '@/entities/activity'
import { PRACTICE_NATURE_META, usePracticeItems } from '@/entities/practice'
import { ApiError } from '@/shared/api'
import { addDays, startOfDay, toLocalISO } from '@/shared/lib/date'
import { cn } from '@/shared/lib/utils'
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  toast,
} from '@/shared/ui'

/** Une semaine de jours proposés : au-delà, on planifie au calendrier. */
const HORIZON = 7

/**
 * Poser une séance sur un savoir, sans quitter la page où on est.
 *
 * **Deux clics, pas trois.** Le rituel visé est hebdomadaire — on passe en revue
 * ce qu'on travaille et on jalonne la semaine —, donc le jour se choisit dans
 * une rangée de boutons et l'activité part au clic. Pas de champ date à remplir,
 * pas de formulaire à valider : ouvrir le calendrier pour poser une séance
 * coûtait déjà moins cher que ça.
 *
 * La séance naît **en journée entière** : à ce stade on décide qu'on va
 * travailler ce savoir tel jour, pas à quelle heure. L'heure se donne au
 * calendrier, en glissant le bloc, si elle compte.
 */
export function PlanSession({
  skillId,
  skillName,
  domainId,
  trigger,
}: {
  skillId: string
  skillName: string
  domainId: string
  /** Le déclencheur, quand l'écran en veut un autre que le bouton icône. */
  trigger?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [itemId, setItemId] = useState<string | null>(null)
  const create = useCreateActivity()
  const { data: items } = usePracticeItems(open ? skillId : undefined)

  const today = startOfDay(new Date())
  const days = Array.from({ length: HORIZON }, (_, i) => addDays(today, i))

  async function plan(day: Date) {
    const at = toLocalISO(startOfDay(day))
    const item = items?.find((i) => i.id === itemId)
    try {
      await create.mutateAsync({
        domain_id: domainId,
        // Un acte : l'exercice choisi, sinon l'étude du savoir (#82).
        acts: [
          {
            skill_id: skillId,
            kind: itemId ? 'practice' : 'study',
            practice_item_id: itemId,
          },
        ],
        // Le titre par défaut nomme ce qu'on va faire, pas le savoir : « Match
        // du samedi » se relit mieux qu'un énième « Water start » dans une
        // semaine chargée.
        title: item?.title ?? skillName,
        all_day: true,
        start_at: at,
        end_at: at,
        done: false,
      })
      setOpen(false)
      setItemId(null)
      toast.success('Séance posée')
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'La planification a échoué',
      )
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="sm" aria-label="Planifier une séance">
            <CalendarPlus className="size-4" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <p className="text-sm font-medium">Planifier une séance</p>

        {(items ?? []).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {/* Rien de coché = séance libre sur le savoir. Beaucoup de séances
                le sont — on ouvre le sujet sans savoir encore ce qu'on y fera. */}
            {items?.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setItemId(itemId === item.id ? null : item.id)}
                title={PRACTICE_NATURE_META[item.nature].label}
                className={cn(
                  'max-w-full truncate rounded-md border px-2 py-1 text-xs transition-colors',
                  itemId === item.id
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-muted/50',
                )}
              >
                {item.title}
              </button>
            ))}
          </div>
        )}

        <div className="mt-3 grid grid-cols-4 gap-1">
          {days.map((d, i) => (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => void plan(d)}
              className="rounded-md border border-border px-2 py-1.5 text-xs capitalize hover:bg-muted/50"
            >
              {i === 0
                ? 'Auj.'
                : i === 1
                  ? 'Demain'
                  : d.toLocaleDateString('fr-FR', {
                      weekday: 'short',
                      day: 'numeric',
                    })}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
