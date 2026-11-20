import { type Domain, domainColor } from '@/entities/domain'
import {
  type Project,
  PERIOD_HINT,
  periodEffects,
  ProjectEmojiPicker,
} from '@/entities/project'
import {
  DomainTags,
  ProjectDomainsEditor,
} from '@/features/project/edit-domains'
import {
  FormSection,
  Input,
  PeriodPicker,
  shortDay,
  Textarea,
} from '@/shared/ui'

import type { ProjectFields as Fields } from '../model/use-project-draft'

/**
 * Étape 1 · Le projet (design #33) : les champs de l'édition de l'en-tête —
 * titre, description, période —, l'emoji du projet (la tuile ; sans choix,
 * celui du domaine principal) et les domaines (#203) : les étiquettes sous le
 * titre (`kit/Domaines`) les ajoutent, retirent et réordonnent. Une fois le
 * projet créé, elles écrivent en base.
 */
export function ProjectFields({
  fields,
  onChange,
  domains,
  project,
}: {
  fields: Fields
  onChange: (next: Partial<Fields>) => void
  domains: Domain[]
  /** Le projet déjà créé, s'il existe : la période dit ce que deviennent
   *  ses étapes, comme en édition. */
  project?: Project
}) {
  const ids = project?.domain_ids ?? fields.domainIds
  const domain = domains.find((d) => d.id === ids[0])
  return (
    <>
      <div className="flex items-center gap-3">
        <ProjectEmojiPicker
          value={fields.emoji}
          fallback={domain?.emoji}
          className={domainColor(domain?.color).soft}
          onChange={(emoji) => onChange({ emoji })}
        />
        <Input
          autoFocus
          value={fields.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Titre du projet"
          aria-label="Titre du projet"
          aria-required
          className="h-10 flex-1 font-heading text-lg font-semibold tracking-[-0.01em]"
        />
      </div>
      <div className="-mt-1">
        {project ? (
          <ProjectDomainsEditor project={project} domains={domains} />
        ) : (
          <DomainTags
            domains={domains}
            value={fields.domainIds}
            onChange={(domainIds) => onChange({ domainIds })}
          />
        )}
      </div>

      <FormSection title="Description" hint="Ce que recouvre ce projet.">
        <Textarea
          rows={2}
          aria-label="Description"
          value={fields.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Exemple : Remuscler ce qu'un entretien technique teste"
        />
      </FormSection>

      <FormSection
        title={
          <>
            Période
            <span aria-hidden className="ml-0.5">
              *
            </span>
          </>
        }
        hint={PERIOD_HINT}
      >
        <PeriodPicker
          aria-label="Période"
          allowNoEnd
          placeholder="Choisir une période"
          start={fields.start}
          end={fields.end}
          onChange={(start, end) => onChange({ start, end })}
          taken={
            project?.steps.flatMap((step) =>
              step.start_at && step.due_at
                ? [
                    {
                      start: step.start_at,
                      end: step.due_at,
                      label: step.title,
                    },
                  ]
                : [],
            ) ?? []
          }
          effects={
            project
              ? (s, e) => periodEffects(project, s, e, shortDay)
              : undefined
          }
        />
      </FormSection>
    </>
  )
}
