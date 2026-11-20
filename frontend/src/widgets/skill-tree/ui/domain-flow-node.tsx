import { Handle, type NodeProps, Position } from '@xyflow/react'
import { Plus } from 'lucide-react'

import { CreateSkillDialog } from '@/features/skill/create'
import { Button } from '@/shared/ui'

import { DOMAIN_WIDTH, type DomainFlowNodeType } from '../lib/layout'

export function DomainFlowNode({ data }: NodeProps<DomainFlowNodeType>) {
  const { domainId, domainName, readOnly } = data

  return (
    <div
      style={{ width: DOMAIN_WIDTH }}
      className="group relative rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-center shadow-sm"
    >
      <span className="block truncate font-semibold">{domainName}</span>

      {/* Une poignée par côté : le centre alimente les deux moitiés de la
          carte, et chaque arête sait par où sortir (`sourceHandle`). */}
      <Handle
        type="source"
        id="right"
        position={Position.Right}
        className="!size-0 !border-0 !bg-transparent"
      />
      <Handle
        type="source"
        id="left"
        position={Position.Left}
        className="!size-0 !border-0 !bg-transparent"
      />

      {!readOnly && (
        <CreateSkillDialog
          domainId={domainId}
          parentId={null}
          trigger={
            <Button
              variant="outline"
              size="icon"
              className="absolute -bottom-3 left-1/2 z-10 size-6 -translate-x-1/2 rounded-full bg-card opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
              aria-label="Ajouter une compétence"
            >
              <Plus className="size-4" />
            </Button>
          }
        />
      )}
    </div>
  )
}
