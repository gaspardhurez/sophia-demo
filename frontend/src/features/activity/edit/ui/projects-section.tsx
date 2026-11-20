import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Pencil,
  Plus,
  Target,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import {
  currentStep,
  isProjectOpen,
  type Project,
  inDomain,
  projectEmoji,
} from '@/entities/project'
import { cn } from '@/shared/lib/utils'
import {
  InlineMenu,
  MenuLabel,
  MenuSearch,
  PanelSection,
  Rule,
  SectionIconButton,
  SectionOk,
} from '@/shared/ui'

import {
  type CountedActivity,
  fedLines,
  type LinkDraft,
  stepDates,
} from '../model/panel'
import { TotalsCarousel } from './totals-carousel'

/**
 * **Projets** (#44) : une ligne par lien — le projet, son étape en gris, la
 * flèche vers le projet au survol, et dessous la barre des Totaux que
 * l'activité alimente. Le crayon passe la section en édition : l'étape devient
 * un menu (les étapes de CET projet, datées, « Sans étape » en pied), une
 * croix retire le lien, « Ajouter un projet » ouvre les projets ouverts du
 * domaine. Chaque geste s'enregistre aussitôt (`onChange`).
 *
 * La section n'existe qu'avec un lien, ou le temps de son ajout (#46) :
 * « Projet » dans le « + » de l'en-tête ouvre le menu des projets du
 * domaine (`adding`) — quitté sans choix, il se referme ; retirer le dernier
 * lien fait disparaître la section. Le crayon reste pour éditer.
 *
 * Les liens sont explicites : ce qu'on pose ici ne bouge plus seul.
 */
