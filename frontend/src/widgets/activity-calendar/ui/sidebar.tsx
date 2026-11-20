import { ArrowUpRight } from 'lucide-react'
import { type ReactNode, useMemo } from 'react'
import { Link } from 'react-router-dom'

import {
  currentStep,
  type WeekActivity,
  isProjectOpen,
  type Project,
  weekAhead,
  WeekProjectCard,
  weekScope,
  principalDomainId,
  projectEmoji,
} from '@/entities/project'
import { ProjectTrackingRow } from '@/features/project/tracking'
import { addDays, startOfDay, toDateISO, toLocalISO } from '@/shared/lib/date'
import { unitLabel } from '@/shared/lib/units'

import { SidebarSection } from './sidebar-section'

/**
 * Panneau latéral du calendrier global (#215), filtré par la bande de
 * domaines de l'en-tête : « Projets du moment » — ceux qui se jouent cette
 * semaine —, un filet, puis « Motivations du moment » (le bloc de la page :
 * Envies et Engagements). Les deux sections se replient par leur titre. Les
 * activités types, elles, sont en tête de grille (19/11).
 *
 * Il portait aussi la to-do du jour. Elle répétait ce que la grille montre
 * juste à côté — avec moins de contexte, puisqu'elle perdait l'heure et la
 * durée — et elle prenait la place des cartes de projet, devenues nombreuses.
 *
 * Surtout, elle mélangeait deux rôles : `/calendar` sert à PLANIFIER (poser,
 * déplacer, redimensionner), l'accueil à EXÉCUTER (cocher ce qui est fait), et
 * la to-do y vit déjà. Ce qu'on perd ici, c'est cocher en un clic depuis le
 * calendrier ; la réponse sera de rendre le bloc cochable, pas de remettre la
 * liste.
 */
