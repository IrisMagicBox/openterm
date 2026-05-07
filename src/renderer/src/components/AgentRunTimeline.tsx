import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import type { JSX } from 'react'
import type { AgentPart } from '../../../shared/types'
import { AgentTaskList } from './AgentTaskList'
import {
  agentActivityLines,
  agentActivityStatus,
  agentActivitySummary
} from '../lib/agent-activity-summary'
import { deriveAgentTasks } from '../lib/agent-task-list'

interface AgentRunTimelineProps {
  taskId: string
}

export function AgentRunTimeline({ taskId }: AgentRunTimelineProps): JSX.Element | null {
  const [parts, setParts] = useState<AgentPart[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

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
    () => parts.filter((part) => part.type !== 'usage' && part.type !== 'text'),
    [parts]
  )

  if (loading && visibleParts.length === 0) {
    return (
      <div className="flex animate-pulse items-center gap-2 py-1.5 text-sm text-muted-foreground">
        <Loader2 size={12} className="animate-spin text-accent" />
        <span className="font-medium">初始化运行记录</span>
      </div>
    )
  }

  if (visibleParts.length === 0) return null

  const lines = agentActivityLines(visibleParts)
  const summary = agentActivitySummary(visibleParts)
  const status = agentActivityStatus(visibleParts)
  const tasks = deriveAgentTasks(visibleParts)

  return (
    <div>
      <button
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-2 py-1.5 text-left text-sm text-muted-foreground transition hover:text-foreground no-drag"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="font-medium">{status}</span>
        {summary && <span>{summary}</span>}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 pl-6">
          <div className="space-y-1">
            {lines.map((line) => (
              <div
                key={line.id}
                className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground"
              >
                <span className="shrink-0 font-medium">{line.label}</span>
                {line.detail && (
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{line.detail}</span>
                )}
              </div>
            ))}
          </div>
          <AgentTaskList tasks={tasks} />
        </div>
      )}
    </div>
  )
}
