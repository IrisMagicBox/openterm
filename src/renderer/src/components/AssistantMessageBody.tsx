import { MarkdownRenderer } from './MarkdownRenderer'
import { cn } from '../lib/utils'

interface AssistantMessageBodyProps {
  content: string
  className?: string
}

export function AssistantMessageBody({
  content,
  className
}: AssistantMessageBodyProps): React.ReactElement | null {
  if (!content) return null

  return (
    <div
      className={cn(
        'text-[var(--chat-text-size)] leading-[var(--chat-line-height)] text-foreground',
        className
      )}
    >
      <MarkdownRenderer content={content} />
    </div>
  )
}
