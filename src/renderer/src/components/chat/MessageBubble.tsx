import {
  ChevronDown,
  ChevronRight,
  Terminal as TerminalIcon,
  CheckCircle2,
  Zap,
  Loader2
} from 'lucide-react'
import { Message, Host } from '../../../../shared/types'
import { stripInternalToolCallMarkup } from '../../../../shared/internal-tool-call-markup'
import logo from '../../assets/logo.png'
import { AgentRunTimeline } from '../AgentRunTimeline'
import { MarkdownRenderer } from '../MarkdownRenderer'
import { Badge } from '../ui'

interface MessageBubbleProps {
  message: Message
  expandedThoughts: Record<string, boolean>
  onToggleThought: (msgId: string) => void
}

export function MessageBubble({
  message,
  expandedThoughts,
  onToggleThought
}: MessageBubbleProps): React.ReactElement {
  const msg = message
  const isExpanded = !!expandedThoughts[msg.id]
  const assistantContent =
    msg.role === 'assistant' || msg.role === 'system'
      ? stripInternalToolCallMarkup(msg.content)
      : msg.content

  if (msg.role === 'user') {
    return (
      <div className="mx-auto flex w-full max-w-[920px] justify-end">
        <div className="max-w-[74%] cursor-auto select-text rounded-[24px] bg-black/[0.055] px-5 py-3 text-[var(--chat-text-size)] leading-[var(--chat-line-height)] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] no-drag">
          <div className="whitespace-pre-wrap">{msg.content}</div>
        </div>
      </div>
    )
  }

  if (msg.role === 'tool') {
    return (
      <div className="mx-auto w-full max-w-[860px]">
        <button
          onClick={() => onToggleThought(msg.id)}
          className="flex w-full items-center gap-2 py-1.5 text-left text-sm text-muted-foreground transition hover:text-foreground no-drag"
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <TerminalIcon size={14} />
          <span className="font-medium">终端输出</span>
          {msg.metadata?.isVerifying && (
            <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">
              已验证
            </span>
          )}
        </button>
        {isExpanded ? (
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-surface-muted px-3 py-2 font-mono text-xs leading-relaxed text-muted-foreground">
            {msg.content}
          </pre>
        ) : (
          <p className="pl-6 text-xs text-muted-foreground/70">输出已同步到终端视图</p>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[860px] cursor-auto select-text no-drag">
      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <span className="shrink-0 font-medium">
          {msg.role === 'system' ? '系统' : '已处理'} {formatMessageClock(msg.timestamp)}
        </span>
        <div className="h-px flex-1 bg-border/80" />
      </div>

      <div className="space-y-4 text-[var(--chat-text-size)] leading-[var(--chat-line-height)] text-foreground">
        {msg.metadata?.taskId && <AgentRunTimeline taskId={msg.metadata.taskId} />}

        <div className="space-y-3">
          {msg.metadata?.memoryRecalled && (
            <Badge variant="accent" className="mb-1 w-fit">
              <Zap size={10} /> 已调取记忆
            </Badge>
          )}
          {msg.metadata?.isVerifying && (
            <Badge variant="success" className="mb-1 w-fit">
              <CheckCircle2 size={10} /> 已验证
            </Badge>
          )}
          {assistantContent && <MarkdownRenderer content={assistantContent} />}
        </div>

        {msg.toolCalls && msg.toolCalls.length > 0 && (
          <div className="space-y-1.5 text-sm text-muted-foreground">
            {msg.toolCalls.map((tool) => {
              let cmd = ''
              try {
                cmd = JSON.parse(tool.function.arguments).command
              } catch {
                cmd = tool.function.name
              }
              return (
                <div key={tool.id} className="flex min-w-0 items-center gap-2">
                  <TerminalIcon size={14} className="shrink-0" />
                  <span className="shrink-0">调用</span>
                  <code className="truncate rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[13px] text-foreground">
                    {cmd || tool.function.name}
                  </code>
                  <CheckCircle2 size={13} className="shrink-0 text-success" />
                </div>
              )
            })}
          </div>
        )}

        {msg.thought && (
          <div>
            <button
              onClick={() => onToggleThought(msg.id)}
              className="flex items-center gap-2 py-1 text-sm font-medium text-muted-foreground transition hover:text-foreground no-drag"
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Zap size={13} />
              推理
            </button>
            {isExpanded && (
              <div className="mt-2 whitespace-pre-wrap rounded-lg bg-surface-muted px-3 py-2 text-sm leading-7 text-muted-foreground">
                {msg.thought}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function ThinkingIndicator({ animationKey }: { animationKey: number }): React.ReactElement {
  return (
    <div key={`thinking-${animationKey}`} className="mx-auto w-full max-w-[860px]">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Loader2 size={15} className="animate-spin" />
        <span>正在处理</span>
      </div>
    </div>
  )
}

export function EmptyState({
  topicHosts,
  onMentionHost
}: {
  topicHosts: Host[]
  onMentionHost: (alias: string) => void
}): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center max-w-xs mx-auto space-y-5">
      <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-black/[0.06] bg-white p-1 shadow-sm">
        <img src={logo} alt="OpenTerm" className="w-full h-full object-contain" />
      </div>
      <div>
        <h3 className="font-bold text-foreground">准备就绪</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          描述您想执行的操作。使用 <span className="font-semibold text-accent">@别名</span>{' '}
          来指定特定主机。
        </p>
      </div>
      {topicHosts.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center">
          {topicHosts.slice(0, 3).map((h) => (
            <button
              key={h.id}
              onClick={() => onMentionHost(h.alias)}
              className="rounded-full border border-black/[0.06] bg-white px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-black/[0.02]"
            >
              @{h.alias}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function formatMessageClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
}
