import {
  ChevronDown,
  ChevronRight,
  Terminal as TerminalIcon,
  CheckCircle2,
  Zap,
  Bot,
  User
} from 'lucide-react'
import { Message, Host } from '../../../../shared/types'
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

  return (
    <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[82%] flex ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} items-end gap-2.5`}
      >
        <div
          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md shadow-sm backdrop-blur-xl ${msg.role === 'user' ? 'bg-accent text-white shadow-accent/20' : 'border border-white/70 bg-white/60 text-muted-foreground'}`}
        >
          {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
        </div>
        <div className="flex flex-col gap-2 min-w-0">
          {msg.thought && (
            <div className="overflow-hidden rounded-lg border border-warning/20 bg-warning-soft">
              <button
                onClick={() => onToggleThought(msg.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-warning transition hover:bg-warning/10"
              >
                {expandedThoughts[msg.id] ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                <Zap size={11} />
                助手推理
              </button>
              {expandedThoughts[msg.id] && (
                <div className="border-t border-warning/20 px-3 pb-3 text-xs leading-relaxed text-warning">
                  {msg.thought}
                </div>
              )}
            </div>
          )}

          {msg.metadata?.taskId && <AgentRunTimeline taskId={msg.metadata.taskId} />}

          {msg.toolCalls && msg.toolCalls.length > 0 && (
            <div className="space-y-1.5">
              {msg.toolCalls.map((tool) => {
                let cmd = ''
                try {
                  cmd = JSON.parse(tool.function.arguments).command
                } catch {
                  cmd = tool.function.name
                }
                return (
                  <div
                    key={tool.id}
                    className="flex items-center gap-2.5 rounded-md border border-success/20 bg-success-soft px-3 py-2 font-mono text-xs font-semibold text-success"
                  >
                    <TerminalIcon size={11} className="flex-shrink-0 text-success" />
                    <span className="truncate">{cmd || tool.function.name}</span>
                    <CheckCircle2 size={11} className="ml-auto flex-shrink-0 text-success" />
                  </div>
                )
              })}
            </div>
          )}

          <div
            className={`cursor-auto select-text rounded-lg px-4 py-3 text-sm leading-relaxed no-drag ${
              msg.role === 'user'
                ? 'rounded-br-sm bg-accent text-white shadow-sm shadow-accent/15'
                : msg.role === 'tool'
                  ? 'max-w-full overflow-x-auto rounded-bl-sm border border-workspace-border bg-workspace'
                  : 'glass-panel rounded-bl-sm text-foreground'
            } ${msg.metadata?.isVerifying ? 'ring-2 ring-success/20' : ''}`}
          >
            {msg.role === 'user' ? (
              <div className="whitespace-pre-wrap">{msg.content}</div>
            ) : msg.role === 'tool' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => onToggleThought(msg.id)}
                    className="flex items-center gap-2 text-xs font-semibold text-emerald-400/75 transition hover:text-emerald-400 no-drag"
                  >
                    {expandedThoughts[msg.id] ? (
                      <ChevronDown size={10} />
                    ) : (
                      <ChevronRight size={10} />
                    )}
                    终端原始输出
                  </button>
                  {msg.metadata?.isVerifying && (
                    <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-500">
                      验证凭证
                    </span>
                  )}
                </div>
                {expandedThoughts[msg.id] && (
                  <div className="mt-2 whitespace-pre-wrap break-all border-t border-workspace-border pt-2 font-mono text-xs text-emerald-400">
                    {msg.content}
                  </div>
                )}
                {!expandedThoughts[msg.id] && (
                  <div className="text-xs text-emerald-400/50">
                    输出内容已提纯并同步至终端视图。点击查看原始文本...
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {msg.metadata?.memoryRecalled && (
                  <Badge variant="accent" className="mb-1 w-fit">
                    <Zap size={10} /> 已调取经验记忆
                  </Badge>
                )}
                {msg.metadata?.isVerifying && (
                  <Badge variant="success" className="mb-1 w-fit">
                    <CheckCircle2 size={10} /> 任务目标验证通过
                  </Badge>
                )}
                <MarkdownRenderer content={msg.content} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function ThinkingIndicator({ animationKey }: { animationKey: number }): React.ReactElement {
  return (
    <div key={`thinking-${animationKey}`} className="flex justify-start">
      <div className="flex items-end gap-2.5">
        <div className="flex h-8 w-8 animate-pulse items-center justify-center rounded-md border border-white/70 bg-white/70 text-accent shadow-sm backdrop-blur-xl">
          <Bot size={14} />
        </div>
        <div className="glass-panel flex items-center gap-2 rounded-lg rounded-bl-sm px-4 py-3">
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce [animation-delay:300ms]" />
          </div>
          <span className="ml-1 text-xs font-semibold text-accent/60">思考并分析中...</span>
        </div>
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
      <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg">
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
              className="glass-control rounded-md px-3 py-1.5 text-xs font-semibold text-accent transition hover:border-accent/25 hover:bg-accent-soft/60"
            >
              @{h.alias}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
