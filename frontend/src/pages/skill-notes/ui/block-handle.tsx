import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { GripVertical, Plus } from 'lucide-react'
import { type RefObject, useEffect, useRef, useState } from 'react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui'

import { blockSelOf, selectBlocks } from '../lib/block-selection'
import { type BlockHit, handleHit } from '../lib/drop-target'
import { handleSpot } from '../lib/handle-spot'
import { useBlockDrag } from '../model/use-block-drag'
import { BlockMenu } from './block-menu'

/**
 * Jusqu'où, à gauche du bord de la colonne, le survol montre les poignées
 * (annexe §2 : ~130 px dans la marge).
 */
const REACH = 130
/**
 * Le « + » (24 px) commence à 60 px du texte, ⋮⋮ (18 px) à 36 px : leurs
 * bords droits sont à 36 et 18 px du texte, comme chez Notion (annexe §2).
 */
const FROM_TEXT = 60

/**
 * Les poignées « + ⋮⋮ » au survol d'un bloc (annexe §2 ; cf. `block-unit` :
 * chaque élément de liste en est un), dans la marge à gauche de son texte —
 * dans une colonne comme au premier niveau ; à gauche de la puce d'un
 * élément, décalées de son retrait —, centrées sur sa première ligne
 * (`handleSpot`) ; celles du premier bloc d'un encadré sont celles de
 * l'encadré (`handleHit`). Elles apparaissent en fondu (0,2 s), disparaissent d'un
 * coup.
 *
 * - « + » : un bloc vide sous le bloc — un élément vide de la même liste sous
 *   un élément —, et le menu « / » dessus (il y tape « / ») ; sur un
 *   paragraphe ou un élément déjà vide, le menu seulement.
 * - « ⋮⋮ » : se glisse pour déplacer le bloc (`useBlockDrag`) ; un clic le
 *   sélectionne et ouvre le menu du bloc (`BlockMenu`), comme ⌘/.
 *
 * Écrites ici plutôt que l'extension de TipTap, qui tire l'outillage de
 * l'édition collaborative (Yjs) pour deux icônes.
 *
 * `area` : l'élément qui contient l'éditeur, repère des positions.
 */