export function ProjectsSection({
  links,
  projects,
  domainId,
  domainEmoji,
  color,
  counted,
  day,
  onChange,
  onNavigate,
  adding: requested,
  onDone,
  readOnly = false,
}: {
  /** Le « + » de l'en-tête a choisi « Projet » : le menu d'ajout s'ouvre. */
  adding: boolean
  onDone: () => void
  links: LinkDraft[]
  projects: Project[]
  domainId: string
  domainEmoji: string
  /** Couleur du domaine, en valeur CSS. */
  color: string
  counted: CountedActivity
  /** Jour de l'activité (YYYY-MM-DD) : l'étape en cours d'un projet ajouté. */
  day: string
  onChange: (next: LinkDraft[]) => void
  onNavigate: () => void
  /** Calendrier en focus sur un projet : les liens se lisent, ne se
   *  modifient pas. */
  readOnly?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [stepMenu, setStepMenu] = useState<string | null>(null)
  // « Ajouter un projet » en mode édition, ou le « + » de l'en-tête.
  const [addingInEdit, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const adding = addingInEdit || requested

  const byId = new Map(projects.map((o) => [o.id, o]))
  const linked = new Set(links.map((l) => l.project_id))
  const q = query.trim().toLowerCase()
  const catalogue = projects.filter(
    (o) =>
      inDomain(o, domainId) &&
      isProjectOpen(o.status) &&
      !linked.has(o.id) &&
      (!q || o.title.toLowerCase().includes(q)),
  )

  function setStep(projectId: string, stepId: string | null) {
    setStepMenu(null)
    onChange(
      links.map((l) =>
        l.project_id === projectId ? { ...l, step_id: stepId } : l,
      ),
    )
  }

  function remove(projectId: string) {
    setStepMenu(null)
    const next = links.filter((l) => l.project_id !== projectId)
    // Le dernier lien retiré : la section disparaît, l'édition avec elle.
    if (next.length === 0) finish()
    onChange(next)
  }

  function add(o: Project) {
    // Le projet arrive à l'étape en cours le jour de l'activité — celle que
    // le menu montre à côté de son nom : rien n'est posé qu'on n'ait vu.
    const step = o.steps.length ? currentStep(o, day) : null
    setAdding(false)
    setQuery('')
    onDone()
    onChange([...links, { project_id: o.id, step_id: step?.id ?? null }])
  }

  function finish() {
    setEditing(false)
    setAdding(false)
    setStepMenu(null)
    setQuery('')
    onDone()
  }

  function dismiss() {
    setQuery('')
    onDone()
  }

  if (links.length === 0 && !requested) return null

  return (
    <>
      <Rule />
      <PanelSection
        icon={Target}
        title="Projets"
        always={editing}
        onDismiss={requested ? dismiss : undefined}
        action={
          editing ? (
            <SectionOk onClick={finish} />
          ) : links.length === 0 || readOnly ? undefined : (
            <SectionIconButton
              label="Modifier les projets"
              icon={Pencil}
              onClick={() => setEditing(true)}
            />
          )
        }
      >
        {links.map((link) => {
          const o = byId.get(link.project_id)
          if (!o) return null
          const step = link.step_id
            ? o.steps.find((s) => s.id === link.step_id)
            : undefined
          const lines = fedLines(o, link.step_id, counted)
          const menuOpen = stepMenu === o.id
          return (
            <div key={o.id}>
              <div className="group/line flex flex-col gap-1 rounded-md px-2 py-1.5 hover:bg-muted/60">
                <div className="flex min-w-0 items-center gap-2 text-sm">
                  <span className="shrink-0">
                    {projectEmoji(o, domainEmoji)}
                  </span>
                  <span className="max-w-[60%] shrink-0 truncate font-medium">
                    {o.title}
                  </span>
                  {editing ? (
                    <button
                      type="button"
                      onClick={() => setStepMenu(menuOpen ? null : o.id)}
                      className={cn(
                        'inline-flex h-[22px] min-w-0 items-center gap-0.5 rounded-[5px] px-1.5 text-xs hover:bg-muted',
                        menuOpen
                          ? 'bg-muted text-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      <span className="truncate">
                        {step?.title ?? 'sans étape'}
                      </span>
                      <ChevronDown className="size-3 shrink-0" />
                    </button>
                  ) : (
                    <span className="min-w-0 truncate text-xs text-muted-foreground">
                      {step?.title ?? ''}
                    </span>
                  )}
                  <span className="invisible ml-auto flex shrink-0 text-muted-foreground group-hover/line:visible">
                    {editing ? (
                      <button
                        type="button"
                        aria-label="Retirer"
                        onClick={() => remove(o.id)}
                        className="grid hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    ) : (
                      <Link
                        to={`/projects/${o.id}`}
                        onClick={onNavigate}
                        aria-label="Ouvrir le projet"
                        className="grid hover:text-foreground"
                      >
                        <ArrowUpRight className="size-3.5" />
                      </Link>
                    )}
                  </span>
                </div>
                {lines.length > 0 && (
                  <TotalsCarousel lines={lines} color={color} />
                )}
              </div>
              {editing && menuOpen && (
                <InlineMenu className="ml-[30px] p-1">
                  {o.steps.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setStep(o.id, s.id)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60',
                        s.id === link.step_id && 'bg-muted/60',
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{s.title}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {stepDates(s)}
                      </span>
                      <Check
                        className={cn(
                          'size-3.5 shrink-0',
                          s.id !== link.step_id && 'invisible',
                        )}
                      />
                    </button>
                  ))}
                  {o.steps.length > 0 && (
                    <div className="my-1 border-t border-border" />
                  )}
                  <button
                    type="button"
                    onClick={() => setStep(o.id, null)}
                    className="flex w-full rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted/60"
                  >
                    Sans étape
                  </button>
                </InlineMenu>
              )}
            </div>
          )
        })}

        {editing && (
          <button
            type="button"
            onClick={() => setAdding((a) => !a)}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              adding && 'bg-muted/60 text-foreground',
            )}
          >
            <Plus className="size-3.5" />
            Ajouter un projet
          </button>
        )}
        {adding && (
          <InlineMenu>
            <MenuSearch
              value={query}
              onChange={setQuery}
              placeholder="Rechercher un projet…"
            />
            <MenuLabel>Projets du domaine</MenuLabel>
            <div className="max-h-52 overflow-y-auto pb-1">
              {catalogue.map((o) => {
                const step = o.steps.length ? currentStep(o, day) : null
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => add(o)}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-muted/60"
                  >
                    <span className="shrink-0">
                      {projectEmoji(o, domainEmoji)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{o.title}</span>
                    {step && (
                      <span className="max-w-[45%] shrink-0 truncate text-[11px] text-muted-foreground">
                        {step.title}
                      </span>
                    )}
                  </button>
                )
              })}
              {catalogue.length === 0 && (
                <p className="px-2.5 pt-1 pb-1.5 text-xs text-muted-foreground">
                  Aucun autre projet ouvert
                </p>
              )}
            </div>
          </InlineMenu>
        )}
      </PanelSection>
    </>
  )
}
