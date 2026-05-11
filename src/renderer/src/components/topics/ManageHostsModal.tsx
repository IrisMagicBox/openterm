import { useState } from 'react'
import { Server, Minus, Plus, Monitor } from 'lucide-react'
import type { Host, Topic } from '../../../../shared/types'
import {
  Button,
  ConfirmActionButton,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  IconButton,
  Surface
} from '../ui'

interface ManageHostsModalProps {
  topic: Topic
  allHosts: Host[]
  onClose: () => void
  onAddHost: (hostId: string) => void | Promise<void>
  onRemoveHost: (hostId: string) => void | Promise<void>
}

type HostAction = 'add' | 'remove'

export function ManageHostsModal({
  topic,
  allHosts,
  onClose,
  onAddHost,
  onRemoveHost
}: ManageHostsModalProps): React.ReactElement {
  const [pendingAction, setPendingAction] = useState<{
    hostId: string
    action: HostAction
  } | null>(null)
  const topicHosts = allHosts.filter((h) => topic.hostIds.includes(h.id))
  const availableHosts = allHosts.filter((h) => !topic.hostIds.includes(h.id))
  const hasLocal = topic.hostIds.includes('local')
  const isBusy = pendingAction !== null

  const handleHostAction = async (hostId: string, action: HostAction): Promise<void> => {
    if (pendingAction) return
    setPendingAction({ hostId, action })
    try {
      if (action === 'add') {
        await onAddHost(hostId)
      } else {
        await onRemoveHost(hostId)
      }
    } catch (error) {
      console.error(`Failed to ${action} host`, error)
    } finally {
      setPendingAction(null)
    }
  }

  const renderHostRow = (
    host: Pick<Host, 'id' | 'alias'> & Partial<Pick<Host, 'ip' | 'port'>>,
    mode: HostAction,
    isLocal = false
  ): React.ReactElement => {
    const isRowPending = pendingAction?.hostId === host.id && pendingAction.action === mode
    return (
      <Surface
        key={`${mode}-${host.id}`}
        padding="sm"
        className="flex items-center justify-between rounded-lg hover:border-white/80 hover:bg-white/75"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/70 shadow-sm ${isLocal ? 'bg-success-soft text-success' : 'bg-white/60 text-accent'}`}
          >
            {isLocal ? <Monitor size={16} /> : <Server size={16} />}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">{host.alias}</div>
            <div className="truncate font-mono text-xs text-muted-foreground">
              {isLocal ? '本地终端' : `${host.ip}:${host.port || 22}`}
            </div>
          </div>
        </div>
        {mode === 'add' ? (
          <IconButton
            aria-label={`添加 ${host.alias}`}
            disabled={isBusy}
            onClick={() => void handleHostAction(host.id, 'add')}
          >
            <Plus size={15} className={isRowPending ? 'animate-pulse' : undefined} />
          </IconButton>
        ) : (
          <ConfirmActionButton
            aria-label={`移除 ${host.alias}`}
            className="blue-ring inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground no-drag hover:border-white/70 hover:bg-white/60 hover:text-danger hover:shadow-sm disabled:pointer-events-none disabled:opacity-50"
            confirmClassName="hover:bg-danger-strong"
            confirmingTitle={`移除 ${host.alias}`}
            disabled={isBusy}
            onConfirm={() => handleHostAction(host.id, 'remove')}
          >
            <Minus size={15} className={isRowPending ? 'animate-pulse' : undefined} />
          </ConfirmActionButton>
        )}
      </Surface>
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>管理话题主机</DialogTitle>
          <DialogDescription>添加或移除此话题中的主机</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
          <section>
            <h3 className="mb-2 text-xs font-semibold text-muted-foreground">已连接主机</h3>
            {topicHosts.length === 0 && !hasLocal ? (
              <p className="rounded-xl border border-dashed border-white/70 bg-white/45 p-4 text-center text-sm text-muted-foreground">
                暂无主机
              </p>
            ) : (
              <div className="space-y-2">
                {hasLocal && renderHostRow({ id: 'local', alias: '本机' }, 'remove', true)}
                {topicHosts.map((host) => renderHostRow(host, 'remove'))}
              </div>
            )}
          </section>

          {(availableHosts.length > 0 || !hasLocal) && (
            <section>
              <h3 className="mb-2 text-xs font-semibold text-muted-foreground">可用主机</h3>
              <div className="space-y-2">
                {!hasLocal && renderHostRow({ id: 'local', alias: '本机' }, 'add', true)}
                {availableHosts.map((host) => renderHostRow(host, 'add'))}
              </div>
            </section>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={onClose}>完成</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
