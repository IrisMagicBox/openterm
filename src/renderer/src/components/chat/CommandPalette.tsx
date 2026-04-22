import { Command } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea
} from '../ui'

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
}: CommandPaletteProps): React.ReactElement {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-md border border-accent/15 bg-accent-soft/70 text-accent shadow-sm backdrop-blur-xl">
            <Command size={18} />
          </div>
          <DialogTitle>自然语言执行</DialogTitle>
          <DialogDescription>
            {hostAlias ? `当前目标终端：${hostAlias}` : '将使用当前话题上下文交给 Agent 处理'}
          </DialogDescription>
        </DialogHeader>

        <Textarea
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
          className="h-32 resize-none"
        />

        <DialogFooter className="justify-between">
          <p className="mr-auto text-xs text-muted-foreground">Cmd/Ctrl + Enter 立即执行</p>
          <Button onClick={onClose} variant="ghost">
            取消
          </Button>
          <Button onClick={onSubmit} disabled={!value.trim()} variant="primary">
            交给 Agent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
