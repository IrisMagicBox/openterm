import { useEffect, useState } from 'react'
import { CheckCircle2, Circle, Loader2, XCircle, AlertCircle, Eye } from 'lucide-react'
import { TaskStep } from '../../../shared/types'

interface TaskStepTimelineProps {
  taskId: string
}

export function TaskStepTimeline({ taskId }: TaskStepTimelineProps): React.ReactElement | null {
  const [steps, setSteps] = useState<TaskStep[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSteps = async (): Promise<void> => {
      try {
        const result = await window.api.getTaskSteps(taskId)
        setSteps(result)
      } catch (err) {
        console.error('Failed to fetch task steps:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchSteps()

    // Real-time updates from Agent Steps
    const unlisten = window.api.onAgentStep((messageWithStep) => {
      // If the step is part of this task, refresh or update
      if (messageWithStep.metadata?.taskId === taskId) {
        fetchSteps()
      }
    })

    return () => unlisten()
  }, [taskId])

  if (loading && steps.length === 0) {
    return (
      <div className="glass-control flex animate-pulse items-center gap-2 rounded-xl border-dashed px-3 py-2">
        <Loader2 size={12} className="animate-spin text-accent" />
        <span className="text-xs font-semibold text-muted-foreground">初始化任务流水线...</span>
      </div>
    )
  }

  if (steps.length === 0) return null

  return (
    <div className="mt-1 space-y-2">
      <div className="flex items-center gap-2 px-1">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-semibold text-muted-foreground">执行流水线</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-1.5">
        {steps.map((step, idx) => (
          <div
            key={step.id}
            className={`group relative flex items-start gap-3 rounded-xl border px-3 py-2 pl-4 transition-[background-color,border-color,box-shadow,transform,opacity] duration-[var(--motion-duration-medium)] ease-[var(--motion-ease-interactive)] ${
              step.status === 'running'
                ? 'border-accent/25 bg-accent-soft/55'
                : step.status === 'completed'
                  ? 'border-success/20 bg-white/55'
                  : step.status === 'failed'
                    ? 'border-danger/25 bg-danger-soft/50'
                    : 'border-white/65 bg-white/45'
            }`}
          >
            {/* Status Icon */}
            <div className="flex-shrink-0 mt-0.5">
              {step.status === 'running' && (
                <Loader2 size={12} className="text-accent animate-spin" />
              )}
              {step.status === 'completed' && <CheckCircle2 size={12} className="text-success" />}
              {step.status === 'failed' && <XCircle size={12} className="text-danger" />}
              {step.status === 'pending' && <Circle size={12} className="text-muted-foreground" />}
              {step.status === 'blocked' && <AlertCircle size={12} className="text-warning" />}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`truncate text-xs font-semibold ${
                    step.status === 'running' ? 'text-accent' : 'text-foreground'
                  }`}
                >
                  {step.title || (step.type === 'command' ? '执行终端命令' : '思考中')}
                </span>
                {step.status === 'completed' && step.endedAt && (
                  <span className="font-mono text-xs text-muted-foreground">
                    {Math.max(0, step.endedAt - (step.startedAt || step.createdAt))}ms
                  </span>
                )}
              </div>

              {/* Show command if applicable */}
              {step.type === 'command' && step.content && (
                <div className="mt-1 flex items-center gap-1.5">
                  <div className="max-w-full shrink truncate rounded-lg border border-white/65 bg-white/55 px-2 py-0.5 font-mono text-xs text-muted-foreground">
                    $ {step.content.length > 60 ? step.content.slice(0, 57) + '...' : step.content}
                  </div>
                </div>
              )}

              {/* Distilled Output Summary */}
              {step.rawOutput && step.status === 'completed' && (
                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground line-clamp-1">
                  <Eye size={10} className="shrink-0" />
                  {step.rawOutput.length > 100
                    ? step.rawOutput.slice(0, 97) + '...'
                    : step.rawOutput}
                </div>
              )}
            </div>

            {/* Step Number Badge */}
            <div className="absolute -left-2 top-2.5 flex h-4 w-4 items-center justify-center rounded-full border border-white/70 bg-white/75 font-mono text-[10px] font-semibold text-muted-foreground shadow-sm transition group-hover:bg-white">
              {idx + 1}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
