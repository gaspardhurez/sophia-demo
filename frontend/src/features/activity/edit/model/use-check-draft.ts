import { useState } from 'react'

import {
  type Activity,
  type ActivityActSet,
  takesFeedback,
  useAddActivityAct,
  useLinkActivityAchievement,
  useRemoveActivityAct,
  useSetActFeedback,
  useUnlinkActivityAchievement,
  useUpdateActivity,
} from '@/entities/activity'
import {
  useActivityMetricValues,
  useAddMetricValue,
  useDeleteMetricValue,
  useUpdateMetricValue,
} from '@/entities/metric'
import { useUpdateAchievement } from '@/entities/project'

import { type ActDraft, actSet, sameAct } from './acts'

/** Une valeur déclarée : ce qu'un Total en valeur additionne. */
interface ValueDraft {
  unit_id: string
  value: number
}

/** Un relevé tel que la coche le tient — enregistré (`id`) ou à ajouter. */
interface ReadingDraft {
  id: string | null
  metric_id: string
  value: number
}

/** Une réalisation liée à la séance ; `done` : cochée sur son projet. */
type AchievementDraft = Activity['achievements'][number]

/**
 * L'activité que la coche reçoit : celle du calendrier, ou ce que le panneau
 * tient — ses valeurs n'y portent que l'unité et le chiffre.
 */
export type CheckedActivity = Omit<Activity, 'values'> & {
  values: ValueDraft[]
}

/**
 * Le **brouillon de la coche** (#140, élargie le 30/10) : l'apprentissage, les
 * Totaux, les Résultats, les Réalisations et les notes de la séance, tenus
 * ici jusqu'à Valider. Annuler ne touche à rien.
 *
 * `save()` écrit dans l'ordre : les actes (retirés, ajoutés, retours), les
 * valeurs et les notes, les relevés (retirés, changés, ajoutés — au jour de la séance), les
 * réalisations (déliées, liées), puis la coche de celles dont l'état a changé
 * sur leur projet. La coche de la séance elle-même revient à l'appelant.
 */
