import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  type Activity,
  hasFeedback,
  learningActs,
  useAddActivityAct,
  useDeleteActivity,
  useSetActFeedback,
} from '@/entities/activity'
import { activityMetricValuesQuery, type MetricValue } from '@/entities/metric'
import { isNotFound } from '@/shared/api'

export interface PendingDeletion {
  activity: Activity
  /** Ce que la suppression emporte — connu avant de la faire, pas après. */
  values: MetricValue[]
}

/**
 * La séance porte-t-elle quelque chose que la suppression ferait perdre — une
 * valeur déclarée, un relevé ? Une cible (relevé d'une séance non faite) n'a
 * rien mesuré : elle ne justifie pas la question. Elle part quand même avec la
 * séance, et l'annulation la rend avec le reste.
 */
/**
 * Ce que la suppression peut reporter sur une autre séance : les actes
 * d'apprentissage que la coche tranche (#140), **et l'interro pas encore
 * passée** d'une séance pas faite — sans quoi elle partait avec la séance sans
 * qu'on le propose (26/10). Une interro passée reste à sa séance : elle ne se
 * reporte pas.
 */
export function carriedActs(activity: Activity): Activity['acts'] {
  return [
    ...learningActs(activity.acts),
    ...activity.acts.filter(
      (x) => x.kind === 'recall' && x.plan_id && !x.passed_on && !activity.done,
    ),
  ]
}

export function carries(activity: Activity, values: MetricValue[]): boolean {
  return activity.values.length > 0 || values.some((v) => v.counts)
}

/**
 * Supprimer une séance en demandant confirmation **quand elle porte quelque
 * chose** — une valeur, des relevés, de l'apprentissage — et sans rien
 * demander sinon. L'apprentissage (#140) peut se reporter sur une autre
 * séance : ses actes y passent, avec leurs retours.
 *
 * La question n'est posée que si elle a une réponse intéressante : supprimer
 * une case vide du calendrier est un geste courant, lui opposer une modale à
 * chaque fois la rendrait invisible le jour où elle compte.
 *
 * Depuis que `metric_values` est en CASCADE, ce qui part avec la séance ne
 * revient pas : c'est cette modale qui remplace le filet qu'était le `SET NULL`,
 * en annonçant au lieu de conserver en silence.
 *
 * Le hook vit dans une feature parce que trois entrées le déclenchent, dans
 * deux widgets (menu du calendrier, touche Suppr, menu de l'agenda) — et que
 * deux widgets ne peuvent pas se partager du code autrement.
 */
export function useActivityDeletion(options?: {
  /** Appelé après la suppression, avec ce qu'elle a emporté (pour un undo). */
  onDeleted?: (activity: Activity, values: MetricValue[]) => void
  onError?: (err: unknown) => void
}) {
  const queryClient = useQueryClient()
  const remove = useDeleteActivity()
  const addAct = useAddActivityAct()
  const setFeedback = useSetActFeedback()
  const [pending, setPending] = useState<PendingDeletion | null>(null)
  const [carrying, setCarrying] = useState(false)

  /** Les actes d'apprentissage passent sur `target`, retours compris. */
  async function carry(activity: Activity, target: Activity) {
    for (const act of carriedActs(activity)) {
      if (target.acts.some((x) => sameAct(x, act))) continue
      const saved = await addAct.mutateAsync({
        id: target.id,
        act: {
          skill_id: act.skill_id,
          kind: act.kind,
          plan_id: act.plan_id,
          practice_item_id: act.practice_item_id,
          nature: act.nature,
        },
      })
      const moved = saved.acts.find((x) => sameAct(x, act))
      if (hasFeedback(act) && moved)
        await setFeedback.mutateAsync({
          id: target.id,
          actId: moved.id,
          level: act.level ?? null,
          feedback: act.feedback,
        })
    }
  }

  async function erase(
    activity: Activity,
    values: MetricValue[],
    carryTo?: Activity,
  ) {
    try {
      if (carryTo) {
        setCarrying(true)
        await carry(activity, carryTo)
      }
      setPending(null)
      try {
        await remove.mutateAsync({ id: activity.id })
      } catch (err) {
        // Une séance qui ne portait que l'interro : la reporter l'a vidée, et
        // le serveur l'a déjà retirée avec son dernier acte. C'est le but.
        if (!(carryTo && isNotFound(err))) throw err
      }
      options?.onDeleted?.(activity, values)
    } catch (err) {
      setPending(null)
      options?.onError?.(err)
    } finally {
      setCarrying(false)
    }
  }

  /** Point d'entrée : demande la suppression, qui s'exécute ou se fait confirmer. */
  async function request(activity: Activity) {
    let values: MetricValue[] = []
    try {
      // `fetchQuery` et non `getQueryData` : la liste n'est en cache que si le
      // panneau de la séance a été ouvert. On ne peut pas fonder une décision
      // destructrice sur « ce qu'on avait déjà sous la main ».
      values = await queryClient.fetchQuery(
        activityMetricValuesQuery(activity.id),
      )
    } catch {
      // Relevés illisibles : on demande confirmation plutôt que de supprimer
      // sur une information manquante — le doute penche du côté qui préserve.
      setPending({ activity, values: [] })
      return
    }
    if (!carries(activity, values) && carriedActs(activity).length === 0) {
      await erase(activity, values)
      return
    }
    setPending({ activity, values })
  }

  return {
    request,
    pending,
    /** `carryTo` : la séance où reporter l'apprentissage (#140). */
    confirm: (carryTo?: Activity) =>
      pending && erase(pending.activity, pending.values, carryTo),
    cancel: () => setPending(null),
    isPending: remove.isPending || carrying,
  }
}

/** Le même acte : même savoir, même geste, même objet ou phase. */
function sameAct(
  a: Pick<
    Activity['acts'][number],
    'skill_id' | 'kind' | 'practice_item_id' | 'nature'
  >,
  b: Pick<
    Activity['acts'][number],
    'skill_id' | 'kind' | 'practice_item_id' | 'nature'
  >,
): boolean {
  return (
    a.skill_id === b.skill_id &&
    a.kind === b.kind &&
    (a.practice_item_id ?? null) === (b.practice_item_id ?? null) &&
    (a.nature ?? null) === (b.nature ?? null)
  )
}