export function CalendarSidebar({
  weekStart,
  weekEnd,
  projects,
  emojiOf,
  dotOf,
  baseOf,
  colorKeyOf,
  ahead,
  note,
  selectedDomains,
  focusedProjectId,
  onFocusProject,
}: {
  weekStart: Date
  weekEnd: Date
  projects: Project[]
  emojiOf: (id: string) => string
  /** Pastille pleine du domaine — la barre se peint comme partout ailleurs. */
  dotOf: (id: string) => string
  /** La couleur du domaine en valeur CSS : le point courant du défilement. */
  baseOf: (id: string) => string
  /** La clé de couleur du domaine : la teinte des chips du projet. */
  colorKeyOf: (id: string) => string | null
  /**
   * Les activités du plus tôt d'aujourd'hui et du début de la semaine affichée
   * jusqu'à sa fin, lues **par le calendrier** — le panneau n'en fait plus la
   * demande.
   *
   * S'y ajoutent les fantômes, lus comme des activités à venir : ce qui n'est
   * pas encore posé compte dans le prévisionnel (#37, §6).
   */
  ahead: WeekActivity[]
  /** Un bloc de la page, tout en haut (les envies du moment). */
  note?: ReactNode
  /** Les domaines choisis dans l'en-tête, dans l'ordre du choix ; aucun =
   *  tout. */
  selectedDomains: string[]
  /** Le projet en focus au calendrier, s'il y en a un. */
  focusedProjectId?: string
  /** Un clic sur une carte met son projet en focus ; sur la carte en
   *  focus, l'en sort (`null`). */
  onFocusProject?: (projectId: string | null) => void
}) {
  const todayStr = toLocalISO(new Date()).slice(0, 10)

  /**
   * Le prévisionnel est **cumulatif** : d'aujourd'hui jusqu'à la fin de la
   * semaine affichée, pas la semaine seule.
   *
   * Sinon une semaine lointaine montrerait sa maigre contribution comme si les
   * semaines qui la précèdent n'existaient pas. En cumulant, la zone grandit à
   * mesure qu'on avance et on lit **où** se trouve le volume de l'étape — ce
   * que la barre seule ne dit pas.
   */
  const today = startOfDay(new Date())

  /**
   * Les projets de la semaine affichée : **tous** ceux qui sont ouverts et
   * dont la période la touche, avec ou sans activité, avec ou sans Total
   * (un projet sans Total manquait alors que ses séances
   * étaient posées). Chacun avec la barre la plus précise dont il dispose —
   * l'étape en cours si elle distribue, sinon le projet (`weekScope`, la
   * même lecture que la carte « Cette semaine » de la page projet) ; sans
   * Total, la carte n'a pas de barre, elle dit le projet et son étape.
   *
   * Avant, seul ce que la semaine faisait avancer entrait (`weekCounts`) : un
   * projet sans Total, ou sans rien de posé, n'apparaissait jamais.
   */
  const firstDay = toDateISO(weekStart)
  const lastDay = toDateISO(addDays(weekEnd, -1))
  const rows = useMemo(
    () =>
      projects.flatMap((project) => {
        if (!isProjectOpen(project.status)) return []
        // Un projet à plusieurs domaines y est dès qu'un des siens est
        // choisi (#203).
        if (
          selectedDomains.length > 0 &&
          !project.domain_ids.some((d) => selectedDomains.includes(d))
        )
          return []
        // Sans fin (#196) : toutes les semaines dès son début.
        if (
          project.start_at > lastDay ||
          (project.due_at !== null && project.due_at < firstDay)
        )
          return []
        const scope = weekScope(project, todayStr)
        if (scope) return [{ project, ...scope }]
        const step = currentStep(project, todayStr)
        return [
          {
            project,
            step,
            scopeId: project.id,
            lines: [],
            lineScope: new Map(),
          },
        ]
      }),
    [projects, todayStr, firstDay, lastDay, selectedDomains],
  )

  /** Ce qui reste posé au calendrier, par périmètre puis par barre. */
  const plannedByScope = useMemo(
    () =>
      new Map(
        rows.map((c) => [
          c.scopeId,
          weekAhead(c.project, c, ahead ?? [], weekStart, weekEnd, today),
        ]),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ahead, rows, weekStart, weekEnd],
  )

  return (
    // `w-80` : à 288 px, « Cuisine · Septembre : 40 km » tronquait dès qu'un
    // projet et une étape se partageaient la ligne.
    <aside className="scrollbar-quiet flex w-80 shrink-0 flex-col overflow-y-auto border-r border-border p-4">
      <SidebarSection
        id="projects"
        title="Projets du moment"
        // Choisir un domaine rouvre les projets, même repliés (20/11).
        openOn={selectedDomains.join(',')}
      >
        <div className="mb-6 space-y-2.5">
          {rows.length === 0 && (
            <p className="ml-0.5 text-[12.5px] text-muted-foreground">
              {selectedDomains.length > 0
                ? 'Aucun projet en cours dans ces domaines.'
                : 'Aucun projet en cours cette semaine.'}
            </p>
          )}
          {rows.map(({ project: o, step, scopeId, lines }) => {
            const emoji = projectEmoji(o, emojiOf(principalDomainId(o)))
            // Un clic sur la carte met le projet en focus au calendrier (un
            // second l'en sort) ; la flèche, au survol, mène à sa page.
            const focused = focusedProjectId === o.id
            return (
              <WeekProjectCard
                key={scopeId}
                title={
                  <>
                    {emoji && `${emoji} `}
                    {o.title}
                  </>
                }
                onClick={
                  onFocusProject
                    ? () => onFocusProject(focused ? null : o.id)
                    : undefined
                }
                // En focus : un contour à la couleur de son domaine (#217).
                style={
                  focused
                    ? {
                        borderColor: baseOf(principalDomainId(o)),
                        boxShadow: `0 0 0 2px color-mix(in oklab, ${baseOf(principalDomainId(o))} 20%, transparent)`,
                      }
                    : undefined
                }
                trailing={
                  <Link
                    to={`/projects/${o.id}`}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Ouvrir ${o.title}`}
                    title="Ouvrir le projet"
                    className="grid size-5 place-items-center rounded text-muted-foreground opacity-0 transition-opacity group-hover/card:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"
                  >
                    <ArrowUpRight className="size-3.5" />
                  </Link>
                }
                stepTitle={step?.title ?? null}
                lines={lines}
                planned={plannedByScope.get(scopeId)}
                barClassName={dotOf(principalDomainId(o))}
                color={baseOf(principalDomainId(o))}
                // Le prévu de la semaine affichée seule ; rien quand rien n'est
                // posé. Puis les chips de l'en-tête du projet, en lecture seule
                // (comme la carte de l'accueil).
                footer={(line, p) => (
                  <>
                    {line && p != null && p.week > 0 && (
                      <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                        +{p.week} {unitLabel(line.unit, p.week)} cette semaine
                      </p>
                    )}
                    <ProjectTrackingRow
                      project={o}
                      colorKey={colorKeyOf(principalDomainId(o))}
                      className="mt-2.5"
                    />
                  </>
                )}
              />
            )
          })}
        </div>
      </SidebarSection>
      {note && (
        <>
          <div className="mb-4 h-px shrink-0 bg-border" />
          <SidebarSection id="motivation" title="Motivations du moment">
            {note}
          </SidebarSection>
        </>
      )}
    </aside>
  )
}
