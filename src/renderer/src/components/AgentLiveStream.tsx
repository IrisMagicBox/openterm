import { useEffect, useMemo, useRef } from 'react'
import { CheckCircle2, Circle, Eye, Loader2, TerminalSquare, XCircle } from 'lucide-react'
import type { AgentPart } from '../../../shared/types'
import { MarkdownRenderer } from './MarkdownRenderer'
import { agentPartSessionId } from '../lib/terminal-stage'
import { cn } from '../lib/utils'
import {
  agentPartOutput,
  parseAgentPartCommand,
  sanitizeAgentText
} from '../lib/agent-part-preview'

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
  const scrollRef = useRef<HTMLDivElement>(null)
  const visibleParts = useMemo(
    () => sortParts(parts).filter((part) => part.type !== 'usage'),
    [parts]
  )
  const textContent = visibleParts
    .filter((part) => part.type === 'text' && part.role === 'assistant' && part.output)
    .map((part) => part.output)
    .join('\n\n')
  const activityParts = visibleParts.filter((part) => part.type !== 'text')

  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [visibleParts])

  if (visibleParts.length === 0) return null

  return (
    <div className="flex justify-start">
      <div className="glass-panel max-w-[82%] rounded-2xl rounded-bl-md px-4 py-3 text-sm">
        <div ref={scrollRef} className="max-h-[460px] overflow-y-auto pr-1">
          {textContent ? (
            <div className="prose-stream">
              <MarkdownRenderer content={textContent} />
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs font-semibold text-accent">
              <Loader2 size={12} className="animate-spin" />
              正在组织回复...
            </div>
          )}

          {activityParts.length > 0 && (
            <div className="mt-3 space-y-2">
              {activityParts.map((part) => {
                const output = toolOutput(part)
                const input = parseAgentPartCommand(part)
                const isLive = part.status === 'running' || part.metadata?.live === true
                const sessionId = agentPartSessionId(part)
                const isFocused = focusedPartId === part.id
                return (
                  <div
                    key={part.id}
                    className={cn(
                      'rounded-xl border px-3 py-2 transition-all',
                      part.status === 'error'
                        ? 'border-danger/20 bg-danger-soft'
                        : isLive
                          ? 'border-accent/20 bg-accent-soft/60'
                          : 'border-white/60 bg-white/60',
                      isFocused && 'ring-2 ring-accent/25'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {statusIcon(part)}
                      <TerminalSquare size={12} className="text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
                        {part.toolName || part.type}
                      </span>
                      {sessionId && onRevealTerminal && (
                        <button
                          onClick={() => onRevealTerminal(sessionId, part.id)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent/20 bg-white/65 px-2 py-0.5 text-[11px] font-semibold text-accent transition hover:bg-accent-soft"
                        >
                          <Eye size={11} />
                          查看终端
                        </button>
                      )}
                      <span className="text-xs font-semibold text-muted-foreground">
                        {statusLabel(part)}
                      </span>
                    </div>

                    {input && (
                      <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
                        {input}
                      </div>
                    )}

                    {output && <LiveToolOutput output={output} isLive={isLive} />}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
