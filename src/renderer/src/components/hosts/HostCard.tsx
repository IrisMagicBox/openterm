import { Server, Trash2, Terminal as TerminalIcon, Folder, Zap } from 'lucide-react'
import type { Host } from '../../../../shared/types'
import { Badge, Button, IconButton, Surface } from '../ui'

interface HostCardProps {
  host: Host
  onConnect: () => void
  onDelete: () => void
  onAgentClick: () => void
  onFileBrowser: () => void
}

export function HostCard({
  host,
  onConnect,
  onDelete,
  onAgentClick,
  onFileBrowser
}: HostCardProps): React.ReactElement {
  return (
    <Surface className="group flex min-h-[160px] flex-col gap-4 overflow-hidden transition-all hover:-translate-y-0.5 hover:border-accent/30 hover:bg-white/80">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/70 bg-white/65 text-muted-foreground shadow-sm transition-colors group-hover:border-accent/20 group-hover:bg-accent-soft/70 group-hover:text-accent">
          <Server size={20} />
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <h3 className="truncate text-base font-bold text-foreground" title={host.alias}>
            {host.alias}
          </h3>
          <span
            className="block truncate font-mono text-xs text-muted-foreground"
            title={`${host.username}@${host.ip}:${host.port || 22}`}
          >
            {host.username}@{host.ip}:{host.port || 22}
          </span>
        </div>
        <IconButton
          aria-label={`删除主机 ${host.alias}`}
          onClick={onDelete}
          className="text-muted-foreground hover:text-danger"
        >
          <Trash2 size={14} />
        </IconButton>
      </div>

      {host.tags && host.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {host.tags.map((tag) => (
            <Badge key={tag} variant="neutral">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      <div className="mt-auto flex gap-2">
        <Button onClick={onConnect} variant="primary" size="sm" className="flex-1">
          <TerminalIcon size={13} /> 终端
        </Button>
        <IconButton aria-label={`打开 ${host.alias} 文件管理`} onClick={onFileBrowser}>
          <Folder size={13} />
        </IconButton>
        <Button onClick={onAgentClick} variant="secondary" size="sm" className="flex-1">
          <Zap size={13} /> 助手
        </Button>
      </div>
    </Surface>
  )
}
