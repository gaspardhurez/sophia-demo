import { mergeAttributes, Node, type NodeViewRenderer } from '@tiptap/core'

/**
 * La mention d'une ressource du savoir, en ligne (la mention de page de
 * Notion), posée par le menu « @ » (`lib/mention`) : le nœud ne porte que
 * l'`id` de la ressource ; la vue (`ResourceMentionView`) en lit le titre
 * courant — une ressource renommée l'est aussi dans les notes — et ouvre son
 * lien.
 */
export const RESOURCE_MENTION = 'resourceMention'

export const ResourceMentionNode = Node.create<{ view?: NodeViewRenderer }>({
  name: RESOURCE_MENTION,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { view: undefined }
  },

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-resource-mention'),
        renderHTML: (attrs) =>
          attrs.id ? { 'data-resource-mention': attrs.id } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-resource-mention]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), '@ressource']
  },

  addNodeView() {
    return this.options.view ?? null
  },
})
