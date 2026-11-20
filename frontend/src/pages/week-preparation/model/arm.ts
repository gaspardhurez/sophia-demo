import { useCallback, useEffect, useRef, useState } from 'react'

import type { ActivityActSet } from '@/entities/activity'

/**
 * Le **mode liaison « Aimant »** (#92, point 6) : une seule UX pour trois
 * choses qu'on lie à une séance de la semaine prochaine.
 *
 * - une **cible** de Résultat, validée dans son champ : la lier crée le
 *   relevé-cible sur la séance (un relevé d'une séance pas encore faite ne
 *   compte pas) ;
 * - une **réalisation** (« + Cette semaine ») : la séance la prépare ;
 * - une **pièce d'un savoir** (#108 : l'étude, l'interro, un objet de la
 *   rampe, Pratique ou Application) : son acte se pose sur la séance — et sur
 *   plusieurs ; une séance qui le porte déjà le perd au clic.
 */
export type ArmSubject =
  | { kind: 'target'; metricId: string; value: number }
  | { kind: 'achievement'; achievementId: string }
  | { kind: 'act'; act: ActivityActSet }

export interface Arm {
  /** Ce qu'on lie, identifié pour le re-clic qui annule. */
  key: string
  /** Les séances compatibles sont celles de ce projet. */
  projectId: string
  /** La chip flottante : emoji et nom. */
  emoji: string
  text: string
  subject: ArmSubject
}

/**
 * L'état du mode liaison et ses façons d'en sortir : Échap, re-clic sur ce
 * qu'on lie (`toggle`), clic ailleurs. Le calendrier annule lui-même un clic
 * hors séance (`Picking`) ; ici, un clic hors calendrier et hors source de
 * liaison (`[data-arm-source]`).
 *
 * `onCancel` reçoit ce qui retombe — l'appelant défait ce qui n'existait que
 * pour la liaison (un acte ajouté par « + Autre savoir »).
 */
export function useArm(onCancel?: (arm: Arm) => void) {
  const [arm, setArm] = useState<Arm | null>(null)
  const armRef = useRef(arm)
  const onCancelRef = useRef(onCancel)
  useEffect(() => {
    armRef.current = arm
    onCancelRef.current = onCancel
  })

  const cancel = useCallback(() => {
    const cur = armRef.current
    if (cur) onCancelRef.current?.(cur)
    setArm(null)
  }, [])

  /** Armer ; ré-armer la même chose annule, en armer une autre la remplace. */
  const toggle = useCallback(
    (next: Arm) => {
      if (armRef.current?.key === next.key) cancel()
      else {
        if (armRef.current) onCancelRef.current?.(armRef.current)
        setArm(next)
      }
    },
    [cancel],
  )

  /** La liaison est faite : on sort sans rien défaire. */
  const done = useCallback(() => setArm(null), [])

  useEffect(() => {
    if (!arm) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        cancel()
      }
    }
    const click = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      // Le clic qui vient d'armer peut avoir retiré son bouton (la coche qui
      // valide une cible) : détaché, il ne dit plus où il était — on l'ignore.
      if (t && !t.isConnected) return
      // Le calendrier, la source de la liaison, et le panneau d'activité (le
      // brouillon d'une séance qu'on crée pour y lier) ne l'annulent pas.
      if (
        t?.closest(
          '[data-calendar-root], [data-arm-source], [data-activity-ui]',
        )
      )
        return
      cancel()
    }
    window.addEventListener('keydown', key, true)
    document.addEventListener('click', click)
    return () => {
      window.removeEventListener('keydown', key, true)
      document.removeEventListener('click', click)
    }
  }, [arm, cancel])

  return { arm, toggle, cancel, done }
}

export type ArmController = ReturnType<typeof useArm>

type ActIdentity = Pick<
  ActivityActSet,
  'skill_id' | 'kind' | 'practice_item_id' | 'nature'
>

/** Deux actes sont-ils le même geste (même savoir, même sorte, même objet ou
 *  même phase générique) ? */
export function sameAct(a: ActIdentity, b: ActIdentity): boolean {
  return actKey(a) === actKey(b)
}

/** La clé d'un acte, pour l'identifier dans le mode liaison. */
export const actKey = (a: ActIdentity) =>
  `act:${a.skill_id}:${a.kind}:${a.practice_item_id ?? ''}:${a.nature ?? ''}`
