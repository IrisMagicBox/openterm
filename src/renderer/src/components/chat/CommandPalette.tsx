import { Command } from 'lucide-react'

interface CommandPaletteProps {
  hostAlias?: string
  value: string
  onChange: (value: string) => void
  onClose: () => void
  onSubmit: () => void
}

export function CommandPalette({
  hostAlias,
  value,
  onChange,
  onClose,
  onSubmit
}: CommandPaletteProps) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/40 backdrop-blur-md animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-[40px] bg-white border border-gray-100 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] p-10 mx-4 animate-in zoom-in-95 slide-in-from-bottom-8 duration-500"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Command size={18} />
          </div>
          <div>
            <h3 className="font-black text-gray-900">自然语言执行</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {hostAlias ? `当前目标终端：${hostAlias}` : '将使用当前话题上下文交给 Agent 处理'}
            </p>
          </div>
        </div>

        <textarea
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              onSubmit()
            }
          }}
          placeholder="例如：检查服务状态，如果没启动就重启并查看最近日志"
          className="w-full h-36 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:ring-4 focus:ring-blue-50 focus:border-blue-300"
        />

        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-gray-400">`Cmd/Ctrl + Enter` 立即执行</p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
            >
              取消
            </button>
            <button
              onClick={onSubmit}
              disabled={!value.trim()}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition"
            >
              交给 Agent
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
