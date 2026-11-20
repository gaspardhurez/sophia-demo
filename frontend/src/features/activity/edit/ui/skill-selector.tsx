import { Check, ChevronDown } from 'lucide-react'
import { useMemo, useState } from 'react'

import { currentStep, type Project } from '@/entities/project'
import {
  buildSkillTree,
  type Skill,
  SkillLevelGauge,
  type SkillNode,
  skillPaths,
} from '@/entities/skill'
import { cn } from '@/shared/lib/utils'
import { InlineMenu, MenuLabel, MenuSearch } from '@/shared/ui'

import type { LinkDraft } from '../model/panel'

type Colors = { ink: string; soft: string; bord: string }

/** Un savoir « en cours » : ouvert, pas encore acquis. */
const inProgress = (level: number) => level > 0 && level < 4

/**
 * Le sélecteur de savoir (#44, #93), à onglets : **le projet lié** —
 * sa séquence, filtrée sur l'étape du lien (sinon l'étape en cours) s'il a des
 * étapes, réduite par défaut à ceux en cours — puis **le domaine** — ses
 * savoirs en cours épinglés, puis l'arbre repliable, où une branche se choisit
 * par la coche au survol. Ni anneau ni compteur.
 *
 * Un onglet par projet lié qui a une séquence ; le cas courant en a un.
 *
 * **Restreint à un projet** (`only`, la préparation de la semaine) : sa
 * séquence seule — ni onglets, ni domaine, ni recherche.
 *
 * `allowed` : les savoirs qui se choisissent (#108 : ceux qui ont un cycle,
 * pas encore listés) ; les autres disparaissent des listes, et dans l'arbre
 * une branche reste dépliable sans se choisir.
 */
