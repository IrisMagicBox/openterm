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
import { TaskStepTimeline } from '../TaskStepTimeline'
import { MarkdownRenderer } from '../MarkdownRenderer'

interface MessageBubbleProps {
  message: Message
  expandedThoughts: Record<string, boolean>
  onToggleThought: (msgId: string) => void
}

export function MessageBubble({ message, expandedThoughts, onToggleThought }: MessageBubbleProps) {
  const msg = message

  return (
    <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] flex ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} items-end gap-2.5`}
      >
        <div
          className={`w-8 h-8 rounded-2xl flex-shrink-0 flex items-center justify-center shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}
        >
          {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
        </div>
        <div className="flex flex-col gap-2 min-w-0">
          {msg.thought && (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl overflow-hidden">
              <button
                onClick={() => onToggleThought(msg.id)}
                className="flex items-center gap-2 px-4 py-2.5 text-[11px] font-black text-amber-600 uppercase tracking-widest hover:bg-amber-100/50 transition w-full"
              >
                {expandedThoughts[msg.id] ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                <Zap size={11} />
                助手推理
              </button>
              {expandedThoughts[msg.id] && (
                <div className="px-4 pb-3 text-xs text-amber-800/80 italic leading-relaxed border-t border-amber-100">
                  {msg.thought}
                </div>
              )}
            </div>
          )}

          {msg.metadata?.taskId && <TaskStepTimeline taskId={msg.metadata.taskId} />}

          {msg.toolCalls && msg.toolCalls.length > 0 && (
            <div className="space-y-1.5">
              {msg.toolCalls.map((tool) => {
                let cmd = ''
                try {
                  cmd = JSON.parse(tool.function.arguments).command
                } catch {}
                return (
                  <div
                    key={tool.id}
                    className="flex items-center gap-2.5 text-[11px] font-mono font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-3.5 py-2 rounded-xl"
                  >
                    <TerminalIcon size={11} className="text-emerald-500 flex-shrink-0" />
                    <span className="truncate">{cmd || tool.function.name}</span>
                    <CheckCircle2 size={11} className="ml-auto text-emerald-500 flex-shrink-0" />
                  </div>
                )
              })}
            </div>
          )}

          <div
            className={`px-5 py-3.5 text-sm leading-relaxed rounded-2xl shadow-sm select-text no-drag cursor-auto ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white rounded-br-sm'
                : msg.role === 'tool'
                  ? 'bg-gray-900 border border-gray-800 rounded-bl-sm max-w-full overflow-x-auto shadow-xl'
                  : 'bg-gray-50 border border-gray-100 text-gray-800 rounded-bl-sm'
            } ${msg.metadata?.isVerifying ? 'ring-2 ring-emerald-500/20 bg-emerald-50/10' : ''}`}
          >
            {msg.role === 'user' ? (
              <div className="whitespace-pre-wrap">{msg.content}</div>
            ) : msg.role === 'tool' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => onToggleThought(msg.id)}
                    className="flex items-center gap-2 text-[10px] font-black text-emerald-400/70 hover:text-emerald-400 transition uppercase tracking-widest no-drag"
                  >
                    {expandedThoughts[msg.id] ? (
                      <ChevronDown size={10} />
                    ) : (
                      <ChevronRight size={10} />
                    )}
                    终端原始输出
                  </button>
                  {msg.metadata?.isVerifying && (
                    <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full uppercase tracking-widest">
                      验证凭证
                    </span>
                  )}
                </div>
                {expandedThoughts[msg.id] && (
                  <div className="mt-2 border-t border-gray-800 pt-2 break-all text-emerald-400 font-mono text-[11px] whitespace-pre-wrap">
                    {msg.content}
                  </div>
                )}
                {!expandedThoughts[msg.id] && (
                  <div className="text-[10px] italic text-emerald-400/40">
                    输出内容已提纯并同步至终端视图。点击查看原始文本...
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {msg.metadata?.memoryRecalled && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-100 text-blue-700 w-fit rounded-full text-[10px] font-black tracking-widest uppercase mb-1">
                    <Zap size={10} /> 已调取经验记忆
                  </div>
                )}
                {msg.metadata?.isVerifying && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 text-emerald-700 w-fit rounded-full text-[10px] font-black tracking-widest uppercase mb-1">
                    <CheckCircle2 size={10} /> 任务目标验证通过
                  </div>
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

export function ThinkingIndicator({ animationKey }: { animationKey: number }) {
  return (
    <div key={`thinking-${animationKey}`} className="flex justify-start">
      <div className="flex items-end gap-2.5">
        <div className="w-8 h-8 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center animate-pulse">
          <Bot size={14} />
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-2xl rounded-bl-sm px-5 py-4 flex items-center gap-2 shadow-sm">
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce [animation-delay:300ms]" />
          </div>
          <span className="text-[10px] font-black text-blue-600/50 uppercase tracking-widest ml-1">
            思考并分析中...
          </span>
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
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center max-w-xs mx-auto space-y-5">
      <div className="w-16 h-16 rounded-3xl flex items-center justify-center overflow-hidden">
        <img src={logo} alt="OpenTerm" className="w-full h-full object-contain" />
      </div>
      <div>
        <h3 className="font-black text-gray-900">准备就绪</h3>
        <p className="text-sm text-gray-400 mt-2 leading-relaxed">
          描述您想执行的操作。使用 <span className="font-bold text-blue-500">@别名</span>{' '}
          来指定特定主机。
        </p>
      </div>
      {topicHosts.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center">
          {topicHosts.slice(0, 3).map((h) => (
            <button
              key={h.id}
              onClick={() => onMentionHost(h.alias)}
              className="px-3 py-1.5 border border-blue-100 bg-blue-50 text-blue-600 text-xs font-bold rounded-full hover:bg-blue-100 transition"
            >
              @{h.alias}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
