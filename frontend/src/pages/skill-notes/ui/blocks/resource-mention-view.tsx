import { type NodeViewProps, NodeViewWrapper } from '@tiptap/react'
import { useParams } from 'react-router-dom'

import { resourceEmoji, resourceHref, useResources } from '@/entities/resource'

import { MentionToken } from './mention-token'

/**
 * La mention d'une ressource (cf. `lib/resource-mention-node`), en ligne :
 * son emoji (📺, 🔗, 📘) et son titre courant, dessinés comme la mention de
 * page de Notion (`MentionToken`). Un clic ouvre son lien dans un nouvel
 * onglet ; une référence sans lien n'ouvre rien. Une ressource supprimée se
 * montre « Ressource supprimée », barrée.
 */
export function ResourceMentionView({ node, selected }: NodeViewProps) {
  const id = node.attrs.id as string | null
  const { skillId } = useParams<{ skillId: string }>()
  const { data: resources } = useResources(skillId)
  const resource = resources?.find((r) => r.id === id)
  const gone = !!resources && !resource
  const href = resource ? resourceHref(resource.reference) : null

  return (
    <NodeViewWrapper as="span" contentEditable={false} className="inline">
      <MentionToken
        icon={resource ? resourceEmoji(resource) : '📘'}
        label={resource?.title ?? (gone ? 'Ressource supprimée' : '…')}
        href={href ?? undefined}
        newTab
        title={
          resource
            ? [resource.part, resource.reference].filter(Boolean).join(' · ') ||
              undefined
            : undefined
        }
        onClick={(e) => {
          if (!href) e.preventDefault()
        }}
        muted={!resource}
        struck={gone}
        selected={selected}
      />
    </NodeViewWrapper>
  )
}
