import { X, ArrowRight, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { FileTransfer } from '../hooks/useFileTransfer'
import { IconButton } from './ui'

interface FileTransferToastProps {
  transfers: FileTransfer[]
  onRemove: (id: string) => void
}

export function FileTransferToast({
  transfers,
  onRemove
}: FileTransferToastProps): React.ReactElement | null {
  if (transfers.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2">
      {transfers.map((transfer) => (
        <div
          key={transfer.id}
          className={`glass-menu flex items-center gap-3 rounded-2xl p-3 transition-all ${
            transfer.phase === 'error'
              ? 'border-danger/35'
              : transfer.phase === 'complete'
                ? 'border-success/35'
                : ''
          }`}
        >
          {transfer.phase === 'complete' ? (
            <CheckCircle size={16} className="shrink-0 text-success" />
          ) : transfer.phase === 'error' ? (
            <AlertCircle size={16} className="shrink-0 text-danger" />
          ) : (
            <Loader2 size={16} className="shrink-0 animate-spin text-accent" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-foreground">
              {transfer.fileName}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              {transfer.sourceHostAlias}
              <ArrowRight size={9} />
              {transfer.destHostAlias}
            </div>
            {transfer.phase !== 'complete' && transfer.phase !== 'error' && (
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-black/10">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-300"
                  style={{ width: `${transfer.progress}%` }}
                />
              </div>
            )}
            {transfer.phase === 'error' && transfer.error && (
              <div className="mt-0.5 truncate text-[11px] text-danger">{transfer.error}</div>
            )}
          </div>
          <IconButton
            aria-label="移除传输记录"
            onClick={() => onRemove(transfer.id)}
            className="h-7 w-7 shrink-0 text-muted-foreground hover:bg-white/60 hover:text-foreground"
          >
            <X size={12} />
          </IconButton>
        </div>
      ))}
    </div>
  )
}
