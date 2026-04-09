import { useEffect, useState } from 'react'
import { CheckCircle2, Circle, Loader2, XCircle, AlertCircle, Eye } from 'lucide-react'
import { TaskStep } from '../../../shared/types'

interface TaskStepTimelineProps {
  taskId: string
}

export function TaskStepTimeline({ taskId }: TaskStepTimelineProps) {
  const [steps, setSteps] = useState<TaskStep[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSteps = async () => {
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
      <div className="flex items-center gap-2 py-2 px-4 bg-gray-50/50 rounded-xl border border-dashed border-gray-200 animate-pulse">
        <Loader2 size={12} className="text-blue-400 animate-spin" />
        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">初始化任务流水线...</span>
      </div>
    )
  }

  if (steps.length === 0) return null

  return (
    <div className="space-y-2 mt-1">
      <div className="flex items-center gap-2 px-1">
        <div className="h-px bg-gray-100 flex-1" />
        <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">执行流水线</span>
        <div className="h-px bg-gray-100 flex-1" />
      </div>
      
      <div className="space-y-1.5">
        {steps.map((step, idx) => (
          <div 
            key={step.id} 
            className={`group relative flex items-start gap-3 pl-4 border-l-2 transition-all ${
              step.status === 'running' 
                ? 'border-blue-400 bg-blue-50/30' 
                : step.status === 'completed' 
                  ? 'border-emerald-200' 
                  : step.status === 'failed' 
                    ? 'border-red-200 bg-red-50/30'
                    : 'border-gray-100'
            } py-2 px-3 rounded-r-xl`}
          >
            {/* Status Icon */}
            <div className="flex-shrink-0 mt-0.5">
              {step.status === 'running' && <Loader2 size={12} className="text-blue-500 animate-spin" />}
              {step.status === 'completed' && <CheckCircle2 size={12} className="text-emerald-500" />}
              {step.status === 'failed' && <XCircle size={12} className="text-red-500" />}
              {step.status === 'pending' && <Circle size={12} className="text-gray-300" />}
              {step.status === 'blocked' && <AlertCircle size={12} className="text-amber-500" />}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[11px] font-bold truncate ${
                  step.status === 'running' ? 'text-blue-700' : 'text-gray-700'
                }`}>
                  {step.title || (step.type === 'command' ? '执行终端命令' : '思考中')}
                </span>
                {step.status === 'completed' && step.endedAt && (
                   <span className="text-[10px] text-gray-400 font-mono">
                      {Math.max(0, step.endedAt - (step.startedAt || step.createdAt))}ms
                   </span>
                )}
              </div>

              {/* Show command if applicable */}
              {step.type === 'command' && step.content && (
                <div className="mt-1 flex items-center gap-1.5">
                   <div className="bg-gray-900/5 px-2 py-0.5 rounded font-mono text-[9px] text-gray-500 truncate max-w-full italic shrink">
                      $ {step.content.length > 60 ? step.content.slice(0, 57) + '...' : step.content}
                   </div>
                </div>
              )}

              {/* Distilled Output Summary */}
              {step.rawOutput && step.status === 'completed' && (
                <div className="mt-1 flex items-center gap-1 text-[10px] text-gray-400 line-clamp-1 italic">
                   <Eye size={10} className="shrink-0" />
                   {step.rawOutput.length > 100 ? step.rawOutput.slice(0, 97) + '...' : step.rawOutput}
                </div>
              )}
            </div>

            {/* Step Number Badge */}
            <div className="absolute -left-[9px] top-2.5 w-4 h-4 rounded-full bg-white border-2 border-inherit flex items-center justify-center text-[8px] font-black text-gray-400 group-hover:bg-gray-50 transition shadow-sm font-mono">
              {idx + 1}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
