import { LayoutGrid, Search } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { type Domain, domainColor, domainColorValues } from '@/entities/domain'
import type { OverviewSkill } from '@/entities/learning'
import { type Skill, SkillLevelGauge } from '@/entities/skill'
import { cn } from '@/shared/lib/utils'
import { Input } from '@/shared/ui'

/**
 * La colonne de gauche (#152) : la recherche, « Vue d'ensemble » et sa
 * pastille rouge, les savoirs en cours, puis les prochains — ceux de la carte
 * « Commencer » (26/10). Une ligne n'y dit que le domaine, le nom et la jauge :
 * la date et l'interro due se lisent sur la vue d'ensemble.
 *
 * La recherche porte sur **tous** les savoirs : un savoir pas commencé s'y
 * trouve aussi, et s'ouvre à droite comme les autres (c'est ce qui remplace
 * l'ancienne section « Démarrer un savoir »).
 */
export function HubSidebar({
  current,
  upcoming,
  skills,
  paths,
  domains,
  urgent,
  selected,
  onSelect,
}: {
  current: OverviewSkill[]
  /** Les prochains savoirs (carte « Commencer »), dans son ordre. */
  upcoming: string[]
  skills: Skill[]
  paths: Map<string, string>
  domains: Domain[]
  urgent: number
  /** Le savoir ouvert à droite ; `null` : la vue d'ensemble. */
  selected: string | null
  onSelect: (skillId: string | null) => void
}) {
  const [query, setQuery] = useState('')
  const byId = new Map(skills.map((s) => [s.id, s]))
  const domainOf = (s: Skill) => domains.find((d) => d.id === s.domain_id)

  // La prochaine séance d'abord ; sans rien de prévu, la plus récente faite.
  const ordered = [...current].sort((a, b) => {
    if (Boolean(a.next_at) !== Boolean(b.next_at)) return a.next_at ? -1 : 1
    if (a.next_at && b.next_at) return a.next_at.localeCompare(b.next_at)
    return (b.last_done_at ?? '').localeCompare(a.last_done_at ?? '')
  })

  const q = query.trim().toLowerCase()
  const found = q
    ? skills
        .filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            (paths.get(s.id) ?? '').toLowerCase().includes(q),
        )
        .slice(0, 12)
    : []

  function pick(skillId: string | null) {
    setQuery('')
    onSelect(skillId)
  }

  return (
    <nav className="flex flex-col gap-1 px-3 py-4 md:sticky md:top-0 md:max-h-svh md:overflow-y-auto">
      <div className="relative mx-1 mb-2.5">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-[15px] -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Chercher un savoir…"
          className="h-[34px] pl-8"
        />
      </div>

      {q ? (
        found.length === 0 ? (
          <p className="px-2 py-1 text-sm text-muted-foreground">
            Aucun savoir ne correspond.
          </p>
        ) : (
          found.map((s) => (
            <Row
              key={s.id}
              active={false}
              onClick={() => pick(s.id)}
              tile={<Tile domain={domainOf(s)} />}
            >
              <span className="truncate text-[13.5px] font-medium">
                {s.name}
              </span>
              <span className="truncate text-[11.5px] text-muted-foreground">
                {paths.get(s.id) || domainOf(s)?.name}
              </span>
            </Row>
          ))
        )
      ) : (
        <>
          <Row
            active={selected === null}
            onClick={() => pick(null)}
            tile={
              <span className="grid size-[30px] shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                <LayoutGrid className="size-[15px]" />
              </span>
            }
            trailing={
              urgent > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white">
                  {urgent}
                </span>
              )
            }
          >
            <span className="text-[13.5px] font-semibold">Le hub</span>
          </Row>

          <Section
            title="En cours"
            skills={ordered.map((c) => byId.get(c.skill_id))}
            domainOf={domainOf}
            selected={selected}
            onPick={pick}
          />
          <Section
            title="Prochains"
            skills={upcoming.map((id) => byId.get(id))}
            domainOf={domainOf}
            selected={selected}
            onPick={pick}
          />
        </>
      )}
    </nav>
  )
}

/** Une section de savoirs : le domaine, le nom, la jauge. */
function Section({
  title,
  skills,
  domainOf,
  selected,
  onPick,
}: {
  title: string
  skills: (Skill | undefined)[]
  domainOf: (s: Skill) => Domain | undefined
  selected: string | null
  onPick: (skillId: string) => void
}) {
  const shown = skills.filter((s): s is Skill => s !== undefined)
  if (shown.length === 0) return null
  return (
    <>
      <span className="px-2 pt-3 pb-1 text-[11px] font-semibold tracking-[.06em] text-muted-foreground uppercase">
        {title}
      </span>
      {shown.map((s) => (
        <Row
          key={s.id}
          active={selected === s.id}
          onClick={() => onPick(s.id)}
          tile={<Tile domain={domainOf(s)} />}
        >
          <span className="truncate text-[13.5px] font-medium">{s.name}</span>
          <SkillLevelGauge
            level={s.level}
            colors={domainColorValues(domainOf(s)?.color)}
            className="w-[54px]"
          />
        </Row>
      ))}
    </>
  )
}

function Tile({ domain }: { domain: Domain | undefined }) {
  return (
    <span
      className={cn(
        'grid size-[30px] shrink-0 place-items-center rounded-lg text-[15px]',
        domainColor(domain?.color).soft,
      )}
    >
      {domain?.emoji}
    </span>
  )
}

function Row({
  active,
  onClick,
  tile,
  trailing,
  children,
}: {
  active: boolean
  onClick: () => void
  tile: ReactNode
  trailing?: ReactNode
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active || undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-lg p-2 text-left hover:bg-muted',
        active && 'bg-muted',
      )}
    >
      {tile}
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">{children}</span>
      {trailing}
    </button>
  )
}
