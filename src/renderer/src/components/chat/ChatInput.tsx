import { Send, Clock, Hash, Server, ArrowRight, X } from 'lucide-react'
import type { Host } from '../../../../shared/types'

interface ChatInputProps {
  inputValue: string
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onSend: () => void
  thinking: boolean
  messageQueue: { id: string; content: string }[]
  onRemoveFromQueue: (id: string) => void
  onClearQueue: () => void
  showMentions: boolean
  filteredHosts: Host[]
  onInsertMention: (host: Host) => void
}

export function ChatInput({
  inputValue,
  onInputChange,
  onSend,
  thinking,
  messageQueue,
  onRemoveFromQueue,
  onClearQueue,
  showMentions,
  filteredHosts,
  onInsertMention
}: ChatInputProps) {
  return (
    <div className="px-7 py-5 border-t border-gray-100 relative">
      {showMentions && filteredHosts.length > 0 && (
        <div className="absolute bottom-full left-7 mb-2 w-72 bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden z-10">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
            <Hash size={10} /> 提及主机
          </div>
          {filteredHosts.map((host) => (
            <button
              key={host.id}
              className="w-full px-4 py-3 hover:bg-blue-50 flex items-center gap-3 text-left transition"
              onClick={() => onInsertMention(host)}
            >
              <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500">
                <Server size={15} />
              </div>
              <div>
                <div className="text-sm font-bold text-gray-900">{host.alias}</div>
                <div className="text-[11px] text-gray-400 font-mono">
                  {host.ip}:{host.port || 22}
                </div>
              </div>
              <ArrowRight size={14} className="ml-auto text-gray-300" />
            </button>
          ))}
        </div>
      )}

      {messageQueue.length > 0 && (
        <div className="px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl mx-4 mb-2">
          <div className="flex items-center gap-2 mb-1.5">
            <Clock size={11} className="text-amber-500" />
            <span className="text-[11px] font-semibold text-amber-700">
              {messageQueue.length} 条消息等待发送
            </span>
            <button
              onClick={onClearQueue}
              className="ml-auto text-[10px] font-bold text-amber-500 hover:text-amber-700 transition"
            >
              清空全部
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {messageQueue.map((msg) => (
              <span
                key={msg.id}
                className="inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-100 pl-2 pr-1 py-0.5 rounded-lg max-w-[160px]"
              >
                <span className="truncate">{msg.content}</span>
                <button
                  onClick={() => onRemoveFromQueue(msg.id)}
                  className="flex-shrink-0 w-4 h-4 flex items-center justify-center rounded-full hover:bg-amber-200 transition"
                >
                  <X size={9} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 bg-gray-50 border rounded-2xl px-3 py-2 transition-all focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-50 border-gray-200">
        <input
          value={inputValue}
          onChange={onInputChange}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && onSend()}
          placeholder={
            messageQueue.length > 0
              ? `继续输入或等待发送 (${messageQueue.length}条排队中)...`
              : '给助手发送消息或输入 @ 来指定主机...'
          }
          className="flex-1 bg-transparent px-2 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none font-medium"
        />
        <button
          onClick={onSend}
          disabled={!inputValue.trim()}
          className="p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 transition-all active:scale-95 shadow-md shadow-blue-500/20"
        >
          {thinking ? <Clock size={16} /> : <Send size={16} />}
        </button>
      </div>
    </div>
  )
}
