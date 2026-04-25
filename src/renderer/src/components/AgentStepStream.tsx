import { Brain, Terminal, CheckCircle2, Loader2 } from 'lucide-react'
import { Message } from '../../../shared/types'

interface AgentStepStreamProps {
  steps: Message[]
}

export function AgentStepStream({ steps }: AgentStepStreamProps): React.ReactElement | null {
  if (steps.length === 0) return null

  return (
    <div className="mx-auto w-full max-w-[860px]">
      <div className="space-y-1.5">
        {steps.map((step, idx) => {
          const status = step.metadata?.agentStatus as string
          const isLast = idx === steps.length - 1
          return (
            <div
              key={step.id}
              className={`flex items-center gap-2 text-sm text-muted-foreground ${!isLast ? 'opacity-55' : ''}`}
            >
              {status === 'thinking' && <Brain size={14} />}
              {status === 'executing' && <Terminal size={14} />}
              {status === 'verifying' && <CheckCircle2 size={14} />}
              <span className="font-medium">
                {status === 'thinking'
                  ? '思考中'
                  : status === 'executing'
                    ? '正在运行'
                    : status === 'verifying'
                      ? '正在验证'
                      : '处理中'}
              </span>
              {isLast && <Loader2 size={13} className="animate-spin" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
