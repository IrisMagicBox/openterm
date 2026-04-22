import { Send, Clock, Hash, Server, ArrowRight, X } from 'lucide-react'
import type { Host } from '../../../../shared/types'
import { Badge, IconButton, Surface, Textarea } from '../ui'

interface ChatInputProps {
  inputValue: string
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
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
}: ChatInputProps): React.ReactElement {
  return (
    <div className="relative border-t border-border bg-surface px-6 py-4">
      {showMentions && filteredHosts.length > 0 && (
        <div className="absolute bottom-full left-6 z-10 mb-2 w-72 overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
          <div className="flex items-center gap-1.5 border-b border-border bg-surface-muted px-3 py-2 text-xs font-semibold text-muted-foreground">
            <Hash size={10} /> 提及主机
          </div>
          {filteredHosts.map((host) => (
            <button
              key={host.id}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-accent-soft"
              onClick={() => onInsertMention(host)}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-muted text-muted-foreground">
                <Server size={15} />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">{host.alias}</div>
                <div className="font-mono text-xs text-muted-foreground">
                  {host.ip}:{host.port || 22}
                </div>
              </div>
              <ArrowRight size={14} className="ml-auto text-muted-foreground" />
            </button>
          ))}
        </div>
      )}

      {messageQueue.length > 0 && (
        <Surface
          variant="subtle"
          padding="sm"
          className="mx-2 mb-2 border-warning/20 bg-warning-soft"
        >
          <div className="mb-1.5 flex items-center gap-2">
            <Clock size={12} className="text-warning" />
            <span className="text-xs font-semibold text-warning">
              {messageQueue.length} 条消息等待发送
            </span>
            <button
              onClick={onClearQueue}
              className="ml-auto text-xs font-semibold text-warning hover:text-foreground transition"
            >
              清空全部
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {messageQueue.map((msg) => (
              <Badge key={msg.id} variant="warning" className="max-w-[180px] pr-1">
                <span className="truncate">{msg.content}</span>
                <button
                  onClick={() => onRemoveFromQueue(msg.id)}
                  className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded hover:bg-warning/10 transition"
                >
                  <X size={9} />
                </button>
              </Badge>
            ))}
          </div>
        </Surface>
      )}

      <div className="flex items-end gap-3 rounded-lg border border-border bg-app p-2 transition-colors focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/15">
        <Textarea
          value={inputValue}
          onChange={onInputChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSend()
            }
          }}
          placeholder={
            messageQueue.length > 0
              ? `继续输入或等待发送 (${messageQueue.length}条排队中)...`
              : '给助手发送消息或输入 @ 来指定主机...'
          }
          rows={1}
          className="max-h-36 min-h-9 flex-1 resize-none border-0 bg-transparent px-2 py-2 focus-visible:ring-0"
        />
        <IconButton
          aria-label="发送消息"
          onClick={onSend}
          disabled={!inputValue.trim()}
          variant="primary"
        >
          {thinking ? <Clock size={16} /> : <Send size={16} />}
        </IconButton>
      </div>
    </div>
  )
}
