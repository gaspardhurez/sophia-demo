import { mergeAttributes, Node, type NodeViewRenderer } from '@tiptap/core'

/**
 * Le lien vers un autre savoir, en ligne (la mention de page de Notion) : le
 * nœud ne porte que l'`id` du savoir ; la vue (`SkillLinkView`) en lit le nom
 * courant — un savoir renommé l'est aussi dans les notes — et mène à sa page.
 *
 * Sans `id`, le lien attend son savoir. `fresh` marque celui que cette
 * session vient de poser (`/Lien vers un savoir`) : sa vue ouvre d'emblée le
 * sélecteur. Un lien resté sans savoir (page fermée avant le choix) se montre
 * « Choisir un savoir » et s'ouvre au clic.
 */
export const SKILL_LINK = 'skillLink'

/** Propre à cette session : un `fresh` lu d'un document enregistré ne l'est pas. */
export const SKILL_LINK_SESSION = crypto.randomUUID()

export const SkillLinkNode = Node.create<{ view?: NodeViewRenderer }>({
  name: SKILL_LINK,
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
        parseHTML: (el) => el.getAttribute('data-skill-link'),
        renderHTML: (attrs) =>
          attrs.id
            ? { 'data-skill-link': attrs.id, href: `/skills/${attrs.id}` }
            : {},
      },
      fresh: { default: null, parseHTML: () => null, renderHTML: () => ({}) },
    }
  },

  parseHTML() {
    return [{ tag: 'a[data-skill-link]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['a', mergeAttributes(HTMLAttributes), '📄 savoir']
  },

  addNodeView() {
    return this.options.view ?? null
  },
})
