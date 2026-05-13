import type { AgentPart } from '../../../shared/types'
import { agentPartOutput, parseAgentPartCommand, sanitizeAgentText } from './agent-part-preview'
import { shouldShowAgentLivePart } from './agent-live-stream'

export function sortAgentParts(parts: AgentPart[]): AgentPart[] {
  return [...parts].sort((a, b) => a.orderIndex - b.orderIndex || a.createdAt - b.createdAt)
}

function hasLaterActivity(part: AgentPart, parts: AgentPart[]): boolean {
  return parts.some(
    (candidate) =>
      (candidate.orderIndex > part.orderIndex ||
        (candidate.orderIndex === part.orderIndex && candidate.createdAt > part.createdAt)) &&
      candidate.type !== 'text' &&
      candidate.type !== 'reasoning' &&
      candidate.type !== 'usage'
  )
}

export function isAssistantTextPart(part: AgentPart): boolean {
  return part.type === 'text' && part.role === 'assistant' && !!part.output
}

export function isIntermediateAssistantTextPart(part: AgentPart, parts: AgentPart[]): boolean {
  return isAssistantTextPart(part) && !part.messageId && hasLaterActivity(part, parts)
}

function metadataString(part: AgentPart, key: string): string {
  const value = part.metadata?.[key]
  return typeof value === 'string' ? sanitizeAgentText(value) : ''
}

function hasProcessContent(part: AgentPart): boolean {
  if (part.status === 'pending' || part.status === 'running' || part.status === 'blocked') {
    return true
  }
  if (part.toolName) return true

  return Boolean(
    parseAgentPartCommand(part) ||
    agentPartOutput(part) ||
    sanitizeAgentText(part.input || '') ||
    metadataString(part, 'liveOutputPreview') ||
    metadataString(part, 'displayQuery') ||
    metadataString(part, 'reason')
  )
}

export function agentProcessParts(parts: AgentPart[]): AgentPart[] {
  const sorted = sortAgentParts(parts).filter(shouldShowAgentLivePart)
  return sorted.filter(
    (part) =>
      part.type !== 'usage' &&
      part.role !== 'user' &&
      (!isAssistantTextPart(part) || isIntermediateAssistantTextPart(part, sorted)) &&
      hasProcessContent(part)
  )
}
