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
        <div className="w-8 h-8 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center animate-pulse">
          <Brain size={14} />
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm max-w-md">
          <div className="space-y-2">
            {steps.map((step, idx) => {
              const status = step.metadata?.agentStatus as string
              const isLast = idx === steps.length - 1
              return (
                <div
                  key={step.id}
                  className={`flex items-center gap-2 text-[11px] ${!isLast ? 'opacity-50' : ''}`}
                >
                  {status === 'thinking' && <Brain size={11} className="text-blue-500" />}
                  {status === 'executing' && <Terminal size={11} className="text-emerald-500" />}
                  {status === 'verifying' && <CheckCircle2 size={11} className="text-amber-500" />}
                  <span
                    className={`font-semibold ${status === 'executing' ? 'text-emerald-600' : status === 'verifying' ? 'text-amber-600' : 'text-blue-600'}`}
                  >
                    {status === 'thinking'
                      ? '思考方案中...'
                      : status === 'executing'
                        ? '正在执行环境指令...'
                        : status === 'verifying'
                          ? '正在验证目标达成情况...'
                          : '处理中...'}
                  </span>
                  {isLast && <Loader2 size={10} className="animate-spin text-gray-400" />}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
