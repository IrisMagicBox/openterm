import { Plus, MessageSquare } from 'lucide-react'
import { Button } from '../ui'

interface ChatEmptyStateProps {
  onCreateTopic: () => void
}

export function ChatEmptyState({ onCreateTopic }: ChatEmptyStateProps): React.ReactElement {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center bg-app">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-lg bg-accent-soft text-accent">
        <MessageSquare size={36} />
      </div>
      <h2 className="text-xl font-bold text-foreground">Agent助手</h2>
      <p className="mb-6 mt-2 max-w-xs text-sm text-muted-foreground">
        开启一个新的 AI 会话来自主管理您的基础设施。
      </p>
      <Button onClick={onCreateTopic} variant="primary" size="lg">
        <Plus size={18} /> 新建会话
      </Button>
    </div>
  )
}
