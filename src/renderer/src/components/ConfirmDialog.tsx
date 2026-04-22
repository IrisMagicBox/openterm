import { AlertTriangle, HelpCircle, X } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui'

export interface ConfirmDialogOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'default'
}

interface ConfirmDialogProps extends ConfirmDialogOptions {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  variant = 'default',
  onConfirm,
  onCancel
}: ConfirmDialogProps): React.ReactElement | null {
  if (!open) return null

  const isDanger = variant === 'danger'

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <DialogContent className="z-[210] max-w-sm" showClose={false}>
        <DialogHeader className="flex flex-row items-start gap-3 space-y-0 pr-0">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
              isDanger ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-accent'
            }`}
          >
            {isDanger ? <AlertTriangle size={20} /> : <HelpCircle size={20} />}
          </div>
          <div className="min-w-0 flex-1">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="mt-1 leading-relaxed">{message}</DialogDescription>
          </div>
          <Button
            aria-label="关闭"
            onClick={onCancel}
            variant="ghost"
            size="icon"
            className="-mr-2 -mt-2 text-muted-foreground"
          >
            <X size={16} />
          </Button>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onCancel} variant="ghost">
            {cancelText}
          </Button>
          <Button onClick={onConfirm} variant={isDanger ? 'destructive' : 'primary'}>
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
