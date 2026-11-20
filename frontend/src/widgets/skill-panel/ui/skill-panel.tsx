import { ArrowUpRight, CalendarDays, Pencil, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { domainColor, domainColorValues, useDomains } from '@/entities/domain'
import { useAllProjects } from '@/entities/project'
import { pickCycle, rampOf, usePlans } from '@/entities/plan'
import { usePracticeItems } from '@/entities/practice'
import {
  skillPaths,
  useSkill,
  useSkills,
  useUpdateSkill,
} from '@/entities/skill'
import { DeleteSkillDialog } from '@/features/skill/delete-skill'
import { EditSkillStatus } from '@/features/skill/edit-status'
import { fmtShortDate } from '@/shared/lib/date'
import { ApiError } from '@/shared/api'
import {
  Button,
  Chip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Skeleton,
  toast,
} from '@/shared/ui'
import { cn } from '@/shared/lib/utils'

import { PanelAcquisition } from './panel-acquisition'
import { PanelActivities } from './panel-activities'

/**
 * Panneau latéral d'un savoir, ouvert depuis l'arbre.
 *
 * **La page en miniature** : mêmes objets, mêmes couleurs, moins de place — et
 * sans interaction. On consulte « c'est quoi, où j'en est » sans perdre
 * l'arbre, puis on ouvre la page si on veut travailler.
 *
 * Deux corps, pas un seul dégradé : avec un cycle il montre les activités et
 * l'acquisition ; sans cycle il montre le savoir et propose d'en ouvrir un.
 * Une section vide ne dit rien qu'un bouton ne dise mieux.
 */
export function SkillPanel({
  skillId,
  onClose,
}: {
  skillId: string
  onClose: () => void
}) {
  /**
   * L'ouverture et la fermeture sont **animées**, ce qui suppose de survivre à
   * sa propre fermeture : on passe l'état à `closed`, l'animation de sortie
   * joue, et c'est seulement à sa fin qu'on prévient le parent de démonter.
   * Sans ce délai le panneau disparaîtrait d'un coup — l'entrée glissée
   * rendrait la sortie d'autant plus brutale.
   */
  const [state, setState] = useState<'open' | 'closed'>('open')
  const dismiss = useCallback(() => setState('closed'), [])

  const { data: skill, isPending } = useSkill(skillId)
  const { data: domains } = useDomains()
  const { data: projects } = useAllProjects()
  const { data: plans } = usePlans(skillId)
  const { data: items } = usePracticeItems(skillId)
  const navigate = useNavigate()

  /**
   * Nouveau cycle mène à la page du savoir, sur l'onglet « Nouveau cycle » :
   * c'est là qu'un cycle se crée (design #66) — rien n'est créé au clic.
   */
  function newCycle() {
    navigate(`/skills/${skillId}?cycle=savoir`, { state: { creating: true } })
  }
  // Le chemin se lit dans le premier domaine d'appartenance : l'arbre est
  // global, mais ses branches ne se voient que domaine par domaine.
  const { data: siblings } = useSkills(skill?.domain_id)

  useEffect(() => {
    const sortir = (e: KeyboardEvent) => e.key === 'Escape' && dismiss()
    window.addEventListener('keydown', sortir)
    return () => window.removeEventListener('keydown', sortir)
  }, [dismiss])

  // Changer de savoir sans fermer : le panneau doit se rouvrir plutôt que
  // rester coincé en sortie si un clic dans l'arbre le remplace en plein vol.
  useEffect(() => setState('open'), [skillId])

  const path = useMemo(
    () => (skill ? (skillPaths(siblings ?? []).get(skill.id) ?? '') : ''),
    [siblings, skill],
  )

  // Les projets qui attendent ce savoir : sa condition « Compétences ».
  const awaiting = (projects ?? []).filter((o) => o.skill_ids.includes(skillId))

  // Le cycle en cours, sinon le dernier prévu : le panneau montre ce qui se
  // travaille ou se prépare, pas l'historique.
  const plan = pickCycle(
    (plans ?? []).filter((p) => p.state === 'draft' || p.state === 'active'),
    null,
  )
  // Renommer en place, depuis le menu ⋯ (design #27, `prod/Savoirs`).
  const update = useUpdateSkill()
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [deleting, setDeleting] = useState(false)
  const nameInput = useRef<HTMLInputElement>(null)
  // Le champ prend le focus une fois le menu refermé — pendant, le menu le garde.
  useEffect(() => {
    if (!renaming) return
    const t = setTimeout(() => nameInput.current?.select(), 0)
    return () => clearTimeout(t)
  }, [renaming])
  function rename() {
    const name = draftName.trim()
    setRenaming(false)
    if (!skill || !name || name === skill.name) return
    update
      .mutateAsync({ id: skill.id, body: { name } })
      .catch((err) =>
        toast.error(
          err instanceof ApiError ? err.message : 'Le renommage a échoué',
        ),
      )
  }
  const domain = domains?.find((d) => d.id === skill?.domain_id)
  const accent = domainColor(domain?.color)
  const ink = domainColorValues(domain?.color).ink

  return (
    <aside
      data-state={state}
      // `target === currentTarget` : les événements d'animation **remontent**,
      // et l'animation d'un enfant fermerait le panneau au passage.
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget && state === 'closed') onClose()
      }}
      className={cn(
        'fixed inset-y-0 right-0 z-50 flex w-[29rem] max-w-full min-w-[25rem] flex-col border-l border-border bg-card shadow-xl',
        'duration-200 data-[state=open]:animate-in data-[state=open]:slide-in-from-right',
        'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right',
      )}
      aria-label="Détail du savoir"
    >
      <div className="flex items-start gap-3 border-b border-border px-5 pt-[18px] pb-3.5">
        {skill && (
          <span
            aria-hidden
            className={cn(
              'grid size-[38px] shrink-0 place-items-center rounded-xl border text-[19px]',
              accent.soft,
            )}
          >
            {domain?.emoji || '•'}
          </span>
        )}
        <div className="min-w-0 flex-1">
          {path && (
            <p className="truncate text-xs text-muted-foreground">{path}</p>
          )}
          {isPending ? (
            <Skeleton className="h-6 w-40" />
          ) : renaming ? (
            <input
              ref={nameInput}
              value={draftName}
              aria-label="Nom du savoir"
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={rename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') {
                  e.stopPropagation()
                  setRenaming(false)
                }
              }}
              className="-ml-[5px] block w-full rounded border bg-card px-1 font-heading text-lg font-semibold tracking-[-0.012em] outline-none"
              style={{ borderColor: ink }}
            />
          ) : (
            <h2 className="truncate font-heading text-lg font-semibold tracking-[-0.012em]">
              {skill?.name}
            </h2>
          )}
          {/* Une seule ligne secondaire : ce que ce cycle vise, ou à défaut ce
              qu'est le savoir. Les deux ensemble noieraient la première. */}
          {(plan?.target_level || skill?.description) && (
            <p className="mt-1 line-clamp-2 text-xs text-pretty text-muted-foreground">
              {plan?.target_level || skill?.description}
            </p>
          )}

          {/* Chips et geste d'ouverture vivent dans l'en-tête : ce sont des
              informations d'identité, pas du contenu à faire défiler. */}
          {skill && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <EditSkillStatus skill={skill} />
              {awaiting.map((o) => (
                <Link key={o.id} to={`/projects/${o.id}`}>
                  <Chip tone="neutral" className="max-w-44 truncate">
                    🎯 {o.title}
                  </Chip>
                </Link>
              ))}
              {plan?.opened_at && (
                <Chip tone="neutral">
                  <CalendarDays className="size-3" />
                  {fmtShortDate(new Date(plan.opened_at))}
                </Chip>
              )}
            </div>
          )}

          {skill && !plan && (
            <Button size="sm" className="mt-2.5" onClick={newCycle}>
              Nouveau cycle
            </Button>
          )}
        </div>
        {skill && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Actions"
                className="grid size-[26px] shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              >
                {/* Trois points pleins, comme la maquette. */}
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden
                >
                  <circle cx="5" cy="12" r="1.8" />
                  <circle cx="12" cy="12" r="1.8" />
                  <circle cx="19" cy="12" r="1.8" />
                </svg>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-[180px] text-[13px]"
              // Le champ de renommage prend le focus : le menu ne le reprend pas
              // pour son bouton en se refermant.
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <DropdownMenuItem
                onSelect={() => {
                  setDraftName(skill.name)
                  setRenaming(true)
                }}
              >
                <Pencil className="size-3.5 text-muted-foreground" /> Renommer
              </DropdownMenuItem>
              <div role="separator" className="-mx-1 my-1 h-px bg-border" />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setDeleting(true)}
              >
                <Trash2 className="size-3.5" /> Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Link
          to={`/skills/${skillId}`}
          aria-label="Ouvrir la page"
          title="Ouvrir la page"
          className="grid size-[26px] shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        >
          <ArrowUpRight className="size-4" />
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Fermer"
          className="grid size-[26px] shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      {skill && deleting && (
        <DeleteSkillDialog
          skill={skill}
          childCount={
            (siblings ?? []).filter((s) => s.parent_skill_id === skill.id)
              .length
          }
          parentName={
            (siblings ?? []).find((s) => s.id === skill.parent_skill_id)
              ?.name ?? null
          }
          projects={awaiting}
          cycleCount={(plans ?? []).length}
          onClose={() => setDeleting(false)}
          onDeleted={() => {
            setDeleting(false)
            dismiss()
          }}
        />
      )}
      {skill && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {plan ? (
            <>
              <PanelActivities
                skillId={skillId}
                accent={accent}
                domainEmoji={domain?.emoji ?? ''}
              />
              <PanelAcquisition
                plan={plan}
                items={rampOf(plan, items ?? [])}
                accent={accent}
                domainEmoji={domain?.emoji ?? ''}
              />
            </>
          ) : null}
        </div>
      )}
    </aside>
  )
}
