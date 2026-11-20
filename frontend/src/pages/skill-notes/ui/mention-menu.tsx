import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { type RefObject, useEffect, useRef, useState } from 'react'

import { type Resource, resourceEmoji, useResources } from '@/entities/resource'

import {
  closeMention,
  mentionAt,
  mentionKey,
  mentionPlugin,
  mentionResults,
} from '../lib/mention'
import type { TriggerQuery } from '../lib/trigger'
import { RESOURCE_MENTION } from '../lib/resource-mention-node'
import { useMenuKeys } from '../model/use-menu-keys'
import { MenuRow, MenuShell } from './trigger-menu'

/** Relevé de Notion (menu « @ ») : 330 px, lignes de 28 px. */
const WIDTH = 330
const LIST_HEIGHT = 320

/**
 * Le menu des mentions, ouvert par « @ » (comme Notion ; règle d'ouverture
 * et filtre : `lib/mention`) : sous la ligne du « @ », les ressources du
 * savoir sous l'en-tête « Ressources », filtrées par la requête. ↓ ↑ (en
 * boucle), Entrée remplace « @requête » par la mention et une espace, Échap
 * et Tab ferment (le texte tapé reste). Rien ne répond : rien ne s'affiche.
 */
export function MentionMenu({
  editor,
  area,
  skillId,
}: {
  editor: Editor
  area: RefObject<HTMLElement | null>
  skillId: string
}) {
  const { data: resources } = useResources(skillId)
  const latest = useRef(resources)
  latest.current = resources

  // Le plugin qui suit le « @ » ouvert vit avec le menu.
  useEffect(() => {
    editor.registerPlugin(mentionPlugin(() => latest.current))
    return () => {
      if (!editor.isDestroyed) editor.unregisterPlugin(mentionKey)
    }
  }, [editor])

  const query = useEditorState({
    editor,
    selector: ({ editor: e }) => (e && e.isFocused ? mentionAt(e.state) : null),
    equalityFn: (a, b) =>
      a === b ||
      (!!a && !!b && a.from === b.from && a.to === b.to && a.query === b.query),
  })

  const shown = query ? mentionResults(resources ?? [], query.query) : []
  const [active, setActive] = useState(0)
  const byKeys = useRef(false)
  // Un autre « @ », une autre requête : on repart de la première.
  useEffect(() => setActive(0), [query?.from, query?.query])
  const current = Math.min(active, Math.max(shown.length - 1, 0))

  const close = () => editor.view.dispatch(closeMention(editor.state.tr))

  function pick(resource: Resource, at: TriggerQuery) {
    editor
      .chain()
      .focus()
      .insertContentAt({ from: at.from, to: at.to }, [
        { type: RESOURCE_MENTION, attrs: { id: resource.id } },
        { type: 'text', text: ' ' },
      ])
      .run()
  }

  useMenuKeys(area, (e) => {
    if (!query || shown.length === 0 || e.isComposing) return
    const take = () => {
      e.preventDefault()
      e.stopPropagation()
    }
    const n = shown.length
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      take()
      byKeys.current = true
      setActive((current + (e.key === 'ArrowDown' ? 1 : -1) + n) % n)
    } else if (e.key === 'Enter') {
      take()
      pick(shown[current], query)
    } else if (e.key === 'Escape') {
      take()
      close()
    } else if (e.key === 'Tab') {
      close()
    }
  })

  if (!query || shown.length === 0 || !area.current) return null

  return (
    <MenuShell
      key={query.from}
      editor={editor}
      area={area.current}
      from={query.from}
      width={WIDTH}
      fullHeight={LIST_HEIGHT + 16}
      active={current}
      byKeys={byKeys}
    >
      <div
        role="listbox"
        aria-label="Ressources"
        className="flex flex-col gap-px overflow-y-auto px-1 py-1.5"
        style={{ maxHeight: LIST_HEIGHT }}
      >
        <span className="px-2 pt-1 pb-1.5 text-xs leading-4 font-medium text-muted-foreground">
          Ressources
        </span>
        {shown.map((resource, index) => (
          <MenuRow
            key={resource.id}
            index={index}
            current={current}
            onActive={setActive}
            onPick={() => pick(resource, query)}
            className="h-7"
          >
            <span
              aria-hidden
              className="grid size-5 shrink-0 place-items-center text-[15px] leading-none"
            >
              {resourceEmoji(resource)}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm leading-[1.2]">
              {resource.title}
            </span>
            {resource.part && (
              <span className="max-w-[40%] shrink-0 truncate text-xs text-muted-foreground">
                {resource.part}
              </span>
            )}
          </MenuRow>
        ))}
      </div>
    </MenuShell>
  )
}
