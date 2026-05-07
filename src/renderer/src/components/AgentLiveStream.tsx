import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Eye,
  Loader2,
  TerminalSquare,
  XCircle
} from 'lucide-react'
import type { AgentPart } from '../../../shared/types'
import { stripInternalToolCallMarkup } from '../../../shared/internal-tool-call-markup'
import { MarkdownRenderer } from './MarkdownRenderer'
import { AgentTaskList } from './AgentTaskList'
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
  agentActivitySummary
} from '../lib/agent-activity-summary'
import { deriveAgentTasks } from '../lib/agent-task-list'

interface AgentLiveStreamProps {
  parts: AgentPart[]
  onRevealTerminal?: (sessionId: string, partId?: string) => void
  focusedPartId?: string | null
}

function sortParts(parts: AgentPart[]): AgentPart[] {
  return [...parts].sort((a, b) => a.orderIndex - b.orderIndex || a.createdAt - b.createdAt)
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

function LiveToolOutput({
  output,
  isLive
}: {
  output: string
  isLive: boolean
}): React.ReactElement {
  const outputRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    const node = outputRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [output])

  return (
    <pre
      ref={outputRef}
      aria-live={isLive ? 'polite' : undefined}
      className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap rounded-lg border border-workspace-border bg-workspace/85 px-3 py-2 font-mono text-xs leading-relaxed text-workspace-foreground"
    >
      {output}
    </pre>
  )
}

export function AgentLiveStream({
  parts,
  onRevealTerminal,
  focusedPartId
}: AgentLiveStreamProps): React.ReactElement | null {
  const [expanded, setExpanded] = useState(true)
  const visibleParts = useMemo(() => sortParts(parts).filter(shouldShowAgentLivePart), [parts])
  const textContent = stripInternalToolCallMarkup(
    visibleParts
      .filter((part) => part.type === 'text' && part.role === 'assistant' && part.output)
      .map((part) => part.output)
      .join('\n\n')
  )
  const activityParts = visibleParts.filter((part) => part.type !== 'text')
  const activityLines = agentActivityLines(activityParts)
  const summary = agentActivitySummary(activityParts)
  const status = agentActivityStatus(activityParts)
  const tasks = deriveAgentTasks(activityParts)

  return (
    <div className="mx-auto w-full max-w-[860px]">
      <div>
        {activityParts.length > 0 && (
          <div className="mb-4">
            <button
              onClick={() => setExpanded((value) => !value)}
              className="flex w-full items-center gap-2 py-1.5 text-left text-sm text-muted-foreground transition hover:text-foreground no-drag"
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span className="font-medium">{status}</span>
              {summary && <span>{summary}</span>}
            </button>

            {expanded && (
              <div className="mt-1 space-y-1 pl-6">
                {activityParts.map((part, index) => {
                  const line = activityLines[index]
                  const output = toolOutput(part)
                  const input = parseAgentPartCommand(part)
                  const isLive = part.status === 'running' || part.metadata?.live === true
                  const sessionId = agentPartSessionId(part)
                  const isFocused = focusedPartId === part.id
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
                      <div className="flex min-w-0 items-center gap-2 text-sm">
                        {statusIcon(part)}
                        <TerminalSquare size={13} className="shrink-0 text-muted-foreground" />
                        <span className="shrink-0 font-medium">{line?.label || '处理'}</span>
                        {(line?.detail || input) && (
                          <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                            {line?.detail || input}
                          </span>
                        )}
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

                      {output && <LiveToolOutput output={output} isLive={isLive} />}
                    </div>
                  )
                })}
              </div>
            )}
            <AgentTaskList tasks={tasks} className="mt-3" />
          </div>
        )}

        {textContent ? (
          <div className="text-[var(--chat-text-size)] leading-[var(--chat-line-height)] text-foreground">
            <MarkdownRenderer content={textContent} />
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Loader2 size={15} className="animate-spin" />
            正在组织回复
          </div>
        )}
      </div>
    </div>
  )
}
