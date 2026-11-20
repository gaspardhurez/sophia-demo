import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import {
  Fragment,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react'

import { TextSelection } from '@tiptap/pm/state'

import { cn } from '@/shared/lib/utils'

import {
  BLOCK_SECTIONS,
  BODY_CONTAINERS,
  type BlockItem,
  PARAGRAPH,
  SECTION_LABELS,
  specOfItem,
} from '../lib/blocks'
import { clearBlocks } from '../lib/block-transform'
import { flowOf, unitAround } from '../lib/block-unit'
import {
  closeSlash,
  type SlashQuery,
  slashAt,
  slashKey,
  slashPlugin,
  slashResults,
} from '../lib/slash'
import { QUESTION } from '../lib/question-node'
import { unwrapItems } from '../lib/unit-edit'
import { useMenuKeys } from '../model/use-menu-keys'
import { MenuRow, MenuShell } from './trigger-menu'

/** Largeur du menu, hauteur de sa liste (le pied en plus) — relevé §3. */
const WIDTH = 360
const LIST_HEIGHT = 336
/** Sa hauteur pleine, pied compris : en dessous s'il y a la place. */
const FULL_HEIGHT = 380

/**
 * Le menu des blocs, ouvert par « / » (relevé Notion §3 ; règle d'ouverture
 * et filtre : `lib/slash`). Sous la ligne du « / » — au-dessus s'il n'y a pas
 * la place —, la section **Apprentissage** en tête, puis les autres sections
 * du registre ; filtré, une seule section « Résultats ». Le pied « Fermer le
 * menu » reste seul quand rien ne répond. ↓ ↑ (le pied compris, en boucle),
 * Entrée insère, Échap et Tab ferment (le texte tapé reste ; Tab garde son
 * effet). Le « + » de la poignée tape le même « / ».
 *
 * Une entrée qui transforme change le bloc du « / ». Une entrée qui insère
 * un bloc à part (la question) prend la place d'un paragraphe vide ; sur un
 * bloc qui a du texte, elle se pose dessous. Une entrée « En ligne »
 * (l'équation en ligne) se pose au « / », dans le texte.
 *
 * `questions` : le document en crée (« / Question », l'encadré dans le
 * texte). Faux : les notes d'une ressource (#173) — le menu n'en propose pas.
 */
export function SlashMenu({
  editor,
  area,
  questions = false,
}: {
  editor: Editor
  area: RefObject<HTMLElement | null>
  questions?: boolean
}) {
  // Le plugin qui suit le « / » ouvert vit avec le menu.
  useEffect(() => {
    editor.registerPlugin(slashPlugin())
    return () => {
      if (!editor.isDestroyed) editor.unregisterPlugin(slashKey)
    }
  }, [editor])

  const slash = useEditorState({
    editor,
    selector: ({ editor: e }) => (e && e.isFocused ? slashAt(e.state) : null),
    equalityFn: (a, b) =>
      a === b ||
      (!!a && !!b && a.from === b.from && a.to === b.to && a.query === b.query),
  })

  const filtered = !!slash && slash.query.trim() !== ''
  const shown = slash
    ? slashResults(slash.query).filter(
        (item) => questions || specOfItem(item)?.name !== QUESTION,
      )
    : []
  // Le pied est le dernier arrêt des flèches.
  const footer = shown.length
  const [active, setActive] = useState(0)
  const byKeys = useRef(false)

  // Un autre « / », une autre requête : on repart du premier.
  useEffect(() => setActive(0), [slash?.from, slash?.query])

  const close = () => editor.view.dispatch(closeSlash(editor.state.tr))

  function pick(item: BlockItem, at: SlashQuery) {
    const range = { from: at.from, to: at.to }
    if (item.action.kind === 'transform') {
      // Ce qui ne s'applique pas tel quel (un titre dans une liste, une
      // citation dans une liste) s'applique au bloc rendu à du texte simple.
      const { apply } = item.action
      const direct = apply(editor.can().chain().deleteRange(range)).run()
      const chain = editor.chain().focus().deleteRange(range)
      apply(direct ? chain : clearBlocks(chain)).run()
      return
    }
    const $at = editor.state.doc.resolve(at.from)
    const block = $at.parent
    const empty = block.content.size === at.to - at.from
    // Un élément de liste vide (le « + » de sa poignée) d'une liste de la
    // page : il sort de sa liste, et le bloc prend sa place.
    const unit = unitAround($at)
    const host = unit && flowOf(editor.state.doc, unit.pos)?.host
    if (
      empty &&
      item.section !== 'inline' &&
      unit?.list &&
      unit.node.childCount === 1 &&
      host &&
      BODY_CONTAINERS.has(host.type.name)
    ) {
      const tr = editor.state.tr.delete(range.from, range.to)
      const out = unwrapItems(tr, [unit])
      if (out) {
        const inside = out.at[0] + 1
        editor.view.dispatch(
          tr.setSelection(TextSelection.create(tr.doc, inside)),
        )
        item.action.run(editor, { from: inside, to: inside })
        return
      }
    }
    const placeable =
      block.type.name === PARAGRAPH &&
      BODY_CONTAINERS.has($at.node($at.depth - 1).type.name)
    // Ce qui s'insère dans le texte (l'équation en ligne) se pose au « / »,
    // quel que soit le bloc.
    if ((empty && placeable) || item.section === 'inline') {
      item.action.run(editor, range)
      return
    }
    // Dessous : après le bloc de la page (ou de son conteneur) qui le porte
    // — la liste entière pour un élément de liste.
    let depth = $at.depth
    while (!BODY_CONTAINERS.has($at.node(depth - 1).type.name)) depth--
    const after = $at.after(depth) - (at.to - at.from)
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContentAt(after, {
        type: PARAGRAPH,
        content: [{ type: 'text', text: '/' }],
      })
      .setTextSelection(after + 2)
      .run()
    item.action.run(editor, { from: after + 1, to: after + 2 })
  }

  useMenuKeys(area, (e) => {
    if (!slash || e.isComposing) return
    const take = () => {
      e.preventDefault()
      e.stopPropagation()
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      take()
      byKeys.current = true
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((a) => (Math.min(a, footer) + step + footer + 1) % (footer + 1))
    } else if (e.key === 'Enter') {
      take()
      const index = Math.min(active, footer)
      if (index < footer) pick(shown[index], slash)
      else close()
    } else if (e.key === 'Escape') {
      take()
      close()
    } else if (e.key === 'Tab') {
      // Ferme, et Tab fait son effet (indenter).
      close()
    }
  })

  if (!slash || !area.current) return null

  const sections = filtered
    ? [{ label: 'Résultats', items: shown }]
    : BLOCK_SECTIONS.map((section) => ({
        label: SECTION_LABELS[section],
        items: shown.filter((i) => i.section === section),
      })).filter((s) => s.items.length > 0)
  const current = Math.min(active, footer)

  const row = (index: number, onPick: () => void, children: ReactNode) => (
    <MenuRow
      key={index}
      index={index}
      current={current}
      onActive={setActive}
      onPick={onPick}
    >
      {children}
    </MenuRow>
  )

  return (
    <MenuShell
      key={slash.from}
      editor={editor}
      area={area.current}
      from={slash.from}
      width={WIDTH}
      fullHeight={FULL_HEIGHT}
      active={current}
      byKeys={byKeys}
    >
      {shown.length > 0 && (
        <div
          role="listbox"
          aria-label="Blocs"
          className="flex flex-col gap-px overflow-y-auto px-1 py-1.5"
          style={{ maxHeight: LIST_HEIGHT }}
        >
          {sections.map(({ label, items }) => (
            <Fragment key={label}>
              <span className="px-2 pt-2 pb-1.5 text-xs leading-4 font-medium text-muted-foreground first:pt-1">
                {label}
              </span>
              {items.map((item) =>
                row(
                  shown.indexOf(item),
                  () => pick(item, slash),
                  <>
                    <item.icon
                      aria-hidden
                      className="size-5 shrink-0"
                      strokeWidth={1.5}
                    />
                    <span className="flex-1 truncate text-sm leading-[1.2]">
                      {item.label}
                    </span>
                    {item.markdown && (
                      <span className="shrink-0 text-xs text-muted-foreground/75">
                        {item.markdown}
                      </span>
                    )}
                  </>,
                ),
              )}
            </Fragment>
          ))}
        </div>
      )}
      <div className={cn('p-1', shown.length > 0 && 'border-t')}>
        {row(
          footer,
          close,
          <>
            <span className="flex-1 text-sm text-muted-foreground">
              Fermer le menu
            </span>
            <span className="text-xs text-muted-foreground/75">esc</span>
          </>,
        )}
      </div>
    </MenuShell>
  )
}
