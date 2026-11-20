import { Play } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { type DomainColorClasses } from '@/entities/domain'
import { useStartSkill } from '@/entities/plan'
import { ApiError } from '@/shared/api'
import { cn } from '@/shared/lib/utils'
import { toast } from '@/shared/ui'

/** Un savoir visé, tel que la carte le lit. */
export interface StartSkill {
  skill_id: string
  name: string
  position: number | null
}

/**
 * Rien de commencé (#61) :
 * une carte pleine à l'encre du domaine, qui dit par quoi commencer et le fait.
 * Le premier savoir de la séquence en grand, « Démarrer » dessous ; sans
 * séquence, « Par où commencer ? » et trois savoirs à choisir (par nom, l'ordre
 * du projet — sans séquence, on n'invente pas de priorité), puis « + n ».
 *
 * Commencer ouvre **le cycle de ce projet** (`POST /skills/{id}/plans/start`
 * avec le projet) : son brouillon s'ouvre, ou un cycle naît ouvert, rattaché
 * à lui — puis mène à la page du savoir, sur ce cycle. Aucun compte de
 * savoirs : la liste est rarement complète au départ.
 */
export function StartCard({
  projectId,
  skills,
  color,
  domainEmoji,
}: {
  projectId: string
  /** Les savoirs visés, séquence d'abord puis hors séquence par nom. */
  skills: StartSkill[]
  color: DomainColorClasses
  domainEmoji?: string | null
}) {
  const startSkill = useStartSkill()
  const navigate = useNavigate()
  // Survol d'un choix : blanc plein, texte à l'encre. Par l'état, pas par
  // `hover:` — une classe de domaine ne se compose pas.
  const [hovered, setHovered] = useState<string | null>(null)
  const first = skills.find((s) => s.position !== null)
  const choices = skills.slice(0, 3)
  const rest = skills.length - choices.length

  async function start(skill: StartSkill) {
    try {
      const plan = await startSkill.mutateAsync({
        skillId: skill.skill_id,
        projectId,
      })
      toast.success(`${skill.name} — cycle ouvert`)
      // Commencer mène au savoir, sur le cycle qu'on vient d'ouvrir : c'est
      // là que l'étude commence.
      navigate(`/skills/${skill.skill_id}?cycle=${plan.id}`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Échec du démarrage')
    }
  }

  return (
    <section
      className={cn(
        'relative shrink-0 overflow-hidden rounded-xl px-4 pt-[18px] pb-4 text-white',
        color.ink,
      )}
    >
      {domainEmoji && (
        <span
          aria-hidden
          className="pointer-events-none absolute -top-3 -right-3 text-[112px] leading-none opacity-16 select-none"
          style={{ transform: 'rotate(-8deg)' }}
        >
          {domainEmoji}
        </span>
      )}
      <span className="relative text-[11px] font-semibold tracking-[.06em] uppercase opacity-80">
        Apprentissage
      </span>

      {first ? (
        <>
          <h3 className="relative mt-1.5 mb-4 font-heading text-[26px] leading-tight font-bold text-balance">
            {first.name}
          </h3>
          <button
            type="button"
            disabled={startSkill.isPending}
            onClick={() => void start(first)}
            className={cn(
              'relative inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-white px-3.5 text-sm font-semibold disabled:opacity-70',
              color.text,
            )}
          >
            <Play className="size-3.5 fill-current" />
            Démarrer
          </button>
        </>
      ) : (
        <>
          <h3 className="relative mt-1.5 mb-3.5 font-heading text-[22px] leading-tight font-bold text-balance">
            Par où commencer ?
          </h3>
          <div className="relative flex flex-wrap items-center gap-1.5">
            {choices.map((s) => (
              <button
                key={s.skill_id}
                type="button"
                disabled={startSkill.isPending}
                onClick={() => void start(s)}
                onMouseEnter={() => setHovered(s.skill_id)}
                onMouseLeave={() => setHovered(null)}
                className={cn(
                  'h-8 max-w-full cursor-pointer truncate rounded-lg px-3 text-[13px] font-medium transition-colors disabled:opacity-70',
                  hovered === s.skill_id
                    ? cn('bg-white', color.text)
                    : 'bg-white/15',
                )}
              >
                {s.name}
              </button>
            ))}
            {rest > 0 && (
              <span className="text-[13px] font-semibold opacity-80 tabular-nums">
                + {rest}
              </span>
            )}
          </div>
        </>
      )}
    </section>
  )
}
