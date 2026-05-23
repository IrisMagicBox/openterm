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

export function isFinalAssistantTextPart(part: AgentPart): boolean {
  return isAssistantTextPart(part) && !!part.messageId
}

export function latestLiveAssistantTextPart(parts: AgentPart[]): AgentPart | undefined {
  const sorted = sortAgentParts(parts)
  return [...sorted]
    .reverse()
    .find(
      (part) =>
        isAssistantTextPart(part) &&
        !isFinalAssistantTextPart(part) &&
        (part.status === 'running' || !hasLaterActivity(part, sorted))
    )
}

export function isIntermediateAssistantTextPart(part: AgentPart, parts: AgentPart[]): boolean {
  return (
    isAssistantTextPart(part) && !isFinalAssistantTextPart(part) && hasLaterActivity(part, parts)
  )
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

function normalizeComparableText(value: string): string {
  return sanitizeAgentText(value).replace(/\s+/g, ' ').trim()
}

function dedupeKey(part: AgentPart): string | undefined {
  if (part.status !== 'completed') return undefined
  if (part.type === 'text' || part.type === 'reasoning') {
    const output = normalizeComparableText(agentPartOutput(part) || part.output || part.input || '')
    return output ? `${part.type}:${part.role || ''}:${output}` : undefined
  }

  if (part.type === 'tool' || part.type === 'permission') {
    const input = normalizeComparableText(part.input || parseAgentPartCommand(part))
    const output = normalizeComparableText(
      agentPartOutput(part) || metadataString(part, 'liveOutputPreview') || part.error || ''
    )
    return input || output
      ? `${part.type}:${part.toolName || ''}:${input}:${output}:${part.status}`
      : undefined
  }

  return undefined
}

function dedupeCompletedParts(parts: AgentPart[]): AgentPart[] {
  const result: AgentPart[] = []
  const seen = new Set<string>()

  for (const part of parts) {
    const key = dedupeKey(part)
    if (key && seen.has(key)) continue
    if (key) seen.add(key)
    result.push(part)
  }

  return result
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

export function agentRawProcessParts(parts: AgentPart[]): AgentPart[] {
  const liveAssistantTextPart = latestLiveAssistantTextPart(parts)
  const sorted = sortAgentParts(parts).filter(shouldShowAgentLivePart)
  return sorted.filter(
    (part) =>
      part.type !== 'usage' &&
      part.role !== 'user' &&
      part.id !== liveAssistantTextPart?.id &&
      !isFinalAssistantTextPart(part) &&
      hasProcessContent(part)
  )
}

export function agentSummaryParts(parts: AgentPart[]): AgentPart[] {
  const visible = agentRawProcessParts(parts)
  return dedupeCompletedParts(visible)
}
