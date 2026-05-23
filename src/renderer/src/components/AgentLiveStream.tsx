import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Eye,
  Loader2,
  XCircle
} from 'lucide-react'
import type { AgentPart } from '../../../shared/types'
import { stripInternalToolCallMarkup } from '../../../shared/internal-tool-call-markup'
import { AssistantMessageBody } from './AssistantMessageBody'
import { AgentTaskList } from './AgentTaskList'
import { AgentActivityDetail } from './AgentActivityDetail'
import { AgentPermissionBadge } from './AgentPermissionBadge'
import { agentPartSessionId } from '../lib/terminal-stage'
import { cn } from '../lib/utils'
import {
  agentPartOutput,
  parseAgentPartCommand,
  sanitizeAgentText
} from '../lib/agent-part-preview'
import { shouldShowAgentLivePart } from '../lib/agent-live-stream'
import {
  agentActivityLines,
  agentActivityStatus,
  agentActivitySummary,
  shouldShowAgentActivityDetail
} from '../lib/agent-activity-summary'
import { AgentActivityIcon } from '../lib/agent-activity-icons'
import { deriveAgentTasks } from '../lib/agent-task-list'
import {
  agentRawProcessParts,
  isAssistantTextPart,
  latestLiveAssistantTextPart,
  sortAgentParts
} from '../lib/agent-process-parts'
import { permissionPartsByParent } from '../lib/agent-permission-parts'

interface AgentLiveStreamProps {
  parts: AgentPart[]
  onRevealTerminal?: (sessionId: string, partId?: string) => void
  focusedPartId?: string | null
}

function elapsedMs(parts: AgentPart[]): number | undefined {
  const starts = parts
    .map((part) => part.startedAt ?? part.createdAt)
    .filter((value): value is number => typeof value === 'number')
  if (starts.length === 0) return undefined
  return Math.max(0, Date.now() - Math.min(...starts))
}

