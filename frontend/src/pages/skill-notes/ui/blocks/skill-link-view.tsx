import { type NodeViewProps, NodeViewWrapper } from '@tiptap/react'
import { File } from 'lucide-react'
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { useDomains } from '@/entities/domain'
import {
  type Skill,
  skillPaths,
  useAllSkills,
  useSkill,
  useSkills,
} from '@/entities/skill'
import { isNotFound } from '@/shared/api'
import { cn } from '@/shared/lib/utils'

import { SKILL_LINK_SESSION } from '../../lib/skill-link-node'
import { fold } from '../../lib/slash'
import { MentionToken } from './mention-token'

/**
 * Un lien vers un autre savoir (cf. `lib/skill-link-node`), en ligne : la
 * mention de page de Notion (`MentionToken`) — l'icône de page grise et le
 * nom courant du savoir.
 * Un clic mène à la page du savoir. Sans savoir encore : le sélecteur.
 */
export function SkillLinkView({
  editor,
  node,
  getPos,
  selected,
  updateAttributes,
  deleteNode,
}: NodeViewProps) {
  const id = node.attrs.id as string | null
  const [open, setOpen] = useState(
    () => !id && node.attrs.fresh === SKILL_LINK_SESSION,
  )
  const { data: skill, error } = useSkill(id ?? undefined)
  const navigate = useNavigate()

  /**
   * Le curseur juste après le lien, dans l'éditeur — une fois le sélecteur
   * démonté : son champ, retiré, emporterait sinon le focus.
   */
  const after = () =>
    requestAnimationFrame(() => {
      const pos = getPos()
      if (typeof pos === 'number' && !editor.isDestroyed)
        editor
          .chain()
          .focus()
          .setTextSelection(pos + node.nodeSize)
          .run()
    })

  const pick = (chosen: Skill) => {
    setOpen(false)
    updateAttributes({ id: chosen.id, fresh: null })
    after()
  }

  const dismiss = () => {
    setOpen(false)
    if (id) {
      after()
      return
    }
    // Rien de choisi : le lien n'a pas lieu d'être.
    const pos = getPos()
    deleteNode()
    if (typeof pos === 'number')
      requestAnimationFrame(() => {
        if (!editor.isDestroyed)
          editor.chain().focus().setTextSelection(pos).run()
      })
  }

  const gone = Boolean(id) && isNotFound(error)
  const label = !id
    ? 'Choisir un savoir'
    : (skill?.name ?? (gone ? 'Savoir supprimé' : '…'))

  return (
    <NodeViewWrapper
      as="span"
      contentEditable={false}
      className="relative inline"
    >
      <MentionToken
        icon={
          <File
            className="size-[1.1em] text-muted-foreground"
            strokeWidth={1.75}
          />
        }
        label={label}
        href={id ? `/skills/${id}` : undefined}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey) return
          e.preventDefault()
          if (id) navigate(`/skills/${id}`)
          else setOpen(true)
        }}
        muted={!id || gone}
        struck={gone}
        selected={selected}
      />
      {open && <SkillSearch onPick={pick} onDismiss={dismiss} />}
    </NodeViewWrapper>
  )
}

/**
 * Le sélecteur : recherche par nom (sans casse ni accents), les savoirs du
 * domaine d'abord, puis ceux des autres domaines. Flèches, Entrée, Échap ;
 * un clic ailleurs le ferme.
 */
function SkillSearch({
  onPick,
  onDismiss,
}: {
  onPick: (skill: Skill) => void
  onDismiss: () => void
}) {
  const { skillId } = useParams<{ skillId: string }>()
  const { data: here } = useSkill(skillId)
  const { data: domainSkills } = useSkills(here?.domain_id)
  const { data: allSkills } = useAllSkills()
  const { data: domains } = useDomains()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const box = useRef<HTMLSpanElement>(null)

  const options = useMemo(() => {
    const paths = skillPaths(allSkills ?? domainSkills ?? [])
    const domainName = new Map(
      (domains ?? []).map((d) => [
        d.id,
        [d.emoji, d.name].filter(Boolean).join(' '),
      ]),
    )
    const q = fold(query)
    const matches = (s: Skill) => s.id !== skillId && fold(s.name).includes(q)
    const near = (domainSkills ?? []).filter(matches)
    const nearIds = new Set(near.map((s) => s.id))
    const far = (allSkills ?? []).filter(
      (s) => matches(s) && !nearIds.has(s.id),
    )
    return [
      ...near.map((skill) => ({ skill, hint: paths.get(skill.id) ?? '' })),
      ...far.map((skill) => ({
        skill,
        hint: domainName.get(skill.domain_id) ?? '',
      })),
    ].slice(0, 50)
  }, [allSkills, domainSkills, domains, query, skillId])

  useEffect(() => setActive(0), [query])

  // Un clic hors du sélecteur le ferme.
  const dismiss = useRef(onDismiss)
  dismiss.current = onDismiss
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (e.target instanceof Node && box.current?.contains(e.target)) return
      dismiss.current()
    }
    document.addEventListener('mousedown', down, true)
    return () => document.removeEventListener('mousedown', down, true)
  }, [])

  const keys = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' && options.length) {
      e.preventDefault()
      setActive((a) => (a + 1) % options.length)
    } else if (e.key === 'ArrowUp' && options.length) {
      e.preventDefault()
      setActive((a) => (a - 1 + options.length) % options.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const chosen = options[Math.min(active, options.length - 1)]
      if (chosen) onPick(chosen.skill)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onDismiss()
    }
  }

  return (
    <span
      ref={box}
      className="absolute top-full left-0 z-30 mt-1.5 flex w-[340px] flex-col rounded-[10px] border bg-popover p-[5px] text-[13px] leading-normal font-normal text-popover-foreground shadow-[0_8px_24px_-6px_oklch(0.21_0.008_285/0.18)]"
    >
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={keys}
        placeholder="Lier un savoir…"
        aria-label="Rechercher un savoir"
        className="mb-1 h-8 rounded-[7px] border bg-transparent px-2 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:border-ring"
      />
      <span role="listbox" className="flex max-h-60 flex-col overflow-y-auto">
        {options.length === 0 && (
          <span className="px-2 py-1.5 text-xs text-muted-foreground">
            Aucun savoir ne correspond.
          </span>
        )}
        {options.map(({ skill, hint }, index) => (
          <button
            key={skill.id}
            type="button"
            role="option"
            aria-selected={index === active}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setActive(index)}
            onClick={() => onPick(skill)}
            className={cn(
              'flex items-center gap-2 rounded-[7px] px-2 py-[5px] text-left',
              index === active && 'bg-muted',
            )}
          >
            <span aria-hidden>📄</span>
            <span className="min-w-0 flex-1 truncate font-medium">
              {skill.name}
            </span>
            {hint && (
              <span className="max-w-[40%] shrink-0 truncate text-xs text-muted-foreground">
                {hint}
              </span>
            )}
          </button>
        ))}
      </span>
    </span>
  )
}
