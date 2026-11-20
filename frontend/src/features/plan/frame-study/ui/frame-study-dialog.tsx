import { X } from 'lucide-react'
import { useState } from 'react'

import {
  type AcquisitionPlan,
  formatScope,
  parseScope,
  useUpdatePlan,
} from '@/entities/plan'
import { ApiError } from '@/shared/api'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  toast,
} from '@/shared/ui'

import { type FrameTag, mergeProposals } from '../lib/scope-text'
import { useFramingCompanion } from '../model/companion'
import type { StepKey } from '../model/steps'
import { useFrameResources } from '../model/use-frame-resources'
import { useIntentionChat } from '../model/use-intention-chat'
import { useResourcePreferences } from '../model/use-resource-preferences'
import { useResourceSearch } from '../model/use-resource-search'
import { useScopeProposal } from '../model/use-scope-proposal'
import { IntentionStep } from './intention-step'
import { StepsBar } from './parts'
import { ResourcesStep } from './resources-step'
import { ScopeStep } from './scope-step'

/** L'écran montré : un temps, et pour l'Intention, lequel de ses deux. */
type Screen = 'intention' | 'intention-form' | 'scope' | 'resources'

/**
 * « Cadrer l'étude » (#175, `prod/Cadrer etude - …`) : une modale de 600 px
 * par-dessus les notes, en trois temps — Intention · Périmètre · Ressources
 * (✓ une fois passé) —, ✕ pour la fermer.
 *
 * **Chaque temps gardé s'écrit aussitôt** dans le cycle : l'Intention
 * (`target_level`) sur « Formuler l'intention », le Périmètre (`scope`) sur
 * Suivant, chaque ressource à son ajout. Un cadrage interrompu garde ce qui
 * a été accepté ; rien ne part si rien n'a changé.
 *
 * Elle **part de l'existant** : l'intention, le périmètre (relu en
 * éléments, `parseScope`) et les ressources du cycle.
 *
 * **Sophia** propose à chaque temps (`useFramingCompanion`, une action par
 * temps) : le chat de l'intention, le périmètre à l'arrivée sur l'étape, la
 * recherche de ressources au clic. Leur état est tenu ici, pour qu'un
 * Retour ne refasse rien. Sans elle, chaque temps se fait à la main, ses
 * propositions grisées avec leur motif.
 */
export function FrameStudyDialog({
  skillId,
  domainId,
  plan,
  onClose,
}: {
  skillId: string
  domainId: string | undefined
  /** Le cycle cadré : celui des notes (`pickCycle`). */
  plan: AcquisitionPlan
  onClose: () => void
}) {
  const update = useUpdatePlan()
  const resources = useFrameResources(skillId, plan)
  const preferences = useResourcePreferences(domainId)
  const [screen, setScreen] = useState<Screen>('intention')
  const [passed, setPassed] = useState<ReadonlySet<StepKey>>(new Set())
  const [intention, setIntention] = useState(plan.target_level ?? '')
  const [tags, setTags] = useState<FrameTag[]>(() =>
    parseScope(plan.scope).map((t) => ({ ...t, removable: true })),
  )
  const asking = useFramingCompanion('intention')
  const chat = useIntentionChat({
    planId: plan.id,
    enabled: asking.available,
    intention,
    onIntention: setIntention,
  })
  const proposal = useScopeProposal(plan.id, (proposed) =>
    setTags((current) => mergeProposals(current, proposed)),
  )
  const search = useResourceSearch(plan.id, preferences.saved)

  const step: StepKey = screen === 'intention-form' ? 'intention' : screen

  /** Quitter un temps vers un autre : celui qu'on quitte en avançant est
   *  passé. */
  function go(next: Screen, done?: StepKey) {
    if (done) setPassed((s) => new Set(s).add(done))
    setScreen(next)
  }

  /** Écrire un texte du cycle s'il a changé ; un échec le dit. */
  function write(field: 'target_level' | 'scope', value: string | null) {
    if (value === (plan[field] ?? null)) return
    update
      .mutateAsync({ id: plan.id, body: { [field]: value } })
      .catch((err) =>
        toast.error(
          err instanceof ApiError
            ? err.message
            : field === 'scope'
              ? "Le périmètre n'a pas pu s'enregistrer"
              : "L'intention n'a pas pu s'enregistrer",
        ),
      )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        // Échap dans un champ qui s'en sert (l'étiquette en saisie) ne
        // ferme pas la modale.
        onEscapeKeyDown={(e) => {
          if (
            (e.target as HTMLElement | null)?.closest?.('[data-escape-local]')
          )
            e.preventDefault()
        }}
        className="flex flex-col gap-0 overflow-hidden rounded-[14px] p-0 sm:max-w-[600px]"
      >
        <div className="flex items-center gap-2 border-b border-foreground/[0.05] px-[18px] pt-4 pb-3">
          <DialogTitle className="text-base font-semibold">
            Cadrer l'étude
          </DialogTitle>
          <StepsBar current={step} passed={passed} />
          <DialogClose
            aria-label="Fermer"
            className="ml-auto grid size-[26px] shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <X className="size-3.5" />
          </DialogClose>
        </div>

        {(screen === 'intention' || screen === 'intention-form') && (
          <IntentionStep
            skillId={skillId}
            chat={asking.available ? chat : null}
            screen={screen === 'intention' ? 'write' : 'form'}
            draft={intention}
            onDraft={setIntention}
            onScreen={(s) =>
              setScreen(s === 'write' ? 'intention' : 'intention-form')
            }
            onPass={() => go('scope', 'intention')}
            onFormulate={() => {
              write('target_level', intention.trim() || null)
              go('scope', 'intention')
            }}
          />
        )}
        {screen === 'scope' && (
          <ScopeStep
            tags={tags}
            intention={intention.trim() || null}
            proposal={proposal}
            onTags={setTags}
            // Retour à l'intention formulée, ou au champ si on l'a passée.
            onBack={() =>
              setScreen(intention.trim() ? 'intention-form' : 'intention')
            }
            onNext={(final) => {
              setTags(final)
              // Comparé au périmètre relu, pas à son texte : un périmètre
              // écrit à la main n'est pas récrit si rien n'a bougé.
              const next = formatScope(final)
              if (next !== formatScope(parseScope(plan.scope)))
                write('scope', next)
              go('resources', 'scope')
            }}
          />
        )}
        {screen === 'resources' && (
          <ResourcesStep
            added={resources.added}
            pending={resources.pending}
            preferences={preferences}
            search={search}
            onAdd={(text) => {
              search.touch()
              void resources.add(text)
            }}
            onAddProposal={(p) => {
              // La carte s'en va aussitôt ; elle revient si l'ajout échoue.
              search.take(p.url)
              void resources
                .addProposal(p)
                .then((ok) => ok || search.untake(p.url))
            }}
            onRemove={(id) => {
              search.touch()
              resources.remove(id)
            }}
            onBack={() => setScreen('scope')}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
