import { useEffect, useMemo, useRef } from 'react'
import { CheckCircle2, Circle, Loader2, TerminalSquare, XCircle } from 'lucide-react'
import type { AgentPart } from '../../../shared/types'
import { MarkdownRenderer } from './MarkdownRenderer'

interface AgentLiveStreamProps {
  parts: AgentPart[]
}

function sortParts(parts: AgentPart[]): AgentPart[] {
  return [...parts].sort((a, b) => a.orderIndex - b.orderIndex || a.createdAt - b.createdAt)
}

function parseToolInput(part: AgentPart): string {
  if (!part.input) return ''
  try {
    const parsed = JSON.parse(part.input) as Record<string, unknown>
    if (typeof parsed.command === 'string') return parsed.command
    if (typeof parsed.path === 'string') return parsed.path
    return JSON.stringify(parsed)
  } catch {
    return part.input
  }
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
  return part.error || metadataString(part, 'liveOutputPreview') || part.output || ''
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
      className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap rounded-md bg-workspace px-3 py-2 font-mono text-xs leading-relaxed text-workspace-foreground"
    >
      {output}
    </pre>
  )
}

export function AgentLiveStream({ parts }: AgentLiveStreamProps): React.ReactElement | null {
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
      <div className="max-w-[82%] rounded-lg rounded-bl-sm border border-border bg-surface-muted px-4 py-3 text-sm shadow-sm">
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
                const input = parseToolInput(part)
                const isLive = part.status === 'running' || part.metadata?.live === true
                return (
                  <div
                    key={part.id}
                    className={`rounded-md border px-3 py-2 ${
                      part.status === 'error'
                        ? 'border-danger/20 bg-danger-soft'
                        : isLive
                          ? 'border-accent/20 bg-accent-soft/50'
                          : 'border-border bg-surface'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {statusIcon(part)}
                      <TerminalSquare size={12} className="text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
                        {part.toolName || part.type}
                      </span>
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
