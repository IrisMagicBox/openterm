import { getErrorMessage } from '../../../../shared/errors'
import { useState, useEffect, useCallback } from 'react'
import { Globe, Plus, X, ArrowRight, Trash2, ExternalLink } from 'lucide-react'
import { useConfirm } from '../../hooks/useConfirm'
import { Button, IconButton, Input } from '../ui'

interface Tunnel {
  id: string
  hostId: string
  localPort: number
  remoteHost: string
  remotePort: number
  status: string
  createdAt: number
}

interface PortForwardingPanelProps {
  hostId: string
  hostAlias: string
  onClose: () => void
}

export function PortForwardingPanel({
  hostId,
  hostAlias,
  onClose
}: PortForwardingPanelProps): React.ReactElement {
  const { confirm, ConfirmDialogComponent } = useConfirm()
  const [tunnels, setTunnels] = useState<Tunnel[]>([])
  const [localPort, setLocalPort] = useState('')
  const [remoteHost, setRemoteHost] = useState('localhost')
  const [remotePort, setRemotePort] = useState('')
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const list = await window.api.pfList(hostId)
      setTunnels(list)
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    }
  }, [hostId])

  useEffect(() => {
    let active = true
    window.api
      .pfList(hostId)
      .then((list) => {
        if (active) setTunnels(list)
      })
      .catch((err: unknown) => {
        if (active) setError(getErrorMessage(err))
      })

    return () => {
      active = false
    }
  }, [hostId])

  const handleCreate = async (): Promise<void> => {
    const lp = parseInt(localPort)
    const rp = parseInt(remotePort)
    if (isNaN(lp) || isNaN(rp)) {
      setError('请输入有效的端口号')
      return
    }
    try {
      setError(null)
      await window.api.pfCreate(hostId, lp, remoteHost, rp)
      setLocalPort('')
      setRemoteHost('localhost')
      setRemotePort('')
      void refresh()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    }
  }

  const handleClose = async (tunnelId: string): Promise<void> => {
    const ok = await confirm({
      title: '关闭隧道',
      message: '确定关闭此端口转发隧道？',
      confirmText: '关闭',
      variant: 'danger'
    })
    if (!ok) return
    try {
      await window.api.pfClose(tunnelId)
      void refresh()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    }
  }

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Globe size={14} className="text-accent" />
        <span className="text-xs font-bold text-foreground">端口转发</span>
        <span className="text-xs text-muted-foreground">{hostAlias}</span>
        <IconButton aria-label="关闭端口转发" onClick={onClose} className="ml-auto h-7 w-7">
          <X size={14} />
        </IconButton>
      </div>

      {error && <div className="bg-danger-soft px-4 py-2 text-xs text-danger">{error}</div>}

      <div className="border-b border-border px-4 py-3">
        <div className="mb-2 text-xs font-semibold text-muted-foreground">新建转发</div>
        <div className="flex items-center gap-2">
          <Input
            value={localPort}
            onChange={(e) => setLocalPort(e.target.value)}
            placeholder="本地端口"
            className="h-7 w-20 text-xs"
          />
          <ArrowRight size={12} className="text-muted-foreground" />
          <Input
            value={remoteHost}
            onChange={(e) => setRemoteHost(e.target.value)}
            placeholder="远程地址"
            className="h-7 w-24 text-xs"
          />
          <Input
            value={remotePort}
            onChange={(e) => setRemotePort(e.target.value)}
            placeholder="远程端口"
            className="h-7 w-20 text-xs"
          />
          <Button onClick={handleCreate} variant="primary" size="icon" className="h-7 w-7">
            <Plus size={14} />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tunnels.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">
            暂无活跃的端口转发
          </div>
        ) : (
          <div className="divide-y divide-border">
            {tunnels.map((tunnel) => (
              <div key={tunnel.id} className="px-4 py-2.5 flex items-center gap-3">
                <div
                  className={`h-2 w-2 rounded-full ${tunnel.status === 'active' ? 'bg-success' : 'bg-border'}`}
                />
                <div className="flex-1">
                  <div className="text-xs font-mono font-semibold">
                    localhost:{tunnel.localPort}
                    <ArrowRight size={10} className="inline mx-1 text-muted-foreground" />
                    {tunnel.remoteHost}:{tunnel.remotePort}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(tunnel.createdAt).toLocaleString('zh-CN')}
                  </div>
                </div>
                <IconButton
                  aria-label="在浏览器打开"
                  onClick={() => window.open(`http://127.0.0.1:${tunnel.localPort}`, '_blank')}
                  className="h-7 w-7"
                >
                  <ExternalLink size={12} />
                </IconButton>
                <IconButton
                  aria-label="关闭隧道"
                  onClick={() => handleClose(tunnel.id)}
                  className="h-7 w-7 hover:text-danger"
                >
                  <Trash2 size={12} />
                </IconButton>
              </div>
            ))}
          </div>
        )}
      </div>
      {ConfirmDialogComponent}
    </div>
  )
}
