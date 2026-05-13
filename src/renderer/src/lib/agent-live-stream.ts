import type { AgentPart } from '../../../shared/types'

export function shouldShowAgentLivePart(part: AgentPart): boolean {
  if (part.type === 'usage') return false
  if (part.type === 'error') return false
  if (part.role === 'user') return false
  return true
}
