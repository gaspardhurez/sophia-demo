import { useState } from 'react'

import { type Domain, domainColor, domainColorValues } from '@/entities/domain'
import { NotesThumbnail, useNotes } from '@/entities/note'
import type { Project } from '@/entities/project'
import type { AcquisitionPlan } from '@/entities/plan'
import type { PracticeItem } from '@/entities/practice'
import {
  type Resource,
  ResourcesSection,
  useResources,
} from '@/entities/resource'
import type { Skill } from '@/entities/skill'
import { PlanActivityDialog } from '@/features/activity/plan'
import {
  pickNatureOf,
  SearchOrCreate,
  useComposeRamp,
} from '@/features/plan/compose-ramp'
import { PracticeItemDialog } from '@/features/practice/edit-item'
import { NewResourceDialog } from '@/features/resource/create'
import { EditResourceDialog } from '@/features/resource/edit'
import { cn } from '@/shared/lib/utils'
import {
  CHIP_TONES,
  SectionAddButton,
  SectionTitle,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/ui'

import { CycleTabs } from './cycle-tabs'

const KIND_LABEL = {
  exo: 'Exo manuel',
  int: 'Intégré',
  app: 'Mise en situation',
}

/**
 * L'onglet **Bibliothèque** (design #75, `prod/Savoir`, ex-« Vue
 * d'ensemble ») : le savoir hors de tout cycle. Pas d'activités, pas de liste
 * des cycles — ils sont dans la barre d'onglets. La bibliothèque (« + » au
 * survol de la section, pour repérer un objet sans cycle) ; à droite, les
 * notes.
 */
export function SkillOverview({
  skill,
  domain,
  plans,
  library,
  projects,
  onSelect,
  onNew,
  openItemId,
}: {
  skill: Skill
  domain: Domain | undefined
  plans: AcquisitionPlan[]
  library: PracticeItem[]
  projects: Project[]
  /** Montrer un cycle, ou la bibliothèque (`null`). */
  onSelect: (planId: string | null) => void
  /** Ouvrir l'onglet « Nouveau cycle ». */
  onNew: () => void
  /** L'objet dont la modale s'ouvre à l'arrivée (« Ouvrir l'exercice »
   *  d'un acte, #82). */
  openItemId?: string | null
}) {
  const accent = domainColor(domain?.color)
  const { data: notes } = useNotes(skill.id)
  const { data: resources } = useResources(skill.id)
  const [newResource, setNewResource] = useState(false)
  const [editedResource, setEditedResource] = useState<Resource | null>(null)
  const values = domainColorValues(domain?.color)
  const emoji = domain?.emoji ?? ''
  const compose = useComposeRamp(skill.id)
  const [adding, setAdding] = useState(false)
  const [openedId, setOpenedId] = useState<string | null>(openItemId ?? null)
  const [planFor, setPlanFor] = useState<PracticeItem | null>(null)
  const opened = library.find((i) => i.id === openedId) ?? null

  return (
    <>
      <CycleTabs
        plans={plans}
        selected={null}
        projects={projects}
        color={values.base}
        onSelect={onSelect}
        onNew={onNew}
      />
      <div className="flex items-start gap-6 p-6 max-[900px]:flex-col">
        <div className="flex min-w-0 flex-1 flex-col gap-7">
          <section className="group/library flex flex-col gap-2.5">
            <SectionTitle
              as="h3"
              className="mb-0"
              addSlot={
                <Popover open={adding} onOpenChange={setAdding}>
                  <PopoverTrigger asChild>
                    <SectionAddButton
                      label="Repérer un objet"
                      className="opacity-0 group-hover/library:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                    />
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto p-1.5">
                    <SearchOrCreate
                      candidates={[]}
                      library={library}
                      natures={['exo', 'int', 'app']}
                      accent={accent}
                      onPick={() => undefined}
                      onCreate={(title, n) => {
                        setAdding(false)
                        void compose.create(title, n)
                      }}
                    />
                  </PopoverContent>
                </Popover>
              }
            >
              Bibliothèque
              <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">
                {library.length}
              </span>
            </SectionTitle>
            {library.length > 0 && (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2">
                {library.map((item) => {
                  const kind = pickNatureOf(item)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setOpenedId(item.id)}
                      className="flex items-center gap-2.5 rounded-[10px] border bg-card p-2.5 text-left shadow-[0_1px_2px_0_oklch(0.21_0.008_285/0.06)] hover:bg-muted/40"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'grid size-7 shrink-0 place-items-center rounded-[7px] border text-sm',
                          item.kind === 'integrated'
                            ? CHIP_TONES.sky
                            : accent.soft,
                        )}
                      >
                        {item.emoji || emoji || '•'}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                        <span className="text-[13px] leading-[1.3] font-medium text-pretty">
                          {item.title}
                        </span>
                        {kind && (
                          <span className="text-[11px] text-muted-foreground">
                            {KIND_LABEL[kind]}
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        </div>

        <aside className="flex w-[360px] shrink-0 flex-col gap-5 max-[900px]:w-full">
          <section className="flex flex-col gap-2.5">
            <h4 className="font-heading text-sm font-semibold">Notes</h4>
            <NotesThumbnail
              name={skill.name}
              to={`/skills/${skill.id}/notes`}
              notes={notes}
            />
          </section>
          <ResourcesSection
            resources={resources ?? []}
            exercises={library
              .filter((i) => i.reference)
              .map((i) => ({
                id: i.id,
                emoji: i.emoji || emoji || '•',
                title: i.title,
                reference: i.reference as string,
              }))}
            onAdd={() => setNewResource(true)}
            onEdit={setEditedResource}
            collapseAfter={5}
          />
        </aside>

        {newResource && (
          <NewResourceDialog
            skillId={skill.id}
            onClose={() => setNewResource(false)}
          />
        )}
        {editedResource && (
          <EditResourceDialog
            resource={editedResource}
            onClose={() => setEditedResource(null)}
          />
        )}

        {opened && (
          <PracticeItemDialog
            item={opened}
            open
            onOpenChange={(o) => !o && setOpenedId(null)}
            accent={accent}
            domainEmoji={emoji}
            onPlan={(item) => {
              setOpenedId(null)
              setPlanFor(item)
            }}
          />
        )}

        {planFor && domain && (
          <PlanActivityDialog
            skillId={skill.id}
            skillName={skill.name}
            domainId={domain.id}
            accent={accent}
            domainEmoji={emoji}
            target={planFor}
            onOpenChange={(o) => !o && setPlanFor(null)}
          />
        )}
      </div>
    </>
  )
}
