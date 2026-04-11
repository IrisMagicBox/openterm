import { useState, useEffect, useRef } from 'react'
import { Search, Terminal as TerminalIcon, X } from 'lucide-react'

const api = window.api as any

interface HistoryEntry {
  content: string
  source: string
  hostId: string
  timestamp: number
}

interface CommandHistorySearchProps {
  onSelect: (command: string) => void
  onClose: () => void
}

export function CommandHistorySearch({ onSelect, onClose }: CommandHistorySearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<HistoryEntry[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!query.trim()) {
      api.searchCommands('').then(setResults)
      return
    }
    const timer = setTimeout(() => {
      api.searchCommands(query).then(setResults)
    }, 150)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter' && results[selectedIndex]) {
        e.preventDefault()
        onSelect(results[selectedIndex].content)
        onClose()
      } else if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [results, selectedIndex, onSelect, onClose])

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      <div className="fixed inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <Search size={16} className="text-gray-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            placeholder="搜索命令历史..."
            className="flex-1 text-sm bg-transparent outline-none placeholder-gray-400"
          />
          <span className="text-[10px] font-bold text-gray-300 bg-gray-50 px-2 py-0.5 rounded">
            Ctrl+R
          </span>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded transition">
            <X size={14} className="text-gray-400" />
          </button>
        </div>

        <div className="max-h-[300px] overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-gray-400">
              {query ? '没有找到匹配的命令' : '输入关键词搜索命令历史'}
            </div>
          ) : (
            results.map((entry, i) => (
              <button
                key={`${entry.content}-${entry.timestamp}`}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition ${
                  i === selectedIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
                onClick={() => {
                  onSelect(entry.content)
                  onClose()
                }}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <TerminalIcon size={12} className="text-gray-400 flex-shrink-0" />
                <span className="text-xs font-mono truncate flex-1">{entry.content}</span>
                <span className="text-[10px] text-gray-400 flex-shrink-0">
                  {formatDate(entry.timestamp)}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t border-gray-50 text-[10px] text-gray-400 flex items-center gap-4">
          <span>↑↓ 导航</span>
          <span>↵ 选择</span>
          <span>Esc 关闭</span>
        </div>
      </div>
    </div>
  )
}
