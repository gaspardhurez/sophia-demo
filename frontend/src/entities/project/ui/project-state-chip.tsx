import { Ban, CircleCheck, CircleX } from 'lucide-react'

import { formatDateShort } from '@/shared/lib/format'

import {
  type PaceScope,
  paceRows,
  paceTabs,
  rowsPacing,
} from '../model/pace-card'
import { projectPacing, PACING_META } from '../model/progress'
import type { Project } from '../model/types'
import { weekScope } from '../model/week'
import { PaceCard } from './pace-card'
import { StateDot } from './state-dot'

/**
 * Chip d'état unique d'un projet. Tant qu'il est en cours, elle reflète le
 * **rythme du plan** ; une fois tranché, elle reflète l'**issue** (réussi /
 * raté / abandonné).
 *
 * **Icône pour l'issue, point pour le rythme.** Les deux vivaient en points de
 * couleur, et « Atteint » se confondait avec « Dans les temps » — tous deux
 * verts —, « Raté » avec « En retard » — rose contre orange. Ce ne sont pas
 * deux valeurs d'une même échelle : une issue est close, un rythme court
 * encore. La forme le dit maintenant, sans avoir à survoler.
 * Pas d'état intermédiaire « À valider » (design #40) : tant qu'un objectif
 * manque, le projet est « En cours » ; la période passée, il est « Raté » —
 * Précisions ou pas. Seul le statut du serveur dit « Réussi ».
 *
 * Elle **lit le statut** au lieu de redériver le démarrage des dates. Elle le
 * faisait de son côté (« Début le … » si `today < start_at`) à l'époque où le
 * back n'en savait rien ; maintenant qu'il tranche, deux sources de vérité
 * finiraient par se contredire — c'est le motif nettoyé avec `currentStep`.
 * `todo` veut désormais dire « pas démarré », un fait, plus une comparaison.
 */
export function ProjectStateChip({
  project,
  today,
  showStart = false,
  showNotStarted = false,
  className,
  ink,
  week = false,
}: {
  project: Project
  today: string
  /** Affiche « Début le … » avant le début (utile en vue compacte sans plage). */
  showStart?: boolean
  /**
   * Affiche un point gris « À venir » avant le début (l'en-tête de la page
   * projet, où la période est déjà écrite à côté).
   */
  showNotStarted?: boolean
  className?: string
  /** L'encre du domaine : un rythme montre sa carte au survol (#112). */
  ink?: string
  /**
   * Le rythme de **ce que montre la carte de projet** (`weekScope`) : avec
   * une étape en cours qui porte une tranche, celui de ses tranches (sur sa
   * période) et des Totaux qu'aucune étape ne porte — pas celui des Totaux
   * que d'autres étapes distribuent. Sa carte de rythme bascule alors entre
   * l'étape et le projet entier (onglets, #114) ; la pastille garde le
   * rythme de l'étape.
   */
  week?: boolean
}) {
  if (project.status === 'achieved')
    return (
      <StateDot
        label="Réussi"
        dotClassName="text-emerald-600"
        icon={CircleCheck}
        className={className}
      />
    )
  if (project.status === 'failed')
    return (
      <StateDot
        label="Raté"
        dotClassName="text-rose-600"
        icon={CircleX}
        className={className}
      />
    )
  if (project.status === 'abandoned')
    return (
      <StateDot
        label="Abandonné"
        dotClassName="text-rose-600"
        icon={Ban}
        className={className}
      />
    )

  // Pas encore démarré : on annonce le début plutôt qu'un rythme (qui n'a pas
  // de sens avant la période). Opt-in (vue compacte sans chip de plage). Sans
  // date de début il n'y a rien à annoncer — le projet attend une décision.
  if (project.status === 'todo') {
    if (showStart && project.start_at)
      return (
        <StateDot
          label={`Début le ${formatDateShort(project.start_at)}`}
          dotClassName="bg-muted-foreground/40"
          className={className}
        />
      )
    return showNotStarted ? (
      <StateDot
        label="À venir"
        dotClassName="bg-muted-foreground/40"
        className={className}
      />
    ) : null
  }

  // Le rythme se lit sur TOUS les axes, pas seulement le volume : un projet
  // suivi en régularité seule n'avait pas de cible et restait sans état.
  const step = week ? weekScope(project, today)?.step : null
  const scope: PaceScope = step ? { kind: 'week', step } : { kind: 'project' }
  const lines = step ? paceRows(project, scope, today) : null
  const pace = lines ? rowsPacing(lines) : projectPacing(project, today)
  // Sans Total, rien ne cadence : un projet dont la période est ouverte est
  // simplement en cours, et le point est vert par défaut (design #32). Totaux
  // tous remplis, même chose : le projet court encore parce qu'un autre
  // objectif (Résultat, Réalisation, savoir) manque — « Réussi » ne se dit que
  // du statut, lu plus haut.
  if (!pace || pace === 'done')
    return (
      <StateDot
        label="En cours"
        dotClassName="bg-emerald-500"
        className={className}
      />
    )
  const rows =
    ink && pace !== 'failed' ? (lines ?? paceRows(project, scope, today)) : []
  return (
    <StateDot
      label={PACING_META[pace].label}
      dotClassName={PACING_META[pace].dot}
      className={className}
      card={
        rows.length > 0 && ink ? (
          <PaceCard
            pace={pace}
            rows={rows}
            tabs={paceTabs(project, step ?? null, today)}
            ink={ink}
          />
        ) : undefined
      }
    />
  )
}
