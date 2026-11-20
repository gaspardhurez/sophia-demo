import { RESOURCE_MENTION, ResourceMentionNode } from '../resource-mention-node'
import type { BlockSpec } from './types'

/**
 * La mention d'une ressource (cf. `../resource-mention-node`), en ligne :
 * elle se pose au menu « @ » (`../mention`), pas au « / ».
 */
export const resourceMentionBlock: BlockSpec = {
  name: RESOURCE_MENTION,
  nodes: [RESOURCE_MENTION],
  extensions: ({ resourceMentionView }) => [
    ResourceMentionNode.configure({ view: resourceMentionView }),
  ],
}
