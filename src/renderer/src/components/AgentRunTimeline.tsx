import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Loader2,
  XCircle
} from 'lucide-react'
import type { JSX } from 'react'
import type { AgentPart } from '../../../shared/types'
import { AgentActivityDetail } from './AgentActivityDetail'
import { AgentTaskList } from './AgentTaskList'
import {
  agentActivityLines,
  agentActivityStatus,
  agentActivitySummary,
  shouldShowAgentActivityDetail
} from '../lib/agent-activity-summary'
import { deriveAgentTasks } from '../lib/agent-task-list'
import { AgentActivityIcon } from '../lib/agent-activity-icons'
import { agentPartPreview } from '../lib/agent-part-preview'
import {
  agentRawProcessParts,
  agentSummaryParts,
  isAssistantTextPart,
  latestLiveAssistantTextPart
} from '../lib/agent-process-parts'
import { cn } from '../lib/utils'
import { stripInternalToolCallMarkup } from '../../../shared/internal-tool-call-markup'
import { AssistantMessageBody } from './AssistantMessageBody'

interface AgentRunTimelineProps {
  taskId: string
  runId?: string
}

function formatDuration(parts: AgentPart[]): string {
  const starts = parts
    .map((part) => part.startedAt ?? part.createdAt)
    .filter((value): value is number => typeof value === 'number')
  const ends = parts
    .map((part) => part.endedAt ?? part.updatedAt ?? part.createdAt)
    .filter((value): value is number => typeof value === 'number')
  if (starts.length === 0 || ends.length === 0) return ''
  const ms = Math.max(0, Math.max(...ends) - Math.min(...starts))
  const totalSeconds = Math.max(1, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds}s`
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
}

function statusIcon(part: AgentPart): JSX.Element {
  if (part.status === 'pending' || part.status === 'running') {
    return <Loader2 size={13} className="animate-spin text-muted-foreground" />
  }
  if (part.status === 'completed') {
    return <CheckCircle2 size={13} className="text-muted-foreground" />
  }
  if (part.status === 'error') return <XCircle size={13} className="text-danger" />
  return <Circle size={13} className="text-muted-foreground" />
}

export function AgentRunTimeline({ taskId, runId }: AgentRunTimelineProps): JSX.Element | null {
  const [parts, setParts] = useState<AgentPart[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [expandedPartIds, setExpandedPartIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    const fetchParts = async (): Promise<void> => {
      try {
        const result = runId
          ? await window.api.getAgentRunParts(runId)
          : await window.api.getAgentTaskParts(taskId)
        setParts(result)
      } finally {
        setLoading(false)
      }
    }

    fetchParts()
    const unlistenCreated = window.api.onAgentPartCreated((part) => {
      if (runId) {
        if (part.runId === runId) fetchParts()
        return
      }
      window.api.getAgentRun(part.runId).then((run) => {
        if (run?.taskId === taskId) fetchParts()
      })
    })
    const unlistenUpdated = window.api.onAgentPartUpdated((part) => {
      if (runId) {
        if (part.runId === runId) fetchParts()
        return
      }
      window.api.getAgentRun(part.runId).then((run) => {
        if (run?.taskId === taskId) fetchParts()
      })
    })

    return () => {
      unlistenCreated()
      unlistenUpdated()
    }
  }, [taskId, runId])

  const visibleParts = useMemo(() => agentRawProcessParts(parts), [parts])
  const summaryParts = useMemo(() => agentSummaryParts(parts), [parts])
  const liveAssistantPart = useMemo(() => latestLiveAssistantTextPart(parts), [parts])
  const liveAssistantContent = liveAssistantPart
    ? stripInternalToolCallMarkup(liveAssistantPart.output ?? '')
    : ''

  if (loading && visibleParts.length === 0 && !liveAssistantContent) {
    return (
      <div className="flex animate-pulse items-center gap-2 py-1.5 text-sm text-muted-foreground">
        <Loader2 size={12} className="animate-spin text-accent" />
        <span className="font-medium">初始化运行记录</span>
      </div>
    )
  }

  if (visibleParts.length === 0 && !liveAssistantContent) return null

  const lines = agentActivityLines(visibleParts)
  const summary = agentActivitySummary(summaryParts)
  const status = agentActivityStatus(visibleParts)
  const tasks = deriveAgentTasks(visibleParts)
  const duration = formatDuration(parts)
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
    <div className="space-y-4">
      {visibleParts.length > 0 && (
        <>
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
        <div className="mt-2 space-y-3 pl-6">
          <AgentTaskList tasks={tasks} />
          <div className="space-y-1">
            {visibleParts.map((part, index) => {
              const line = lines[index]
              const textContent = isAssistantTextPart(part)
                ? stripInternalToolCallMarkup(part.output ?? '')
                : ''
              const detail = line?.detail || agentPartPreview(part, 120)
              const fullDetail = line?.fullDetail || detail
              const canExpandPart = !textContent && shouldShowAgentActivityDetail(line)
              const isPartExpanded = expandedPartIds.has(part.id)
              return (
                <div
                  key={part.id}
                  className={cn(
                    'rounded-lg px-2 py-1.5 text-sm',
                    part.status === 'error'
                      ? 'bg-danger-soft/55 text-danger'
                      : 'text-muted-foreground'
                  )}
                >
                  {textContent ? (
                    <AssistantMessageBody content={textContent} className="py-0.5" />
                  ) : (
                    <div className="flex min-w-0 items-center gap-2">
                    {canExpandPart ? (
                      <button
                        type="button"
                        onClick={() => togglePart(part.id)}
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground transition hover:bg-black/[0.04] hover:text-foreground"
                        aria-label={isPartExpanded ? '收起过程详情' : '展开过程详情'}
                      >
                        {isPartExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
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
                    {detail && (
                      <span className="min-w-0 flex-1 truncate font-mono text-xs">{detail}</span>
                    )}
                    </div>
                  )}
                  {canExpandPart && isPartExpanded && (
                    <AgentActivityDetail line={line} fallback={fullDetail} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
          )}
        </>
      )}
      {liveAssistantContent && <AssistantMessageBody content={liveAssistantContent} />}
    </div>
  )
}
