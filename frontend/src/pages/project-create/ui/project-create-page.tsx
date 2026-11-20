import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect, useEffectEvent, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { LinkWeek, type LinkColors } from '@/entities/activity-type'
import {
  domainColor,
  domainColorValues,
  useDomains,
  useDomainsOf,
} from '@/entities/domain'
import { useProject } from '@/entities/project'
import { ApiError } from '@/shared/api'
import { useDocumentTitle } from '@/shared/lib/document-title'
import { cn } from '@/shared/lib/utils'
import { Button, FormSection, Skeleton, toast } from '@/shared/ui'
import {
  ActivityTypesEditor,
  useServerLinkHandlers,
} from '@/features/activity-type-link'
import { ProjectObjectives } from '@/widgets/project/objectives'
import { ProjectHeader, ProjectSummary } from '@/widgets/project/header'
import { ProjectPlan } from '@/widgets/project/plan'
import { SkillPanel } from '@/widgets/skill-panel'
import { ProjectSkillMaps } from '@/widgets/skill-tree'

import { otherLayerOpen } from '../lib/layers'
import { useProjectDraft } from '../model/use-project-draft'
import { AbandonCreationDialog } from './abandon-creation-dialog'
import { ProjectFields } from './project-fields'
import { SkillPicker } from './skill-picker'

type Step = 1 | 2 | 3 | 4

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'Le projet' },
  { n: 2, label: 'Les objectifs' },
  { n: 3, label: 'Le plan' },
  { n: 4, label: 'Résumé' },
]

/**
 * Créer un projet (design #33, `prod/Creation projet`) : une modale en
 * quatre étapes, par-dessus un fond. Le projet naît en base en quittant
 * l'étape 1 ; les objectifs et le plan l'éditent avec les pièces mêmes de la
 * page projet, forcées en édition ; le résumé est la page en lecture.
 *
 * C'est la page qui compose : les widgets ne s'importent pas entre eux.
 */
