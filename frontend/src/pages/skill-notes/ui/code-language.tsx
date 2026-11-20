import type { Editor } from '@tiptap/core'
import { Check, ChevronDown } from 'lucide-react'
import { type RefObject, useEffect, useRef, useState } from 'react'

import { cn } from '@/shared/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui'

import {
  CODE_LANGUAGES,
  knownLanguage,
  languageLabel,
  PLAIN_TEXT,
} from '../lib/code-languages'

/** Les choix du menu, dans l'ordre alphabétique (Notion) ; `null` : texte brut. */
const CHOICES = [
  ...CODE_LANGUAGES.map((l) => ({ id: l.id as string | null, label: l.label })),
  { id: null, label: PLAIN_TEXT },
].sort((a, b) => a.label.localeCompare(b.label, 'fr'))

/** Le bloc de code survolé, en coordonnées de `area`. */
interface Hovered {
  pos: number
  top: number
  right: number
}

const norm = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * Le langage d'un bloc de code (relevé de Notion) : au survol du bloc, une
 * barre en haut à droite, dedans (12 px du haut et du bord), avec le langage
 * courant et ⌄. Un clic ouvre le menu des langages, aligné à gauche du
 * bouton : un champ « Rechercher un langage… » qui filtre, puis la liste par
 * ordre alphabétique, le courant coché. Flèches, Entrée et clic choisissent ;
 * Échap ferme sans changer. La barre reste tant que le menu est ouvert.
 *
 * `area` : l'élément qui contient l'éditeur, repère des positions.
 */
export function CodeLanguage({
  editor,
  area,
}: {
  editor: Editor
  area: RefObject<HTMLElement | null>
}) {
  const [hovered, setHovered] = useState<Hovered | null>(null)
  const [open, setOpen] = useState(false)
  const bar = useRef<HTMLDivElement>(null)
  // Un langage choisi rend le focus au code ; Échap, au bouton (Notion).
  const chosen = useRef(false)

  useEffect(() => {
    const root = area.current
    if (!root) return
    const move = (e: MouseEvent) => {
      if (open) return
      if (!editor.isEditable) {
        setHovered(null)
        return
      }
      const target = e.target as Element | null
      if (target && bar.current?.contains(target)) return
      const pre = target?.closest('pre')
      if (!pre || !editor.view.dom.contains(pre)) {
        setHovered(null)
        return
      }
      const at = root.getBoundingClientRect()
      const box = pre.getBoundingClientRect()
      const pos = editor.view.posAtDOM(pre, 0) - 1
      const next = {
        pos,
        top: box.top - at.top + 12,
        right: at.right - box.right + 12,
      }
      setHovered((h) =>
        h && h.pos === next.pos && h.top === next.top && h.right === next.right
          ? h
          : next,
      )
    }
    const leave = () => {
      if (!open) setHovered(null)
    }
    root.addEventListener('mousemove', move)
    root.addEventListener('mouseleave', leave)
    return () => {
      root.removeEventListener('mousemove', move)
      root.removeEventListener('mouseleave', leave)
    }
  }, [area, editor, open])

  const node = hovered ? editor.state.doc.nodeAt(hovered.pos) : null
  if (!hovered || node?.type.name !== 'codeBlock' || !editor.isEditable)
    return null
  const language = (node.attrs.language as string | null) ?? null
  const current = knownLanguage(language)?.id ?? language

  const choose = (id: string | null) => {
    const { pos } = hovered
    editor
      .chain()
      .command(({ tr }) => {
        const at = tr.doc.nodeAt(pos)
        if (at?.type.name !== 'codeBlock') return false
        tr.setNodeMarkup(pos, undefined, { ...at.attrs, language: id })
        return true
      })
      // Le curseur à la fin du code, comme après une saisie.
      .setTextSelection(pos + node.nodeSize - 1)
      .focus()
      .run()
    chosen.current = true
    setOpen(false)
  }

  return (
    <div
      ref={bar}
      className="absolute z-20 flex h-7 items-center rounded-[6px] bg-popover p-0.5 shadow-[0_0_0_1px_var(--border),0_4px_12px_-2px_oklch(0.21_0.008_285/0.08)]"
      style={{ top: hovered.top, right: hovered.right }}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex h-6 items-center gap-1 rounded-[4px] px-1.5 text-sm text-muted-foreground hover:bg-muted',
              open && 'bg-muted',
            )}
          >
            {languageLabel(language)}
            <ChevronDown className="size-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={1}
          onCloseAutoFocus={(e) => {
            if (!chosen.current) return
            chosen.current = false
            e.preventDefault()
          }}
          className="notes-palette w-60 rounded-[10px] p-0 shadow-[0_14px_28px_-6px_oklch(0.21_0.008_285/0.2),0_2px_4px_-1px_oklch(0.21_0.008_285/0.12)]"
        >
          <LanguageMenu current={current} onChoose={choose} />
        </PopoverContent>
      </Popover>
    </div>
  )
}

function LanguageMenu({
  current,
  onChoose,
}: {
  current: string | null
  onChoose: (id: string | null) => void
}) {
  const [query, setQuery] = useState('')
  // À l'ouverture, le langage courant est actif ; une recherche, la 1re ligne.
  const [active, setActive] = useState(() =>
    Math.max(
      0,
      CHOICES.findIndex((c) => c.id === current),
    ),
  )
  const shown = CHOICES.filter((c) => norm(c.label).includes(norm(query)))
  const list = useRef<HTMLDivElement>(null)

  // La ligne active reste en vue (ouverture, flèches).
  useEffect(() => {
    list.current
      ?.querySelector('[data-active]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [active, query])

  return (
    <div className="flex max-h-[512px] flex-col">
      <div className="px-1 pt-1 pb-1">
        <input
          autoFocus
          value={query}
          placeholder="Rechercher un langage…"
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              const step = e.key === 'ArrowDown' ? 1 : -1
              setActive((i) => (i + step + shown.length) % shown.length)
            }
            if (e.key === 'Enter' && shown[active]) {
              e.preventDefault()
              onChoose(shown[active].id)
            }
          }}
          aria-label="Rechercher un langage"
          className="h-7 w-full rounded-md bg-foreground/[3%] px-2 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div
        ref={list}
        role="listbox"
        aria-label="Langage"
        className="flex flex-col gap-px overflow-y-auto pb-1"
      >
        {shown.map((c, i) => (
          <button
            key={c.label}
            type="button"
            role="option"
            aria-selected={c.id === current}
            data-active={i === active ? '' : undefined}
            tabIndex={-1}
            // Le focus reste dans le champ de recherche.
            onMouseDown={(e) => e.preventDefault()}
            // Au mouvement, pas à l'entrée : le défilement au clavier ne doit
            // pas voler la surbrillance.
            onMouseMove={() => i !== active && setActive(i)}
            onClick={() => onChoose(c.id)}
            className={cn(
              'mx-1 flex h-7 shrink-0 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors duration-[20ms] ease-in',
              i === active && 'bg-foreground/[5.5%]',
            )}
          >
            <span className="min-w-0 flex-1 truncate">{c.label}</span>
            {c.id === current && (
              <Check aria-hidden className="size-4 shrink-0" />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