export function BlockHandle({
  editor,
  area,
  onDeleteQuestion,
}: {
  editor: Editor
  area: RefObject<HTMLElement | null>
  onDeleteQuestion: (id: string) => void
}) {
  const [block, setBlock] = useState<{
    hit: BlockHit
    top: number
    left: number
  } | null>(null)
  const menu = useEditorState({
    editor,
    selector: ({ editor: e }) => !!(e && blockSelOf(e.state)?.menu),
  })
  // Menu ouvert, poignée pressée ou glisser en cours : le bloc visé ne suit
  // plus le pointeur — le glisser emporte le bloc pressé, et la poignée ne
  // bouge pas sous lui (le navigateur l'annulerait).
  const [dragging, setDragging] = useState(false)
  const pressed = useRef(false)
  const frozen = useRef(false)
  frozen.current = menu || dragging
  const drag = useBlockDrag(editor, area, () => {
    pressed.current = false
    setDragging(false)
    setBlock(null)
  })

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (frozen.current || pressed.current) return
      const root = area.current
      const target = e.target as HTMLElement
      // Sur les poignées elles-mêmes : on garde le bloc visé.
      if (target.closest?.('[data-block-handle]')) return
      if (!root || !root.parentElement?.contains(target)) return setBlock(null)
      const view = editor.view
      const box = view.dom.getBoundingClientRect()
      // La colonne, et la marge à sa gauche ; rien au-delà de son bord droit.
      if (
        e.clientY < box.top - 8 ||
        e.clientY > box.bottom + 8 ||
        e.clientX < box.left - REACH ||
        e.clientX > box.right
      )
        return setBlock(null)
      const hit = handleHit(
        editor.state.doc,
        (pos) => {
          const dom = view.nodeDOM(pos)
          return dom instanceof HTMLElement ? dom.getBoundingClientRect() : null
        },
        e.clientX,
        e.clientY,
      )
      const spot = hit && handleSpot(view, hit)
      if (!hit || !spot) return setBlock(null)
      const at = root.getBoundingClientRect()
      const top = spot.top - at.top
      const left = spot.text - at.left - FROM_TEXT
      setBlock((b) =>
        b?.hit.pos === hit.pos &&
        b.hit.node === hit.node &&
        b.top === top &&
        b.left === left
          ? b
          : { hit, top, left },
      )
    }
    const release = () => {
      pressed.current = false
    }
    document.addEventListener('mousemove', move)
    window.addEventListener('mouseup', release)
    window.addEventListener('dragend', release, true)
    return () => {
      document.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', release)
      window.removeEventListener('dragend', release, true)
    }
  }, [editor, area])

  const blockMenu = (
    <BlockMenu
      editor={editor}
      area={area}
      onDeleteQuestion={onDeleteQuestion}
    />
  )
  // Le bloc survolé a pu disparaître depuis (⌘A puis Suppr, un collage…) : sa
  // position peut sortir du document, `nodeAt` lèverait alors une erreur.
  const doc = editor.state.doc
  const node =
    block && block.hit.pos < doc.content.size ? doc.nodeAt(block.hit.pos) : null
  // Le document a changé sous le pointeur : on attend le prochain survol.
  if (!block || !editor.isEditable || !node || node !== block.hit.node)
    return blockMenu
  const pos = block.hit.pos

  const add = () => {
    const item = !!block.hit.list
    // Un élément : son texte ; vide, sans sous-élément, il reçoit le « / ».
    const text = item ? node.firstChild : node
    const empty =
      text?.type.name === 'paragraph' &&
      !text.content.size &&
      (!item || node.childCount === 1)
    // Un paragraphe (ou un élément) vide reçoit le « / » ; sinon un neuf dessous.
    if (empty) {
      editor
        .chain()
        .focus()
        .insertContentAt(pos + (item ? 2 : 1), '/')
        .run()
      return
    }
    const at = pos + node.nodeSize
    if (item) {
      // Un élément vide de la même liste, juste après celui-ci.
      editor
        .chain()
        .focus()
        .insertContentAt(at, {
          type: node.type.name,
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: '/' }] },
          ],
        })
        .setTextSelection(at + 3)
        .run()
      return
    }
    // `focus` d'abord : en fin de chaîne, il reprendrait la sélection d'avant.
    editor
      .chain()
      .focus()
      .insertContentAt(at, {
        type: 'paragraph',
        content: [{ type: 'text', text: '/' }],
      })
      .setTextSelection(at + 2)
      .run()
  }

  const button =
    'grid h-6 cursor-pointer place-items-center rounded-[4px] transition-colors duration-[20ms] ease-in hover:bg-foreground/[5.5%]'
  return (
    <>
      {blockMenu}
      <div
        // Un bloc, un fondu : la poignée renaît à chaque bloc survolé.
        key={pos}
        data-block-handle=""
        className="absolute z-20 flex animate-in text-foreground/45 duration-200 ease-out fade-in-0 max-[700px]:hidden"
        style={{ top: block.top, left: block.left }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Ajouter un bloc dessous"
              // Le clic ne vole pas le focus à l'éditeur.
              onMouseDown={(e) => e.preventDefault()}
              onClick={add}
              className={`${button} w-6`}
            >
              <Plus className="size-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <b>Cliquez</b> pour ajouter un bloc dessous
          </TooltipContent>
        </Tooltip>
        <Tooltip open={menu || dragging ? false : undefined}>
          <TooltipTrigger asChild>
            <span
              role="button"
              tabIndex={-1}
              aria-label="Déplacer le bloc ou ouvrir son menu"
              aria-haspopup="menu"
              aria-expanded={menu}
              draggable
              onMouseDown={() => {
                pressed.current = true
              }}
              onDragStart={(e) => {
                setDragging(true)
                drag.start(e, block.hit)
              }}
              // La fin du glisser arrive ici même si le document ne l'a pas vue.
              onDragEnd={drag.end}
              onClick={() => {
                pressed.current = false
                selectBlocks(editor.view, pos, { menu: true })
              }}
              className={`${button} w-[18px] cursor-grab`}
            >
              <GripVertical className="size-5" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-center">
            <b>Faites glisser</b> pour déplacer
            <br />
            <b>Cliquez</b> ou <b>⌘/</b> pour ouvrir le menu
          </TooltipContent>
        </Tooltip>
      </div>
    </>
  )
}