export function ProjectCreatePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  useDocumentTitle('Nouveau projet')

  const { data: domains } = useDomains()
  const draft = useProjectDraft(params.get('domain'))
  const { patch } = draft
  const { data: project } = useProject(draft.id ?? undefined)
  // Les domaines (#203) : ceux du brouillon, puis ceux du projet créé.
  const domainIds = project?.domain_ids ?? draft.fields.domainIds
  const domainId = domainIds[0] as string | undefined
  // Sans domaine dans l'adresse, le premier de la liste.
  useEffect(() => {
    if (!domainId && domains?.length) patch({ domainIds: [domains[0].id] })
  }, [domainId, domains, patch])
  const domain = domains?.find((d) => d.id === domainId)
  const projectDomains = useDomainsOf(domainIds)
  // Les activités types : en brouillon tant que le projet n'existe pas, en
  // base ensuite (#38).
  const serverHandlers = useServerLinkHandlers(draft.id ?? '')
  const values = domainColorValues(domain?.color)
  const linkColors: LinkColors = {
    soft: values.soft,
    bord: values.bord,
    ink: values.ink,
  }
  const links = project ? project.activity_types : draft.links

  const [step, setStep] = useState<Step>(1)
  const [view, setView] = useState<'steps' | 'skills'>('steps')
  const [untyped, setUntyped] = useState(false)
  const [blankStep, setBlankStep] = useState(false)
  const [picker, setPicker] = useState(false)
  const [openSkillId, setOpenSkillId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [abandoning, setAbandoning] = useState(false)

  // Continuer : un titre et une période complète (#32), un type sur chaque
  // carte d'objectif, un titre sur chaque étape du plan.
  const ok = [draft.complete, !untyped, !blankStep, true]
  const reachable = (n: Step) => ok.slice(0, n - 1).every(Boolean)

  async function go(n: Step) {
    if (n === step || !reachable(n) || draft.saving) return
    if (step === 1) {
      try {
        await draft.save()
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : 'La création a échoué',
        )
        return
      }
    }
    setStep(n)
  }

  function leave() {
    // Retour d'où l'on vient ; ouverte d'un lien direct, la page du domaine.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate(domainId ? `/domains/${domainId}` : '/')
  }

  function close() {
    if (draft.dirty) setConfirming(true)
    else leave()
  }

  async function abandon() {
    setAbandoning(true)
    try {
      await draft.discard()
      leave()
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'La suppression a échoué',
      )
      setAbandoning(false)
    }
  }

  function next() {
    if (!ok[step - 1]) return
    if (step === 4 && draft.id)
      navigate(`/projects/${draft.id}`, { replace: true })
    else void go((step + 1) as Step)
  }

  // Échap ferme — sauf si une couche passe devant (menu, sélecteur, arbre).
  const onEscape = useEffectEvent((e: KeyboardEvent) => {
    if (e.key !== 'Escape' || picker || otherLayerOpen()) return
    close()
  })
  useEffect(() => {
    window.addEventListener('keydown', onEscape, true)
    return () => window.removeEventListener('keydown', onEscape, true)
  }, [])

  // La modale tient l'écran : la page dessous ne défile pas.
  useEffect(() => {
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
    }
  }, [])

  const width =
    step === 4
      ? 'max-w-[1000px]'
      : step === 3 && view === 'skills'
        ? 'max-w-[960px]'
        : 'max-w-[640px]'
  const color = domainColor(domain?.color)
  const loading = step > 1 && !project

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[oklch(0.21_0.008_285/0.35)] px-4 py-6">
      <div
        role="dialog"
        aria-modal
        aria-label="Nouveau projet"
        className={cn(
          'flex max-h-[calc(100svh-48px)] w-full flex-col rounded-xl bg-card shadow-[0_24px_48px_-12px_oklch(0.21_0.008_285/0.3)] transition-[max-width] duration-200',
          width,
        )}
      >
        <div className="flex shrink-0 items-start gap-1.5 px-[18px] pt-4">
          {STEPS.map(({ n, label }) => {
            const current = n === step
            return (
              <button
                key={n}
                type="button"
                onClick={() => void go(n)}
                aria-current={current ? 'step' : undefined}
                className={cn(
                  'flex min-w-0 flex-1 flex-col gap-[7px] text-left',
                  reachable(n) ? 'cursor-pointer' : 'cursor-not-allowed',
                )}
              >
                <span
                  className={cn(
                    'h-1 rounded-full',
                    n <= step ? 'bg-primary' : 'bg-muted',
                  )}
                />
                <span
                  className={cn(
                    'truncate text-xs font-semibold',
                    current ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {label}
                </span>
              </button>
            )
          })}
          <button
            type="button"
            aria-label="Fermer"
            onClick={close}
            className="-mt-1.5 -mr-2 ml-2.5 grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-x-hidden overflow-y-auto px-[18px] py-4">
          {step > 1 && step < 4 && project && (
            <div className="-mx-[18px] -mt-4 border-b px-[18px] pt-4 pb-3.5">
              <ProjectSummary project={project} domain={domain} />
            </div>
          )}

          {step === 1 && (
            <ProjectFields
              fields={draft.fields}
              onChange={patch}
              domains={domains ?? []}
              project={project}
            />
          )}
          {step === 1 && domainId && (
            <FormSection
              title="Activités types"
              hint="Ce que tu vas faire pour y arriver, et à quel rythme."
            >
              <ActivityTypesEditor
                links={links}
                totals={project?.totals ?? []}
                domains={projectDomains}
                colors={linkColors}
                inkClassName={domainColor(domain?.color).ink}
                handlers={project ? serverHandlers : draft.localHandlers}
              />
            </FormSection>
          )}

          {loading && <Skeleton className="h-60 w-full rounded-xl" />}

          {step === 2 && project && (
            <ProjectObjectives
              project={project}
              create={{
                onChooseSkills: () => setPicker(true),
                onUntypedChange: setUntyped,
              }}
            />
          )}

          {step === 3 && project && (
            <ProjectPlan
              project={project}
              color={color}
              colorKey={domain?.color}
              emoji={domain?.emoji}
              create={{
                view,
                onViewChange: setView,
                onBlankTitleChange: setBlankStep,
              }}
              renderTree={(mode, onAttachModeChange) => (
                <ProjectSkillMaps
                  project={project}
                  mode={mode}
                  openSkillId={openSkillId}
                  onOpenSkill={setOpenSkillId}
                  onAttachModeChange={onAttachModeChange}
                />
              )}
            />
          )}

          {/* Le résumé : la page projet en lecture, tout replié, sans sa
              colonne de droite. */}
          {step === 4 && project && (
            <div className="rounded-xl border bg-background">
              <ProjectHeader project={project} domain={domain} preview />
              <div className="grid grid-cols-[minmax(0,1fr)] gap-7 p-6">
                {project.activity_types.length > 0 && (
                  <section className="grid gap-2.5">
                    <h3 className="font-heading text-sm font-semibold">
                      Activités types
                    </h3>
                    <div className="rounded-[10px] bg-muted/70 px-3.5 py-3">
                      <LinkWeek
                        links={project.activity_types}
                        colors={linkColors}
                      />
                    </div>
                  </section>
                )}
                <ProjectPlan
                  project={project}
                  color={color}
                  colorKey={domain?.color}
                  emoji={domain?.emoji}
                  preview
                  renderTree={(mode) => (
                    <ProjectSkillMaps
                      project={project}
                      mode={mode}
                      openSkillId={openSkillId}
                      onOpenSkill={setOpenSkillId}
                    />
                  )}
                />
                <ProjectObjectives project={project} preview />
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 rounded-b-xl border-t bg-background px-[18px] py-3.5">
          {step > 1 && (
            <Button
              variant="ghost"
              className="pr-3 pl-2.5 text-xs font-semibold"
              onClick={() => setStep((step - 1) as Step)}
            >
              <ChevronLeft className="size-[15px]" />
              Retour
            </Button>
          )}
          <Button
            className="ml-auto text-xs font-semibold disabled:opacity-40"
            disabled={!ok[step - 1] || loading}
            isPending={draft.saving}
            onClick={next}
          >
            {step < 4 ? 'Continuer' : 'Créer le projet'}
            {step < 4 && <ChevronRight className="size-[15px]" />}
          </Button>
        </div>
      </div>

      {picker && project && (
        <SkillPicker
          project={project}
          domain={domain}
          onClose={() => setPicker(false)}
        />
      )}
      {openSkillId && (
        <SkillPanel
          skillId={openSkillId}
          onClose={() => setOpenSkillId(null)}
        />
      )}
      <AbandonCreationDialog
        open={confirming}
        title={draft.fields.title}
        pending={abandoning}
        onStay={() => setConfirming(false)}
        onAbandon={() => void abandon()}
      />
    </div>
  )
}
