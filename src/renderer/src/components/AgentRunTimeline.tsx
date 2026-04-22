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
import { agentPartPreview } from '../lib/agent-part-preview'

interface AgentRunTimelineProps {
  taskId: string
}

function iconFor(part: AgentPart): JSX.Element {
  if (part.status === 'running' || part.status === 'pending') {
    return <Loader2 size={12} className="animate-spin text-accent" />
  }
  if (part.status === 'completed') return <CheckCircle2 size={12} className="text-success" />
  if (part.status === 'error') return <XCircle size={12} className="text-danger" />
  if (part.status === 'blocked') return <AlertCircle size={12} className="text-warning" />
  if (part.status === 'cancelled') return <Clock3 size={12} className="text-muted-foreground" />
  return <Circle size={12} className="text-muted-foreground/55" />
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
  return agentPartPreview(part)
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
      <div className="glass-control flex animate-pulse items-center gap-2 rounded-xl border-dashed px-3 py-2">
        <Loader2 size={12} className="animate-spin text-accent" />
        <span className="text-xs font-semibold text-muted-foreground">初始化 Agent Runtime...</span>
      </div>
    )
  }

  if (visibleParts.length === 0) return null

  return (
    <div className="mt-1 space-y-2">
      <div className="flex items-center gap-2 px-1">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-semibold text-muted-foreground">Agent Runtime</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-1.5">
        {visibleParts.map((part, idx) => (
          <div
            key={part.id}
            className={`group relative flex items-start gap-3 rounded-xl border px-3 py-2 pl-4 transition-all ${
              part.status === 'running' || part.status === 'pending'
                ? 'border-accent/25 bg-accent-soft/55'
                : part.status === 'completed'
                  ? 'border-success/20 bg-white/55'
                  : part.status === 'error'
                    ? 'border-danger/25 bg-danger-soft/50'
                    : part.status === 'blocked'
                      ? 'border-warning/25 bg-warning-soft/50'
                      : 'border-white/65 bg-white/45'
            }`}
          >
            <div className="flex-shrink-0 mt-0.5">{iconFor(part)}</div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`truncate text-xs font-semibold ${
                    part.status === 'running' ? 'text-accent' : 'text-foreground'
                  }`}
                >
                  {titleFor(part)}
                </span>
                {part.endedAt && (
                  <span className="font-mono text-xs text-muted-foreground">
                    {Math.max(0, part.endedAt - (part.startedAt || part.createdAt))}ms
                  </span>
                )}
              </div>

              <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <span className="shrink-0">{typeIcon(part)}</span>
                <span className="truncate font-mono">{previewFor(part)}</span>
              </div>
            </div>

            <div className="absolute -left-2 top-2.5 flex h-4 w-4 items-center justify-center rounded-full border border-white/70 bg-white/75 font-mono text-[10px] font-semibold text-muted-foreground shadow-sm transition group-hover:bg-white">
              {idx + 1}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
