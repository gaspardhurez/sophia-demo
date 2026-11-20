import { useEffect, useState } from 'react'

import { type Activity, useActivities } from '@/entities/activity'
import { type AcquisitionPlan, useLaunchRecall } from '@/entities/plan'
import { ApiError } from '@/shared/api'
import { addDays, fmtTime, startOfDay, toLocalISO } from '@/shared/lib/date'
import { Dialog, DialogContent, DialogTitle, toast } from '@/shared/ui'

import { Choice } from './choice'

/** Une séance qui ne porte que l'interro (« Interro · savoir ») : on n'y
 *  rattache pas un premier test. */
const onlyRecall = (a: Activity) =>
  a.acts.length > 0 && a.acts.every((x) => x.kind === 'recall')

/** « jeu. 15 · 19:00 », « jeu. 15 » pour une journée entière. */
function whenOf(a: Activity): string {
  if (!a.start_at) return ''
  const d = new Date(a.start_at)
  const day = d.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
  })
  return a.all_day ? day : `${day} · ${fmtTime(a.start_at)}`
}

/**
 * **Lancer l'interro** (#157, `kit/Phases cycle`) — la modale s'appelle
 * « Lancer l'interro » depuis #173 (`prod/Notes`, état f) :
 * le geste qui dit « j'ai étudié, teste-moi » et démarre la courbe de
 * l'interro. Un menu, sans texte ni boutons :
 *
 * - **Nouvelle séance · demain** : le serveur pose l'interro demain, en
 *   journée entière ; une fois l'activité créée relue, `onCreated` la donne
 *   à l'appelant (le panneau d'activité, pour la nommer, l'heure) ;
 * - **Ou rattacher à** : les séances non faites du domaine du savoir, de
 *   J+1 à J+3, hors celles qui ne portent qu'une interro — le premier test
 *   s'y rattache. Aucune : la section ne paraît pas.
 *
 * `open()` ouvre la modale ; `dialog` se rend là où le hook sert, et doit
 * rester monté pour que `onCreated` arrive.
 */
export function useLaunchTest({
  plan,
  domainId,
  domainEmoji = '',
  tintClassName,
  onCreated,
  initialOpen = false,
}: {
  plan: Pick<AcquisitionPlan, 'id' | 'skill_id'>
  /** Le domaine du savoir : ses séances, auxquelles rattacher. */
  domainId: string | undefined
  domainEmoji?: string
  /** Le fond des emojis des séances : la teinte douce du domaine. */
  tintClassName?: string
  onCreated?: (activity: Activity) => void
  /** La modale s'ouvre au montage (un hôte monté pour l'occasion). */
  initialOpen?: boolean
}) {
  const [open, setOpen] = useState(initialOpen)
  // Une nouvelle séance est demandée : on guette l'interro créée.
  const [awaiting, setAwaiting] = useState(false)
  const launch = useLaunchRecall()

  const today = startOfDay(new Date())
  const start = toLocalISO(addDays(today, 1))
  const end = toLocalISO(addDays(today, 4))
  const { data: sessions } = useActivities({ domainId, start, end })
  const { data: created } = useActivities({
    skillId: plan.skill_id,
    start,
    end: toLocalISO(addDays(today, 2)),
  })

  useEffect(() => {
    if (!awaiting || !created) return
    const recall = created.find(
      (a) =>
        !a.done &&
        a.acts.some((x) => x.kind === 'recall' && x.plan_id === plan.id),
    )
    if (!recall) return
    setAwaiting(false)
    onCreated?.(recall)
  }, [awaiting, created, plan.id, onCreated])

  const choices = (domainId ? (sessions ?? []) : [])
    .filter(
      (a) =>
        a.domain_id === domainId && !a.done && a.start_at && !onlyRecall(a),
    )
    .sort((a, b) => (a.start_at ?? '').localeCompare(b.start_at ?? ''))

  async function run(activityId?: string) {
    try {
      await launch.mutateAsync({ id: plan.id, activityId })
      setOpen(false)
      if (!activityId) setAwaiting(true)
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Le test n'a pas pu se lancer",
      )
    }
  }

  const dialog = open ? (
    <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
      <DialogContent
        showCloseButton={false}
        className="flex max-w-[340px] flex-col gap-2.5 p-4"
      >
        <DialogTitle className="font-heading text-base font-semibold">
          Lancer l'interro
        </DialogTitle>
        <div className="-mx-1 flex flex-col">
          <Choice
            emoji="＋"
            title="Nouvelle séance"
            sub="demain"
            emojiClassName="border border-dashed border-ring text-muted-foreground"
            disabled={launch.isPending}
            onClick={() => void run()}
          />
          {choices.length > 0 && (
            <>
              <span className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
                Ou rattacher à
              </span>
              {choices.map((a) => (
                <Choice
                  key={a.id}
                  emoji={a.emoji || domainEmoji || '•'}
                  title={a.title}
                  sub={whenOf(a)}
                  emojiClassName={tintClassName ?? 'bg-muted'}
                  disabled={launch.isPending}
                  onClick={() => void run(a.id)}
                />
              ))}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  ) : null

  return {
    open: () => setOpen(true),
    dialog,
    isPending: launch.isPending,
    /** Ni modale ouverte, ni interro créée à guetter : rien en cours. */
    idle: !open && !awaiting,
  }
}
