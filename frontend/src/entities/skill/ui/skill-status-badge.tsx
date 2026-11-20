import { Chip } from '@/shared/ui'

import { SKILL_STATUS_META } from '../model/status'
import type { SkillStatus } from '../model/types'

export function SkillStatusBadge({ status }: { status: SkillStatus }) {
  const { label, badgeClassName } = SKILL_STATUS_META[status]
  return <Chip className={badgeClassName}>{label}</Chip>
}
