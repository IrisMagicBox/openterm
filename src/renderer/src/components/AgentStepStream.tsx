import { Brain, Terminal, CheckCircle2, Loader2 } from 'lucide-react'
import { Message } from '../../../shared/types'

interface AgentStepStreamProps {
  steps: Message[]
}

export function AgentStepStream({ steps }: AgentStepStreamProps) {
  if (steps.length === 0) return null

  return (
    <div className="flex justify-start">
      <div className="flex items-end gap-2.5">
        <div className="flex h-8 w-8 animate-pulse items-center justify-center rounded-xl border border-white/75 bg-white/70 text-accent shadow-sm backdrop-blur-xl">
          <Brain size={14} />
        </div>
        <div className="glass-panel max-w-md rounded-2xl rounded-bl-md px-4 py-3">
          <div className="space-y-2">
            {steps.map((step, idx) => {
              const status = step.metadata?.agentStatus as string
              const isLast = idx === steps.length - 1
              return (
                <div
                  key={step.id}
                  className={`flex items-center gap-2 text-[11px] ${!isLast ? 'opacity-50' : ''}`}
                >
                  {status === 'thinking' && <Brain size={11} className="text-accent" />}
                  {status === 'executing' && <Terminal size={11} className="text-success" />}
                  {status === 'verifying' && <CheckCircle2 size={11} className="text-warning" />}
                  <span
                    className={`font-semibold ${status === 'executing' ? 'text-success' : status === 'verifying' ? 'text-warning' : 'text-accent'}`}
                  >
                    {status === 'thinking'
                      ? '思考方案中...'
                      : status === 'executing'
                        ? '正在执行环境指令...'
                        : status === 'verifying'
                          ? '正在验证目标达成情况...'
                          : '处理中...'}
                  </span>
                  {isLast && <Loader2 size={10} className="animate-spin text-muted-foreground" />}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
