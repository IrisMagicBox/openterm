import { Plus, MessageSquare } from 'lucide-react'

interface ChatEmptyStateProps {
  onCreateTopic: () => void
}

export function ChatEmptyState({ onCreateTopic }: ChatEmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center bg-gray-50/30">
      <div className="w-20 h-20 bg-gradient-to-br from-blue-50 to-indigo-100 text-blue-500 rounded-3xl flex items-center justify-center mb-6 shadow-sm">
        <MessageSquare size={36} />
      </div>
      <h2 className="text-2xl font-black text-gray-900">Agent助手</h2>
      <p className="text-gray-400 text-sm mt-2 mb-8 max-w-xs">
        开启一个新的 AI 会话来自主管理您的基础设施。
      </p>
      <button
        onClick={onCreateTopic}
        className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-500/20 active:scale-95"
      >
        <Plus size={18} /> 新建会话
      </button>
    </div>
  )
}
