import { Server, Minus, Plus, Monitor } from 'lucide-react'
import type { Host, Topic } from '../../../../shared/types'
import { useConfirm } from '../../hooks/useConfirm'
import {
  Button,
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
  onAddHost: (hostId: string) => void
  onRemoveHost: (hostId: string) => void
}

export function ManageHostsModal({
  topic,
  allHosts,
  onClose,
  onAddHost,
  onRemoveHost
}: ManageHostsModalProps): React.ReactElement {
  const { confirm, ConfirmDialogComponent } = useConfirm()
  const topicHosts = allHosts.filter((h) => topic.hostIds.includes(h.id))
  const availableHosts = allHosts.filter((h) => !topic.hostIds.includes(h.id))
  const hasLocal = topic.hostIds.includes('local')

  const renderHostRow = (
    host: Pick<Host, 'id' | 'alias'> & Partial<Pick<Host, 'ip' | 'port'>>,
    mode: 'add' | 'remove',
    isLocal = false
  ): React.ReactElement => (
    <Surface key={`${mode}-${host.id}`} padding="sm" className="flex items-center justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${isLocal ? 'bg-success-soft text-success' : 'bg-accent-soft text-accent'}`}
        >
          {isLocal ? <Monitor size={17} /> : <Server size={17} />}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{host.alias}</div>
          <div className="truncate font-mono text-xs text-muted-foreground">
            {isLocal ? '本地终端' : `${host.ip}:${host.port || 22}`}
          </div>
        </div>
      </div>
      {mode === 'add' ? (
        <IconButton aria-label={`添加 ${host.alias}`} onClick={() => onAddHost(host.id)}>
          <Plus size={15} />
        </IconButton>
      ) : (
        <IconButton
          aria-label={`移除 ${host.alias}`}
          className="hover:text-danger"
          onClick={async () => {
            const ok = await confirm({
              title: `移除${isLocal ? '本机' : '主机'}`,
              message: `确定从话题中移除${isLocal ? '本机终端' : `主机"${host.alias}"`}？`,
              confirmText: '移除',
              variant: 'danger'
            })
            if (!ok) return
            onRemoveHost(host.id)
          }}
        >
          <Minus size={15} />
        </IconButton>
      )}
    </Surface>
  )

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
              <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
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
      {ConfirmDialogComponent}
    </Dialog>
  )
}
