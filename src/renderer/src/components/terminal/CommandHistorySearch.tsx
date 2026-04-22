import { useState, useEffect, useRef } from 'react'
import { Search, Terminal as TerminalIcon, X } from 'lucide-react'
import { IconButton, Input } from '../ui'

const api = window.api

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

export function CommandHistorySearch({
  onSelect,
  onClose
}: CommandHistorySearchProps): React.ReactElement {
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
    const handleKeyDown = (e: KeyboardEvent): void => {
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

  const formatDate = (ts: number): string => {
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
      <div className="fixed inset-0 bg-slate-950/10 backdrop-blur-lg" />
      <div
        className="glass-menu relative w-full max-w-xl overflow-hidden rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/70 bg-white/45 px-4 py-3">
          <Search size={16} className="text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            placeholder="搜索命令历史..."
            className="h-7 flex-1 border-0 bg-transparent px-0 focus-visible:ring-0"
          />
          <span className="rounded-full border border-white/70 bg-white/65 px-2 py-0.5 text-xs font-semibold text-muted-foreground">
            Ctrl+R
          </span>
          <IconButton aria-label="关闭命令历史" onClick={onClose} className="h-7 w-7">
            <X size={14} />
          </IconButton>
        </div>

        <div className="max-h-[300px] overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">
              {query ? '没有找到匹配的命令' : '输入关键词搜索命令历史'}
            </div>
          ) : (
            results.map((entry, i) => (
              <button
                key={`${entry.content}-${entry.timestamp}`}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
                  i === selectedIndex ? 'bg-accent-soft/70 text-accent' : 'hover:bg-white/55'
                }`}
                onClick={() => {
                  onSelect(entry.content)
                  onClose()
                }}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <TerminalIcon size={12} className="flex-shrink-0 text-muted-foreground" />
                <span className="text-xs font-mono truncate flex-1">{entry.content}</span>
                <span className="flex-shrink-0 text-xs text-muted-foreground">
                  {formatDate(entry.timestamp)}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-white/70 bg-white/45 px-4 py-2 text-xs text-muted-foreground">
          <span>↑↓ 导航</span>
          <span>↵ 选择</span>
          <span>Esc 关闭</span>
        </div>
      </div>
    </div>
  )
}
