import { X, ArrowRight, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { FileTransfer } from '../hooks/useFileTransfer'

interface FileTransferToastProps {
  transfers: FileTransfer[]
  onRemove: (id: string) => void
}

export function FileTransferToast({ transfers, onRemove }: FileTransferToastProps) {
  if (transfers.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {transfers.map((transfer) => (
        <div
          key={transfer.id}
          className={`bg-gray-900 border rounded-xl p-3 shadow-xl flex items-center gap-3 transition-all ${
            transfer.phase === 'error'
              ? 'border-red-500/50'
              : transfer.phase === 'complete'
                ? 'border-emerald-500/50'
                : 'border-gray-700'
          }`}
        >
          {transfer.phase === 'complete' ? (
            <CheckCircle size={16} className="text-emerald-400 shrink-0" />
          ) : transfer.phase === 'error' ? (
            <AlertCircle size={16} className="text-red-400 shrink-0" />
          ) : (
            <Loader2 size={16} className="text-blue-400 shrink-0 animate-spin" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-white truncate">{transfer.fileName}</div>
            <div className="text-[10px] text-gray-400 flex items-center gap-1">
              {transfer.sourceHostAlias}
              <ArrowRight size={8} />
              {transfer.destHostAlias}
            </div>
            {transfer.phase !== 'complete' && transfer.phase !== 'error' && (
              <div className="mt-1 h-1 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${transfer.progress}%` }}
                />
              </div>
            )}
            {transfer.phase === 'error' && transfer.error && (
              <div className="text-[10px] text-red-400 mt-0.5 truncate">{transfer.error}</div>
            )}
          </div>
          <button
            onClick={() => onRemove(transfer.id)}
            className="p-1 hover:bg-gray-800 rounded text-gray-500 hover:text-gray-300 transition shrink-0"
          >
            <X size={10} />
          </button>
        </div>
      ))}
    </div>
  )
}