export function SkillSelector({
  skills,
  links,
  projects,
  domainLabel,
  day,
  value,
  colors,
  onChoose,
  only,
  allowed = () => true,
  first,
}: {
  skills: Skill[]
  links: LinkDraft[]
  projects: Project[]
  /** « 🧑‍💻 Dev » : l'onglet du domaine, et l'emoji des onglets de projet. */
  domainLabel: { emoji: string; name: string }
  day: string
  value: string | null
  colors: Colors
  onChoose: (skillId: string) => void
  /** Restreint à ce projet (et à cette étape, sinon celle en cours). */
  only?: LinkDraft
  allowed?: (skillId: string) => boolean
  /** Le prochain savoir de la séquence (#109) : mis en avant, à sa place dans
   *  la séquence, même pas encore commencé. */
  first?: string
}) {
  const tabs = links.flatMap((l) => {
    const o = projects.find((x) => x.id === l.project_id)
    return o && o.learning.length > 0 ? [{ project: o, link: l }] : []
  })
  // L'onglet d'un projet s'ouvre d'abord s'il y en a un ; sinon le domaine.
  const [tab, setTab] = useState(0)
  const onDomain = tab >= tabs.length

  const restricted = only
    ? projects.find((o) => o.id === only.project_id)
    : undefined
  if (only)
    return (
      <InlineMenu>
        {restricted ? (
          <SequenceTab
            project={restricted}
            link={only}
            day={day}
            value={value}
            colors={colors}
            allowed={allowed}
            first={first}
            onChoose={onChoose}
          />
        ) : null}
      </InlineMenu>
    )

  return (
    <InlineMenu>
      <div className="flex gap-0.5 border-b border-border p-1">
        {[
          ...tabs.map(({ project }) =>
            `${domainLabel.emoji} ${project.title}`.trim(),
          ),
          `${domainLabel.emoji} ${domainLabel.name}`.trim(),
        ].map((label, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setTab(i)}
            className={cn(
              'h-[26px] min-w-0 flex-1 truncate rounded-md px-2 text-xs font-semibold',
              i === tab || (onDomain && i === tabs.length)
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {onDomain ? (
        <DomainTab
          skills={skills}
          domainLabel={domainLabel}
          value={value}
          colors={colors}
          allowed={allowed}
          onChoose={onChoose}
        />
      ) : (
        <SequenceTab
          key={tabs[tab].project.id}
          project={tabs[tab].project}
          link={tabs[tab].link}
          day={day}
          value={value}
          colors={colors}
          allowed={allowed}
          first={first}
          onChoose={onChoose}
        />
      )}
    </InlineMenu>
  )
}

function SequenceTab({
  project,
  link,
  day,
  value,
  colors,
  allowed,
  first,
  onChoose,
}: {
  project: Project
  link: LinkDraft
  day: string
  value: string | null
  colors: Colors
  allowed: (skillId: string) => boolean
  first?: string
  onChoose: (skillId: string) => void
}) {
  const [complete, setComplete] = useState(false)
  // L'étape du lien, sinon celle en cours ce jour-là — si le projet en a.
  const step = project.steps.length
    ? ((link.step_id
        ? project.steps.find((s) => s.id === link.step_id)
        : null) ?? currentStep(project, day))
    : null
  const sequence = project.learning
    .map((s, i) => ({ ...s, rank: s.position ?? i + 1 }))
    .filter(
      (s) =>
        allowed(s.skill_id) &&
        (!step ||
          step.skill_ids.length === 0 ||
          step.skill_ids.includes(s.skill_id)),
    )
  const kept = complete
    ? sequence
    : sequence.filter((s) => inProgress(s.level) || s.skill_id === first)
  // Dans l'ordre de la séquence : le prochain savoir est mis en avant à sa
  // place, après ceux en cours.
  const shown = kept

  return (
    <>
      <div className="max-h-56 overflow-y-auto py-1">
        {shown.map((s) => (
          <button
            key={s.skill_id}
            type="button"
            onClick={() => onChoose(s.skill_id)}
            className={cn(
              'flex w-full items-center gap-2 px-2.5 py-1 text-left text-sm hover:bg-muted/60',
              complete && !inProgress(s.level) && 'text-muted-foreground',
              (s.skill_id === value || s.skill_id === first) && 'bg-muted/60',
            )}
          >
            <span className="w-3.5 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums">
              {s.rank}
            </span>
            <span className="min-w-0 flex-1 truncate">{s.name}</span>
            <SkillLevelGauge level={s.level} colors={colors} />
          </button>
        ))}
        {shown.length === 0 && (
          <p className="px-2.5 py-1 text-xs text-muted-foreground">
            Aucun savoir en cours.
          </p>
        )}
      </div>
      {sequence.length > 0 && (
        <button
          type="button"
          onClick={() => setComplete((c) => !c)}
          className="flex w-full border-t border-border px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
        >
          {complete
            ? 'Seulement ceux en cours'
            : `Voir la séquence complète · ${sequence.length}`}
        </button>
      )}
    </>
  )
}

function DomainTab({
  skills,
  domainLabel,
  value,
  colors,
  allowed,
  onChoose,
}: {
  skills: Skill[]
  domainLabel: { emoji: string; name: string }
  value: string | null
  colors: Colors
  allowed: (skillId: string) => boolean
  onChoose: (skillId: string) => void
}) {
  const [query, setQuery] = useState('')
  const paths = useMemo(() => skillPaths(skills), [skills])
  const tree = useMemo(() => buildSkillTree(skills), [skills])
  const pinned = skills.filter((s) => inProgress(s.level) && allowed(s.id))

  // Déplié par défaut : le chemin des savoirs en cours et du savoir choisi.
  const [open, setOpen] = useState<Set<string>>(() => {
    const byId = new Map(skills.map((s) => [s.id, s]))
    const out = new Set<string>()
    for (const s of [...pinned, ...(value ? [byId.get(value)] : [])]) {
      let p = s?.parent_skill_id ? byId.get(s.parent_skill_id) : undefined
      while (p && !out.has(p.id)) {
        out.add(p.id)
        p = p.parent_skill_id ? byId.get(p.parent_skill_id) : undefined
      }
    }
    return out
  })

  const q = query.trim().toLowerCase()
  const found = q
    ? skills.filter(
        (s) =>
          allowed(s.id) &&
          (s.name.toLowerCase().includes(q) ||
            (paths.get(s.id) ?? '').toLowerCase().includes(q)),
      )
    : []

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Une branche se plie au clic (elle se choisit par sa coche) ; une feuille
  // se choisit.
  function pick(id: string, branch: boolean) {
    if (branch) toggle(id)
    else if (allowed(id)) onChoose(id)
  }

  function rows(nodes: SkillNode[], depth: number): React.ReactNode[] {
    return nodes.flatMap((n) => {
      const branch = n.children.length > 0
      const unfolded = open.has(n.id)
      return [
        <div
          key={n.id}
          role="button"
          tabIndex={0}
          onClick={() => pick(n.id, branch)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') pick(n.id, branch)
          }}
          style={{ paddingLeft: 10 + 16 * depth }}
          className={cn(
            'group/row flex cursor-pointer items-center gap-2 py-1 pr-2.5 text-sm hover:bg-muted/60',
            n.id === value && 'bg-muted/60',
            !branch && !allowed(n.id) && 'cursor-default text-muted-foreground',
          )}
        >
          {branch && (
            <ChevronDown
              className={cn(
                'size-3 shrink-0 text-muted-foreground transition-transform',
                !unfolded && '-rotate-90',
              )}
            />
          )}
          <span className="min-w-0 flex-1 truncate">{n.name}</span>
          {branch && allowed(n.id) && (
            <button
              type="button"
              aria-label={`Travailler ${n.name}`}
              onClick={(e) => {
                e.stopPropagation()
                onChoose(n.id)
              }}
              className={cn(
                'grid shrink-0 text-muted-foreground hover:text-foreground',
                n.id !== value && 'invisible group-hover/row:visible',
              )}
            >
              <Check className="size-3.5" />
            </button>
          )}
          {!branch && n.id === value && <Check className="size-3.5 shrink-0" />}
        </div>,
        ...(branch && unfolded ? rows(n.children, depth + 1) : []),
      ]
    })
  }

  return (
    <>
      <MenuSearch
        value={query}
        onChange={setQuery}
        placeholder="Rechercher un savoir…"
      />
      <div className="max-h-64 overflow-y-auto pb-1">
        {q ? (
          <>
            {found.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onChoose(s.id)}
                className="flex w-full items-center gap-2 px-2.5 py-1 text-left text-sm hover:bg-muted/60"
              >
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="max-w-[45%] shrink-0 truncate text-[11px] text-muted-foreground">
                  {paths.get(s.id)}
                </span>
              </button>
            ))}
            {found.length === 0 && (
              <p className="px-2.5 py-1 text-xs text-muted-foreground">
                Aucun savoir ne correspond.
              </p>
            )}
          </>
        ) : (
          <>
            {pinned.length > 0 && (
              <>
                <MenuLabel>
                  En cours dans {domainLabel.emoji} {domainLabel.name}
                </MenuLabel>
                {pinned.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onChoose(s.id)}
                    className={cn(
                      'flex w-full items-center gap-2 px-2.5 py-1 text-left text-sm hover:bg-muted/60',
                      s.id === value && 'bg-muted/60',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    <SkillLevelGauge level={s.level} colors={colors} />
                  </button>
                ))}
                <div className="my-1 border-t border-border" />
              </>
            )}
            {rows(tree, 0)}
            {skills.length === 0 && (
              <p className="px-2.5 py-1 text-xs text-muted-foreground">
                Aucun savoir dans ce domaine.
              </p>
            )}
          </>
        )}
      </div>
    </>
  )
}
