import { useCallback, useLayoutEffect, useRef } from 'react'
import { Send, Clock, Hash, Server, ArrowRight, X, Pause } from 'lucide-react'
import type { Host } from '../../../../shared/types'
import { cn } from '../../lib/utils'
import { Badge, IconButton, Surface, Textarea } from '../ui'

const MAX_TEXTAREA_HEIGHT = 144
const MIN_TEXTAREA_HEIGHT = 78

interface ChatInputProps {
  inputValue: string
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  onSend: () => void
  thinking: boolean
  onPause?: () => void | Promise<void>
  canPause?: boolean
  pausing?: boolean
  modelSelector?: React.ReactNode
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
  onPause,
  canPause = false,
  pausing = false,
  modelSelector,
  messageQueue,
  onRemoveFromQueue,
  onClearQueue,
  showMentions,
  filteredHosts,
  onInsertMention
}: ChatInputProps): React.ReactElement {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const resizeTextarea = useCallback((node: HTMLTextAreaElement | null) => {
    if (!node) return
    node.style.height = 'auto'
    const nextHeight = Math.max(
      Math.min(node.scrollHeight, MAX_TEXTAREA_HEIGHT),
      MIN_TEXTAREA_HEIGHT
    )
    node.style.height = `${nextHeight}px`
    node.style.overflowY = node.scrollHeight > MAX_TEXTAREA_HEIGHT ? 'auto' : 'hidden'
  }, [])

  useLayoutEffect(() => {
    resizeTextarea(textareaRef.current)
  }, [inputValue, resizeTextarea])

  const primaryActionAriaLabel = pausing ? '正在暂停' : thinking ? '暂停当前回复' : '发送消息'
  const primaryActionTitle = pausing ? '正在暂停' : thinking ? '暂停当前回复' : '发送消息'
  const primaryActionDisabled = pausing || (thinking ? !canPause : !inputValue.trim())

  return (
    <div className="relative px-6 pb-5 pt-3">
      <div className="relative mx-auto w-full max-w-4xl">
        {showMentions && filteredHosts.length > 0 && (
          <div className="absolute bottom-full left-0 z-20 mb-3 w-72 overflow-hidden rounded-[22px] border border-black/10 bg-white/98 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="flex items-center gap-1.5 border-b border-black/[0.06] px-3 py-2.5 text-xs font-semibold text-muted-foreground">
              <Hash size={10} /> 提及主机
            </div>
            {filteredHosts.map((host) => (
              <button
                key={host.id}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-black/[0.035]"
                onClick={() => onInsertMention(host)}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-black/[0.06] bg-black/[0.025] text-muted-foreground">
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
          <Surface variant="subtle" padding="sm" className="mb-2 border-warning/20 bg-warning-soft">
            <div className="mb-1.5 flex items-center gap-2">
              <Clock size={12} className="text-warning" />
              <span className="text-xs font-semibold text-warning">
                {messageQueue.length} 条消息等待发送
              </span>
              <button
                onClick={onClearQueue}
                className="ml-auto text-xs font-semibold text-warning transition hover:text-foreground"
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
                    className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded transition hover:bg-warning/10"
                  >
                    <X size={9} />
                  </button>
                </Badge>
              ))}
            </div>
          </Surface>
        )}

        <div className="composer-shell relative rounded-[30px] px-4 py-3 transition-all focus-within:border-black/15">
          <Textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(event) => {
              onInputChange(event)
              resizeTextarea(event.currentTarget)
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              if (event.nativeEvent.isComposing) return
              if (event.shiftKey) return
              event.preventDefault()
              onSend()
            }}
            placeholder={
              messageQueue.length > 0
                ? `继续输入或等待发送 (${messageQueue.length}条排队中)...`
                : '给助手发送消息或输入 @ 来指定主机...'
            }
            rows={1}
            title="Enter 发送，Shift + Enter 换行"
            className="max-h-36 min-h-[78px] w-full resize-none overflow-y-hidden border-0 bg-transparent px-1 py-1 pb-12 text-[15px] leading-7 text-foreground placeholder:text-muted-foreground/45 focus-visible:ring-0"
          />
          <div className="pointer-events-none absolute inset-x-4 bottom-3 flex items-center justify-between gap-3">
            <div className="pointer-events-auto min-w-0 flex-1">{modelSelector}</div>
            <IconButton
              aria-label={primaryActionAriaLabel}
              title={primaryActionTitle}
              onClick={() => {
                if (thinking) {
                  void onPause?.()
                  return
                }
                onSend()
              }}
              disabled={primaryActionDisabled}
              variant="ghost"
              className={cn(
                'pointer-events-auto h-11 w-11 shrink-0 rounded-full border border-black/5 bg-foreground text-white shadow-none hover:bg-foreground/92 hover:text-white',
                primaryActionDisabled &&
                  'border-black/[0.04] bg-black/20 text-white/70 hover:bg-black/20 hover:text-white/70',
                pausing && 'cursor-wait'
              )}
            >
              {pausing ? (
                <Clock size={16} className="animate-spin" />
              ) : thinking ? (
                <Pause size={16} />
              ) : (
                <Send size={16} />
              )}
            </IconButton>
          </div>
        </div>
      </div>
    </div>
  )
}
