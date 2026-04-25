import { CheckCircle2, Circle, Loader2, ListChecks, XCircle, AlertCircle } from 'lucide-react'
import type { AgentPartStatus } from '../../../shared/types'
import type { AgentTaskItem } from '../lib/agent-task-list'
import { cn } from '../lib/utils'

interface AgentTaskListProps {
  tasks: AgentTaskItem[]
  className?: string
}

function taskIcon(status: AgentPartStatus): React.ReactElement {
  if (status === 'completed') return <CheckCircle2 size={14} className="text-muted-foreground" />
  if (status === 'running' || status === 'pending') {
    return <Loader2 size={14} className="animate-spin text-muted-foreground" />
  }
  if (status === 'error') return <XCircle size={14} className="text-danger" />
  if (status === 'blocked') return <AlertCircle size={14} className="text-warning" />
  return <Circle size={14} className="text-muted-foreground" />
}

export function AgentTaskList({ tasks, className }: AgentTaskListProps): React.ReactElement | null {
  if (tasks.length === 0) return null

  const completedCount = tasks.filter((task) => task.status === 'completed').length

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-border bg-white/86 shadow-[0_10px_30px_rgba(15,23,42,0.04)]',
        className
      )}
    >
      <div className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-muted-foreground">
        <ListChecks size={15} />
        <span>
          共 {tasks.length} 个任务，已完成 {completedCount} 个
        </span>
      </div>
      <ol className="border-t border-border/70 py-2">
        {tasks.map((task, index) => {
          const done = task.status === 'completed'
          return (
            <li key={task.id} className="flex min-w-0 items-center gap-2 px-4 py-1.5">
              {taskIcon(task.status)}
              <span className="w-5 shrink-0 text-right text-sm font-semibold text-foreground">
                {index + 1}.
              </span>
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-sm font-semibold',
                  done ? 'text-muted-foreground line-through' : 'text-foreground'
                )}
                title={task.detail || task.title}
              >
                {task.title}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