export function useCheckDraft(activity: CheckedActivity, day: string) {
  const addAct = useAddActivityAct()
  const removeAct = useRemoveActivityAct()
  const setFeedback = useSetActFeedback()
  const update = useUpdateActivity()
  const addReading = useAddMetricValue()
  const updateReading = useUpdateMetricValue()
  const deleteReading = useDeleteMetricValue()
  const link = useLinkActivityAchievement()
  const unlink = useUnlinkActivityAchievement()
  const updateAchievement = useUpdateAchievement()

  const [acts, setActs] = useState<ActDraft[]>(activity.acts)
  const [values, setValues] = useState<ValueDraft[]>(activity.values)
  const [notes, setNotes] = useState(activity.notes ?? '')
  const { data: savedReadings } = useActivityMetricValues(activity.id)
  const saved: ReadingDraft[] = (savedReadings ?? []).map((r) => ({
    id: r.id,
    metric_id: r.metric_id,
    value: r.value,
  }))
  // Tant qu'on n'y a pas touché, les relevés sont ceux du serveur.
  const [touched, setTouched] = useState<ReadingDraft[] | null>(null)
  const readings = touched ?? saved
  const [achievements, setAchievements] = useState<AchievementDraft[]>(
    activity.achievements,
  )
  // L'état de chaque réalisation sur son projet, avant la coche.
  const [wasDone] = useState(
    () => new Map(activity.achievements.map((a) => [a.id, a.done])),
  )

  const editReadings = (f: (list: ReadingDraft[]) => ReadingDraft[]) =>
    setTouched(f(readings))

  const draft = {
    acts,
    addAct: (act: ActivityActSet) =>
      setActs((prev) =>
        prev.some((a) => sameAct(a, act)) ? prev : [...prev, act],
      ),
    removeAct: (act: ActDraft) =>
      setActs((prev) => prev.filter((a) => a !== act)),
    rateAct: async (
      act: ActDraft,
      level: number | null,
      feedback: string | null,
    ) => {
      setActs((prev) =>
        prev.map((a) => (a === act ? { ...a, level, feedback } : a)),
      )
      return true
    },
    values,
    setValues,
    notes,
    setNotes,
    readings,
    addReading: (metricId: string, value: number) =>
      editReadings((list) => [
        ...list,
        { id: null, metric_id: metricId, value },
      ]),
    updateReading: (r: ReadingDraft, value: number) =>
      editReadings((list) => list.map((x) => (x === r ? { ...x, value } : x))),
    removeReading: (r: ReadingDraft) =>
      editReadings((list) => list.filter((x) => x !== r)),
    achievements,
    linkAchievement: (a: AchievementDraft) => {
      if (!wasDone.has(a.id)) wasDone.set(a.id, a.done)
      setAchievements((prev) =>
        prev.some((x) => x.id === a.id) ? prev : [...prev, a],
      )
    },
    unlinkAchievement: (a: AchievementDraft) =>
      setAchievements((prev) => prev.filter((x) => x.id !== a.id)),
    // Cocher une réalisation des projets la lie, faite ; la décocher la
    // délie si elle n'était pas liée avant la coche.
    toggleAchievement: (a: AchievementDraft) => {
      if (!wasDone.has(a.id)) wasDone.set(a.id, a.done)
      setAchievements((prev) => {
        const here = prev.find((x) => x.id === a.id)
        if (!here) return [...prev, { ...a, done: true }]
        const before = activity.achievements.some((x) => x.id === a.id)
        if (here.done && !before) return prev.filter((x) => x.id !== a.id)
        return prev.map((x) => (x.id === a.id ? { ...x, done: !x.done } : x))
      })
    },
  }

  async function save() {
    const id = activity.id
    // Les actes : retirés, ajoutés, puis les retours changés.
    for (const a of activity.acts)
      if (!acts.some((x) => x.id === a.id))
        await removeAct.mutateAsync({ id, actId: a.id })
    let savedActs = activity.acts
    for (const a of acts)
      if (!a.id)
        savedActs = (await addAct.mutateAsync({ id, act: actSet(a) })).acts
    for (const a of acts) {
      if (!takesFeedback(a)) continue
      const before = activity.acts.find((x) => x.id === a.id)
      const level = a.level ?? null
      const feedback = a.feedback ?? null
      if (
        (before?.level ?? null) === level &&
        (before?.feedback ?? null) === feedback
      )
        continue
      const actId = a.id ?? savedActs.find((x) => sameAct(x, a))?.id
      if (actId) await setFeedback.mutateAsync({ id, actId, level, feedback })
    }

    // Les valeurs (toutes ensemble) et les notes, si elles ont bougé.
    const sameValues =
      values.length === activity.values.length &&
      values.every((v) =>
        activity.values.some(
          (b) => b.unit_id === v.unit_id && b.value === v.value,
        ),
      )
    const nextNotes = notes.trim() || null
    const sameNotes = nextNotes === (activity.notes?.trim() || null)
    if (!sameValues || !sameNotes)
      await update.mutateAsync({
        id,
        body: {
          ...(sameValues ? {} : { values }),
          ...(sameNotes ? {} : { notes: nextNotes }),
        },
      })

    // Les relevés.
    if (touched) {
      for (const s of saved)
        if (!touched.some((r) => r.id === s.id))
          await deleteReading.mutateAsync({ id: s.id! })
      for (const r of touched) {
        if (r.id === null)
          await addReading.mutateAsync({
            metricId: r.metric_id,
            value: r.value,
            measuredAt: day,
            activityId: id,
          })
        else if (saved.find((s) => s.id === r.id)?.value !== r.value)
          await updateReading.mutateAsync({ id: r.id, value: r.value })
      }
    }

    // Les réalisations : déliées, liées, puis cochées ou décochées.
    for (const a of activity.achievements)
      if (!achievements.some((x) => x.id === a.id))
        await unlink.mutateAsync({ id, achievementId: a.id })
    for (const a of achievements)
      if (!activity.achievements.some((x) => x.id === a.id))
        await link.mutateAsync({ id, achievementId: a.id })
    for (const a of achievements)
      if (wasDone.get(a.id) !== a.done)
        await updateAchievement.mutateAsync({
          id: a.id,
          body: { done: a.done },
        })
  }

  return { ...draft, save }
}

/** Le brouillon que la coche passe à ses blocs de projet. */
export type CheckDraft = ReturnType<typeof useCheckDraft>
