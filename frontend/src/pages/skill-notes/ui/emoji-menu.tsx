import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import {
  Carrot,
  CircleCheck,
  Flag,
  Leaf,
  Lightbulb,
  type LucideIcon,
  Plane,
  Smile,
  Volleyball,
} from 'lucide-react'
import {
  type RefObject,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

import { cn } from '@/shared/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui'

import {
  closeEmoji,
  EMOJI_CATEGORIES,
  type Emoji,
  type EmojiCategory,
  type EmojiQuery,
  emojiAt,
  emojiKey,
  emojiPlugin,
  emojiResults,
  emojisLoaded,
  loadEmojis,
  subscribeEmojis,
} from '../lib/emoji'
import { useMenuKeys } from '../model/use-menu-keys'
import { MenuShell } from './trigger-menu'

/** Relevé de Notion : 408 px, 12 cases de 32 px par ligne, emoji en 24 px. */
const WIDTH = 408
const COLUMNS = 12
/** Au-delà, le menu complet : sections, défilement, barre des catégories. */
const COMPACT_MAX = 8 * COLUMNS
/** Le menu complet : sa liste, puis sa barre (51 px). */
const LIST_HEIGHT = 305
const FULL_HEIGHT = 356
/** À droite du « : », juste sous la ligne. */
const OFFSET = { x: 6, y: 4 }

const ICONS: Record<EmojiCategory, LucideIcon> = {
  people: Smile,
  nature: Leaf,
  food: Carrot,
  activities: Volleyball,
  travel: Plane,
  objects: Lightbulb,
  symbols: CircleCheck,
  flags: Flag,
}

interface Section {
  category: (typeof EMOJI_CATEGORIES)[number] | null
  rows: Emoji[][]
}

const chunk = (items: Emoji[]) =>
  Array.from({ length: Math.ceil(items.length / COLUMNS) }, (_, i) =>
    items.slice(i * COLUMNS, (i + 1) * COLUMNS),
  )

/**
 * Le menu des emojis, ouvert par « : » et deux caractères — la grille de
 * Notion, relevée sur son éditeur (règle d'ouverture et filtre : `lib/emoji`).
 *
 * Peu de résultats (huit lignes au plus) : le menu **compact**, une grille
 * dans l'ordre de pertinence, à la hauteur de son contenu. Au-delà : le menu
 * **complet**, les résultats groupés par catégorie sous leur en-tête, une
 * liste qui défile et la barre des catégories en pied (un clic y mène, la
 * catégorie lue s'y allume). La case active — la première d'abord — porte un
 * anneau à l'encre des notes et son nom en infobulle. ↑ ↓ ← → (en grille),
 * Entrée remplace « :requête » par l'emoji, Échap et Tab ferment (le texte
 * tapé reste). Rien ne répond : rien ne s'affiche.
 */
export function EmojiMenu({
  editor,
  area,
}: {
  editor: Editor
  area: RefObject<HTMLElement | null>
}) {
  // Le plugin qui suit le « : » ouvert vit avec le menu.
  useEffect(() => {
    editor.registerPlugin(emojiPlugin())
    return () => {
      if (!editor.isDestroyed) editor.unregisterPlugin(emojiKey)
    }
  }, [editor])

  const query = useEditorState({
    editor,
    selector: ({ editor: e }) => (e && e.isFocused ? emojiAt(e.state) : null),
    equalityFn: (a, b) =>
      a === b ||
      (!!a && !!b && a.from === b.from && a.to === b.to && a.query === b.query),
  })

  // Les données se chargent au premier « : ».
  const loaded = useSyncExternalStore(subscribeEmojis, emojisLoaded)
  useEffect(() => {
    if (query) void loadEmojis()
  }, [query])

  const results = query && loaded ? emojiResults(query.query) : []
  const full = results.length > COMPACT_MAX
  const sections: Section[] = full
    ? EMOJI_CATEGORIES.map((category) => ({
        category,
        rows: chunk(results.filter((e) => e.category === category.id)),
      })).filter((s) => s.rows.length > 0)
    : [{ category: null, rows: chunk(results) }]
  // L'ordre affiché, et où commence chaque ligne.
  const rows = sections.flatMap((s) => s.rows)
  const shown = rows.flat()
  const startOf = rows.map((_, r) =>
    rows.slice(0, r).reduce((n, row) => n + row.length, 0),
  )

  const [active, setActive] = useState(0)
  const byKeys = useRef(false)
  // Un autre « : », une autre requête : on repart de la première.
  useEffect(() => setActive(0), [query?.from, query?.query])
  const current = Math.min(active, Math.max(shown.length - 1, 0))

  const close = () => editor.view.dispatch(closeEmoji(editor.state.tr))

  function pick(emoji: Emoji, at: EmojiQuery) {
    editor.view.dispatch(
      editor.state.tr.insertText(emoji.emoji, at.from, at.to),
    )
    editor.view.focus()
  }

  /** La case de la ligne voisine, à la même colonne (ou la dernière). */
  function vertical(index: number, step: 1 | -1) {
    const row = startOf.findLastIndex((start) => start <= index)
    const col = index - startOf[row]
    const next = (row + step + rows.length) % rows.length
    return startOf[next] + Math.min(col, rows[next].length - 1)
  }

  useMenuKeys(area, (e) => {
    if (!query || shown.length === 0 || e.isComposing) return
    const take = () => {
      e.preventDefault()
      e.stopPropagation()
    }
    const n = shown.length
    const move = (to: number) => {
      take()
      byKeys.current = true
      setActive(to)
    }
    if (e.key === 'ArrowRight') move((current + 1) % n)
    else if (e.key === 'ArrowLeft') move((current - 1 + n) % n)
    else if (e.key === 'ArrowDown') move(vertical(current, 1))
    else if (e.key === 'ArrowUp') move(vertical(current, -1))
    else if (e.key === 'Enter') {
      take()
      pick(shown[current], query)
    } else if (e.key === 'Escape') {
      take()
      close()
    } else if (e.key === 'Tab') {
      close()
    }
  })

  // La catégorie lue : celle dont l'en-tête est passé sous le haut de la liste.
  const list = useRef<HTMLDivElement>(null)
  const [reading, setReading] = useState<EmojiCategory | null>(null)
  const readScroll = () => {
    const el = list.current
    if (!el) return
    const heads = [...el.querySelectorAll<HTMLElement>('[data-category]')]
    const top = heads.findLast((h) => h.offsetTop <= el.scrollTop + 1)
    setReading(((top ?? heads[0])?.dataset.category as EmojiCategory) ?? null)
  }
  useEffect(readScroll, [full, query?.query])

  if (!query || shown.length === 0 || !area.current) return null

  const goTo = (category: EmojiCategory) => {
    const el = list.current
    const head = el?.querySelector<HTMLElement>(`[data-category="${category}"]`)
    if (el && head) el.scrollTop = head.offsetTop
  }

  const cell = (emoji: Emoji, index: number) => {
    const on = index === current
    const box = (
      <div
        key={emoji.emoji}
        role="gridcell"
        aria-label={emoji.label}
        aria-selected={on}
        data-active={on ? '' : undefined}
        onMouseDown={(e) => e.preventDefault()}
        // Au mouvement, pas à l'entrée : le défilement au clavier ne doit pas
        // voler la case active.
        onMouseMove={() => !on && setActive(index)}
        onClick={() => pick(emoji, query)}
        className={cn(
          'flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[4px] text-2xl leading-9',
          on &&
            'bg-foreground/[0.055] shadow-[0_0_0_2px_var(--color-popover),0_0_0_4px_var(--note-accent),0_0_0_6px_var(--color-popover)]',
        )}
      >
        {emoji.emoji}
      </div>
    )
    if (!on) return box
    // Le nom de la case active, sous elle (l'infobulle de l'app).
    return (
      <Tooltip key={emoji.emoji} open>
        <TooltipTrigger asChild>{box}</TooltipTrigger>
        {/* Masquée quand la case sort de la liste qui défile. */}
        <TooltipContent side="bottom" hideWhenDetached>
          {emoji.label}
        </TooltipContent>
      </Tooltip>
    )
  }

  const grid = (section: Section) =>
    section.rows.map((row) => (
      <div key={row[0].emoji} role="row" className="flex">
        {row.map((emoji) => cell(emoji, shown.indexOf(emoji)))}
      </div>
    ))

  return (
    <MenuShell
      key={query.from}
      editor={editor}
      area={area.current}
      from={query.from}
      width={WIDTH}
      fullHeight={full ? FULL_HEIGHT : rows.length * 32 + 8}
      active={current}
      byKeys={byKeys}
      offset={OFFSET}
    >
      {full ? (
        <>
          <div
            ref={list}
            role="grid"
            aria-label="Emojis"
            onScroll={readScroll}
            className="relative overflow-x-hidden overflow-y-auto pb-1.5"
            style={{ maxHeight: LIST_HEIGHT }}
          >
            {sections.map((section) => (
              <div key={section.category!.id} className="pt-1.5">
                <div
                  data-category={section.category!.id}
                  className="px-2 pt-1.5 pb-2 text-xs leading-[14px] font-medium text-muted-foreground"
                >
                  {section.category!.label}
                </div>
                <div className="px-3">{grid(section)}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-[3px] border-t px-3 pt-2 pb-2.5">
            {EMOJI_CATEGORIES.map(({ id, label }) => {
              const Icon = ICONS[id]
              const present = sections.some((s) => s.category?.id === id)
              return (
                <button
                  key={id}
                  type="button"
                  aria-label={`Aller à la catégorie : ${label}`}
                  disabled={!present}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => goTo(id)}
                  className={cn(
                    'grid size-8 place-items-center rounded-md text-muted-foreground transition-[background-color] duration-[20ms] hover:bg-foreground/[0.055] disabled:opacity-40 disabled:hover:bg-transparent',
                    reading === id && 'bg-foreground/[0.055]',
                  )}
                >
                  <Icon aria-hidden className="size-[18px]" strokeWidth={1.5} />
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <div role="grid" aria-label="Emojis" className="pt-1 pr-2 pb-1 pl-4">
          {grid(sections[0])}
        </div>
      )}
    </MenuShell>
  )
}
