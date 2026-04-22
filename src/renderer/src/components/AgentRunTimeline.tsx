import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Clock3,
  FileText,
  KeyRound,
  Loader2,
  TerminalSquare,
  XCircle
} from 'lucide-react'
import type { JSX } from 'react'
import { AgentPart } from '../../../shared/types'

interface AgentRunTimelineProps {
  taskId: string
}

function iconFor(part: AgentPart): JSX.Element {
  if (part.status === 'running' || part.status === 'pending') {
    return <Loader2 size={12} className="text-blue-500 animate-spin" />
  }
  if (part.status === 'completed') return <CheckCircle2 size={12} className="text-emerald-500" />
  if (part.status === 'error') return <XCircle size={12} className="text-red-500" />
  if (part.status === 'blocked') return <AlertCircle size={12} className="text-amber-500" />
  if (part.status === 'cancelled') return <Clock3 size={12} className="text-gray-400" />
  return <Circle size={12} className="text-gray-300" />
}

function typeIcon(part: AgentPart): JSX.Element {
  if (part.type === 'tool') return <TerminalSquare size={11} />
  if (part.type === 'permission') return <KeyRound size={11} />
  return <FileText size={11} />
}

function titleFor(part: AgentPart): string {
  if (part.type === 'tool') return part.toolName ? `工具: ${part.toolName}` : '工具调用'
  if (part.type === 'permission') return '权限审批'
  if (part.type === 'compaction') return '上下文压缩'
  if (part.type === 'subagent') return '子代理'
  if (part.type === 'usage') return '用量记录'
  if (part.type === 'error') return '错误'
  if (part.role === 'user') return '用户输入'
  return '代理输出'
}

function previewFor(part: AgentPart): string {
  const value = part.error || part.output || part.input || ''
  return value.length > 120 ? `${value.slice(0, 117)}...` : value
}

export function AgentRunTimeline({ taskId }: AgentRunTimelineProps): JSX.Element | null {
  const [parts, setParts] = useState<AgentPart[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchParts = async (): Promise<void> => {
      try {
        const result = await window.api.getAgentTaskParts(taskId)
        setParts(result)
      } finally {
        setLoading(false)
      }
    }

    fetchParts()
    const unlistenCreated = window.api.onAgentPartCreated((part) => {
      window.api.getAgentRun(part.runId).then((run) => {
        if (run?.taskId === taskId) fetchParts()
      })
    })
    const unlistenUpdated = window.api.onAgentPartUpdated((part) => {
      window.api.getAgentRun(part.runId).then((run) => {
        if (run?.taskId === taskId) fetchParts()
      })
    })

    return () => {
      unlistenCreated()
      unlistenUpdated()
    }
  }, [taskId])

  const visibleParts = useMemo(
    () => parts.filter((part) => part.type !== 'usage' || part.metadata?.totalTokens),
    [parts]
  )

  if (loading && visibleParts.length === 0) {
    return (
      <div className="flex animate-pulse items-center gap-2 rounded-lg border border-dashed border-border bg-surface-muted px-3 py-2">
        <Loader2 size={12} className="animate-spin text-accent" />
        <span className="text-xs font-semibold text-muted-foreground">初始化 Agent Runtime...</span>
      </div>
    )
  }

  if (visibleParts.length === 0) return null

  return (
    <div className="space-y-2 mt-1">
      <div className="flex items-center gap-2 px-1">
        <div className="h-px bg-border flex-1" />
        <span className="text-xs font-semibold text-muted-foreground">Agent Runtime</span>
        <div className="h-px bg-border flex-1" />
      </div>

      <div className="space-y-1.5">
        {visibleParts.map((part, idx) => (
          <div
            key={part.id}
            className={`group relative flex items-start gap-3 pl-4 border-l-2 transition-all ${
              part.status === 'running' || part.status === 'pending'
                ? 'border-accent bg-accent-soft/40'
                : part.status === 'completed'
                  ? 'border-success/30'
                  : part.status === 'error'
                    ? 'border-danger/30 bg-danger-soft/40'
                    : part.status === 'blocked'
                      ? 'border-warning/30 bg-warning-soft/40'
                      : 'border-border'
            } py-2 px-3 rounded-r-lg`}
          >
            <div className="flex-shrink-0 mt-0.5">{iconFor(part)}</div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-[11px] font-bold truncate ${
                    part.status === 'running' ? 'text-accent' : 'text-foreground'
                  } text-xs font-semibold`}
                >
                  {titleFor(part)}
                </span>
                {part.endedAt && (
                  <span className="text-xs text-muted-foreground font-mono">
                    {Math.max(0, part.endedAt - (part.startedAt || part.createdAt))}ms
                  </span>
                )}
              </div>

              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
                <span className="shrink-0">{typeIcon(part)}</span>
                <span className="truncate font-mono">{previewFor(part)}</span>
              </div>
            </div>

            <div className="absolute -left-[9px] top-2.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-inherit bg-surface text-[11px] font-semibold text-muted-foreground transition group-hover:bg-surface-muted font-mono">
              {idx + 1}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