function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return ''
  const totalSeconds = Math.max(1, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds}s`
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
}

function statusLabel(part: AgentPart): string {
  if (part.status === 'pending') return '等待中'
  if (part.status === 'running') return '运行中'
  if (part.status === 'completed') return '完成'
  if (part.status === 'error') return '错误'
  if (part.status === 'cancelled') return '已取消'
  return '阻塞'
}

function statusIcon(part: AgentPart): React.ReactElement {
  if (part.status === 'pending' || part.status === 'running') {
    return <Loader2 size={12} className="animate-spin text-accent" />
  }
  if (part.status === 'completed') return <CheckCircle2 size={12} className="text-success" />
  if (part.status === 'error') return <XCircle size={12} className="text-danger" />
  return <Circle size={12} className="text-muted-foreground" />
}

function metadataString(part: AgentPart, key: string): string | undefined {
  const value = part.metadata?.[key]
  return typeof value === 'string' ? value : undefined
}

function toolOutput(part: AgentPart): string {
  return sanitizeAgentText(metadataString(part, 'liveOutputPreview') || agentPartOutput(part))
}

export function shouldShowLiveRawOutputFallback(part: AgentPart): boolean {
  if (isAssistantTextPart(part)) return false
  return Boolean(toolOutput(part) && (part.status === 'running' || part.metadata?.live === true))
}

export function AgentLiveStream({
  parts,
  onRevealTerminal,
  focusedPartId
}: AgentLiveStreamProps): React.ReactElement | null {
  const [expanded, setExpanded] = useState(true)
  const [expandedPartIds, setExpandedPartIds] = useState<Set<string>>(() => new Set())
  const [, setTick] = useState(0)
  const visibleParts = useMemo(() => sortAgentParts(parts).filter(shouldShowAgentLivePart), [parts])

  useEffect(() => {
    const id = window.setInterval(() => setTick((value) => value + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  const liveAssistantPart = latestLiveAssistantTextPart(parts)
  const liveAssistantContent = liveAssistantPart
    ? stripInternalToolCallMarkup(liveAssistantPart.output ?? '')
    : ''
  const activityParts = agentRawProcessParts(parts)
  const permissionsByParent = useMemo(() => permissionPartsByParent(parts), [parts])
  const activityLines = agentActivityLines(activityParts)
  const summary = agentActivitySummary(activityParts)
  const status = agentActivityStatus(activityParts)
  const tasks = deriveAgentTasks(activityParts)
  const duration = formatDuration(elapsedMs(visibleParts))
  const togglePart = (partId: string): void => {
    setExpandedPartIds((current) => {
      const next = new Set(current)
      if (next.has(partId)) {
        next.delete(partId)
      } else {
        next.add(partId)
      }
      return next
    })
  }

  return (
    <div className="mx-auto w-full max-w-[860px] cursor-auto select-text no-drag">
      <div className="space-y-4">
        {activityParts.length > 0 ? (
          <div>
            <button
              onClick={() => setExpanded((value) => !value)}
              className="flex w-full items-center gap-2 py-1.5 text-left text-sm text-muted-foreground transition hover:text-foreground no-drag"
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span className="font-medium">{status}</span>
              {duration && <span>{duration}</span>}
              {summary && <span>{summary}</span>}
            </button>

            {expanded && (
              <div className="mt-1 space-y-3 pl-6">
                <AgentTaskList tasks={tasks} />
                <div className="space-y-1">
                  {activityParts.map((part, index) => {
                    const line = activityLines[index]
                    const textContent = isAssistantTextPart(part)
                      ? stripInternalToolCallMarkup(part.output ?? '')
                      : ''
                    const output = toolOutput(part)
                    const input = parseAgentPartCommand(part)
                    const isLive = part.status === 'running' || part.metadata?.live === true
                    const showRawOutputFallback = shouldShowLiveRawOutputFallback(part)
                    const sessionId = agentPartSessionId(part)
                    const isFocused = focusedPartId === part.id
                    const permissionParts = permissionsByParent.get(part.id)
                    const fullDetail = line?.fullDetail || output || input
                    const canExpandPart =
                      !textContent && (shouldShowAgentActivityDetail(line) || showRawOutputFallback)
                    const isPartExpanded = expandedPartIds.has(part.id)
                    return (
                      <div
                        key={part.id}
                        className={cn(
                          'rounded-lg px-2 py-1.5 transition-colors',
                          part.status === 'error'
                            ? 'bg-danger-soft/55 text-danger'
                            : isLive
                              ? 'bg-accent-soft/50 text-foreground'
                              : 'text-muted-foreground',
                          isFocused && 'ring-1 ring-accent/25'
                        )}
                      >
                        {textContent ? (
                          <AssistantMessageBody content={textContent} className="py-0.5" />
                        ) : (
                          <div className="flex min-w-0 items-center gap-2 text-sm">
                            {canExpandPart ? (
                              <button
                                type="button"
                                onClick={() => togglePart(part.id)}
                                className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground transition hover:bg-black/[0.04] hover:text-foreground"
                                aria-label={isPartExpanded ? '收起过程详情' : '展开过程详情'}
                              >
                                {isPartExpanded ? (
                                  <ChevronDown size={13} />
                                ) : (
                                  <ChevronRight size={13} />
                                )}
                              </button>
                            ) : (
                              <span className="h-4 w-4 shrink-0" />
                            )}
                            {statusIcon(part)}
                            <AgentActivityIcon
                              kind={line?.kind || 'other'}
                              toolName={part.toolName}
                              className="shrink-0 text-muted-foreground"
                            />
                            <span className="shrink-0 font-medium">{line?.label || '处理'}</span>
                            {(line?.detail || input) && (
                              <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                                {line?.detail || input}
                              </span>
                            )}
                            <AgentPermissionBadge permissions={permissionParts} />
                            {sessionId && onRevealTerminal && (
                              <button
                                onClick={() => onRevealTerminal(sessionId, part.id)}
                                className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition hover:bg-black/[0.04] hover:text-foreground"
                              >
                                <Eye size={12} />
                                终端
                              </button>
                            )}
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {statusLabel(part)}
                            </span>
                          </div>
                        )}

                        {canExpandPart && isPartExpanded && (
                          <AgentActivityDetail line={line} fallback={fullDetail} isLive={isLive} />
                        )}
                        {showRawOutputFallback && !isPartExpanded && (
                          <AgentActivityDetail fallback={output} isLive={isLive} />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        ) : !liveAssistantContent ? (
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Loader2 size={15} className="animate-spin" />
            <span>等待模型输出</span>
          </div>
        ) : null}
        {liveAssistantContent && <AssistantMessageBody content={liveAssistantContent} />}
      </div>
    </div>
  )
}
