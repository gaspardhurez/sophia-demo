import type { Skill } from '../model/types'

const PHASES = ['Étude', 'Pratique', 'Mise en situation', 'Rétention'] as const

/**
 * Un savoir **En cours** en pastille (design #51, reprise à l'accueil #52) :
 * l'emoji du domaine s'il est donné, le nom, la phase (d'après `level`), la
 * jauge à quatre crans — faits à l'encre, le cran courant adouci. Un clic
 * ouvre le savoir ; c'est l'appelant qui dit où.
 *
 * Les teintes arrivent en valeurs CSS (`domainColorValues`) : une entité ne
 * connaît pas le domaine.
 */
export function SkillPill({
  skill,
  emoji,
  colors,
  onClick,
}: {
  skill: Skill
  /** L'emoji du domaine, en tête — l'accueil mêle les domaines. */
  emoji?: string | null
  colors: { ink: string; base: string }
  onClick: () => void
}) {
  const level = Math.max(1, Math.min(skill.level, 4))
  const soft = `color-mix(in oklab, ${colors.base} 45%, transparent)`
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-7 items-center gap-2 rounded-full border bg-card px-2.5 text-xs transition-colors hover:border-ring"
    >
      {emoji && <span aria-hidden>{emoji}</span>}
      <span className="font-semibold">{skill.name}</span>
      <span className="text-muted-foreground">{PHASES[level - 1]}</span>
      <span aria-hidden className="flex gap-0.5">
        {[1, 2, 3, 4].map((k) => (
          <span
            key={k}
            className={
              k > level
                ? 'h-1 w-1.5 rounded-[2px] bg-muted'
                : 'h-1 w-1.5 rounded-[2px]'
            }
            style={
              k < level
                ? { background: colors.ink }
                : k === level
                  ? { background: soft }
                  : undefined
            }
          />
        ))}
      </span>
    </button>
  )
}
