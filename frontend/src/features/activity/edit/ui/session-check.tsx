import { useState } from 'react'

import { carriesLearning } from '@/entities/activity'

import type { CheckedActivity } from '../model/use-check-draft'
import {
  CheckColumn,
  CheckDialog,
  UncheckDialog,
} from './session-check-dialogs'

/**
 * **Cocher, décocher une séance** (#140, `kit/Coche seance`,
 * `kit/Retirer seance`) — partout où l'on coche. `request(activité, puis)` :
 *
 * - une séance liée à un projet ouvre à la coche un bloc par projet lié
 *   (#182) — ses savoirs, Totaux, Résultats et Réalisations, séance faite :
 *   ce qui est posé est fait d'office ; on ajuste, on donne les retours, on
 *   coche les réalisations.
 *   Annuler : elle reste à faire. Valider : les changements partent, puis
 *   `puis()` la coche ;
 * - décochée avec de l'apprentissage, elle demande quoi en faire : le garder
 *   (retours compris) ou le retirer ;
 * - sinon — sans projet à la coche (une étude ou une passe seule se coche
 *   directement, #182), sans apprentissage à la décoche (l'interro seule ne compte pas : elle se valide par sa
 *   passation) —, `puis()` tout de suite.
 *
 * `dialog` se rend là où le hook sert. Avec `column`, la coche d'une séance
 * liée se pose dans une colonne (`column` rendu) au lieu d'une modale.
 */
export function useSessionCheck({
  column,
}: {
  /**
   * Les classes d'une colonne où la coche se pose **à la place d'une
   * modale** (le calendrier complet, 17/11) : `column` la rend, l'appelant
   * la met à la place de sa colonne. La séance s'y montre cochée tout de
   * suite (`preview`) ; elle se coche pour de bon à la fermeture.
   */
  column?: string
} = {}) {
  const [asked, setAsked] = useState<Asked | null>(null)

  /**
   * `preview` : montrer la séance cochée sans l'enregistrer — en colonne, la
   * coche s'affiche tout de suite et part à la fermeture de l'écran.
   */
  const request = (
    activity: CheckedActivity,
    then: () => unknown,
    preview?: () => void,
  ) => {
    const asks = activity.done
      ? carriesLearning(activity)
      : activity.projects.length > 0
    if (!asks) {
      void then()
      return
    }
    if (!activity.done && column !== undefined) preview?.()
    setAsked({ activity, then })
  }

  // Fermer ou confirmer **celle-là** : une coche validée par le clic qui en
  // demande une autre ne ferme pas la nouvelle.
  const close = (which: Asked) => setAsked((a) => (a === which ? null : a))
  const confirmed = (which: Asked) => {
    close(which)
    void which.then()
  }

  const inline = asked && !asked.activity.done && column !== undefined
  const dialog =
    !asked || inline ? null : asked.activity.done ? (
      <UncheckDialog
        activity={asked.activity}
        onCancel={() => close(asked)}
        onConfirmed={() => confirmed(asked)}
      />
    ) : (
      <CheckDialog
        activity={asked.activity}
        onCancel={() => close(asked)}
        onConfirmed={() => confirmed(asked)}
      />
    )
  const panel = inline ? (
    <CheckColumn
      key={asked.activity.id}
      activity={asked.activity}
      className={column}
      onDone={() => confirmed(asked)}
    />
  ) : null

  return { request, dialog, column: panel }
}

/** Une coche ou une décoche demandée : la séance, et ce qui la fait. */
interface Asked {
  activity: CheckedActivity
  then: () => unknown
}
