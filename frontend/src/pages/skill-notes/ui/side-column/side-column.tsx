import type { Domain } from '@/entities/domain'
import type { Notes } from '@/entities/note'
import { pickCycle, usePlans } from '@/entities/plan'
import { useResourcesNotes } from '@/entities/resource'
import type { Skill } from '@/entities/skill'

import { docHasText } from '../../lib/doc-text'
import { useNotesView } from '../../model/use-notes-view'
import { ColumnActions } from './column-actions'
import { ColumnOutline } from './column-outline'
import { ColumnResources } from './column-resources'

/**
 * La **colonne permanente** de la page des notes (#173, `prod/Notes`) :
 * 290 px à gauche, sur le fond de l'app, bordée à droite ; elle reste quand
 * la vue change à côté d'elle (les notes, une ressource, « Préparer les
 * questions »). De haut en bas : « 📓 Notes » et le sommaire, « Ressources »
 * du cycle, « Actions ».
 *
 * Le cycle est celui que la page savoir ouvrirait (`pickCycle`) : en cours,
 * sinon le dernier prévu, sinon le dernier clos. Sans cycle, les ressources
 * du savoir et les actions qui n'en demandent pas.
 *
 * Collée au défilement (la page défile, pas la colonne) ; plus haute que la
 * fenêtre, elle défile elle-même. Sous 900 px de large, elle se retire,
 * comme le sommaire d'avant elle.
 *
 * « Dicter » dicte **au curseur**, dans les notes ou la ressource ouverte
 * (`useDictation`, à la page) : la colonne ne fait que la piloter, elle
 * n'ouvre rien.
 *
 * « Vérifier les notes » n'est là que **sur une ressource ouverte** (décision
 * de l'utilisateur du 29/10 : on l'élargira plus tard) et la vérifie ; grisé
 * tant que ses notes ne portent pas de texte (`useResourcesNotes`) —
 * `onReview` porte la demande à sa feuille.
 */
export function SideColumn({
  skill,
  domain,
  notes,
  dictation,
  reviewing,
  onReview,
  framing,
  onFrame,
}: {
  skill: Skill
  domain: Domain | undefined
  notes: Notes
  /** La dictée de la page : en cours, sans curseur (le motif), lancer ou
   *  arrêter. */
  dictation: {
    active: boolean
    unavailable: string | null
    onDictate: () => void
  }
  /** Une vérification relit ou attend un passage (ressource ouverte). */
  reviewing: boolean
  /** Vérifier cette ressource : la page la passe à sa feuille. */
  onReview: (resourceId: string) => void
  /** « Cadrer l'étude » est ouverte ; l'ouvrir (la page tient la modale). */
  framing: boolean
  onFrame: () => void
}) {
  const { data: plans } = usePlans(skill.id)
  const plan = pickCycle(plans ?? [], null)
  const { view, showNotes, showQuestions, showResource } = useNotesView()
  const selected = view.kind === 'resource' ? view.resourceId : null
  // Les notes de la ressource ouverte portent-elles du texte ? Pas encore
  // lues : on ne grise pas.
  const [selectedNotes] = useResourcesNotes(selected ? [selected] : [])
  const written = selectedNotes === undefined || docHasText(selectedNotes.doc)

  function review() {
    if (!selected || !written || reviewing) return
    onReview(selected)
  }

  return (
    <aside
      aria-label="Notes, ressources et actions"
      className="w-[290px] shrink-0 border-r border-border/60 bg-background max-[900px]:hidden"
    >
      <nav className="sticky top-0 flex max-h-svh flex-col gap-5 overflow-y-auto px-2.5 py-3.5 text-[13px]">
        <ColumnOutline
          notes={notes}
          active={view.kind === 'notes'}
          onNotes={showNotes}
        />
        <ColumnResources
          skillId={skill.id}
          plan={plan}
          selectedId={selected}
          onSelect={(id) => (id === selected ? showNotes() : showResource(id))}
        />
        <ColumnActions
          skill={skill}
          domain={domain}
          plan={plan}
          notes={notes}
          dictation={dictation}
          review={
            selected
              ? {
                  active: reviewing,
                  unavailable: written
                    ? null
                    : 'Écris d’abord des notes sur cette ressource.',
                  onReview: review,
                }
              : null
          }
          framing={framing}
          onFrame={onFrame}
          questionsActive={view.kind === 'questions'}
          onQuestions={view.kind === 'questions' ? showNotes : showQuestions}
        />
      </nav>
    </aside>
  )
}
