import { getErrorMessage } from '../../../../shared/errors'
import { useState, useEffect } from 'react'
import { Globe, Plus, X, ArrowRight, Trash2 } from 'lucide-react'
import { useConfirm } from '../../hooks/useConfirm'

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

export function PortForwardingPanel({ hostId, hostAlias, onClose }: PortForwardingPanelProps) {
  const { confirm, ConfirmDialogComponent } = useConfirm()
  const [tunnels, setTunnels] = useState<Tunnel[]>([])
  const [localPort, setLocalPort] = useState('')
  const [remoteHost, setRemoteHost] = useState('localhost')
  const [remotePort, setRemotePort] = useState('')
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    try {
      const list = await window.api.pfList(hostId)
      setTunnels(list)
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    }
  }

  useEffect(() => {
    refresh()
  }, [hostId])

  const handleCreate = async () => {
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
      setRemotePort('localhost')
      setRemotePort('')
      refresh()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    }
  }

  const handleClose = async (tunnelId: string) => {
    const ok = await confirm({
      title: '关闭隧道',
      message: '确定关闭此端口转发隧道？',
      confirmText: '关闭',
      variant: 'danger'
    })
    if (!ok) return
    try {
      await window.api.pfClose(tunnelId)
      refresh()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    }
  }

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <Globe size={14} className="text-blue-500" />
        <span className="text-xs font-bold text-gray-700">端口转发</span>
        <span className="text-[10px] text-gray-400">{hostAlias}</span>
        <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-gray-100 transition">
          <X size={14} className="text-gray-400" />
        </button>
      </div>

      {error && <div className="px-4 py-2 bg-red-50 text-red-600 text-[11px]">{error}</div>}

      <div className="px-4 py-3 border-b border-gray-50">
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
          新建转发
        </div>
        <div className="flex items-center gap-2">
          <input
            value={localPort}
            onChange={(e) => setLocalPort(e.target.value)}
            placeholder="本地端口"
            className="w-20 text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-300"
          />
          <ArrowRight size={12} className="text-gray-300" />
          <input
            value={remoteHost}
            onChange={(e) => setRemoteHost(e.target.value)}
            placeholder="远程地址"
            className="w-24 text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-300"
          />
          <input
            value={remotePort}
            onChange={(e) => setRemotePort(e.target.value)}
            placeholder="远程端口"
            className="w-20 text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-300"
          />
          <button
            onClick={handleCreate}
            className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tunnels.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-gray-400 text-xs">
            暂无活跃的端口转发
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {tunnels.map((tunnel) => (
              <div key={tunnel.id} className="px-4 py-2.5 flex items-center gap-3">
                <div
                  className={`w-2 h-2 rounded-full ${tunnel.status === 'active' ? 'bg-emerald-500' : 'bg-gray-300'}`}
                />
                <div className="flex-1">
                  <div className="text-xs font-mono font-semibold">
                    localhost:{tunnel.localPort}
                    <ArrowRight size={10} className="inline mx-1 text-gray-300" />
                    {tunnel.remoteHost}:{tunnel.remotePort}
                  </div>
                  <div className="text-[10px] text-gray-400">
                    {new Date(tunnel.createdAt).toLocaleString('zh-CN')}
                  </div>
                </div>
                <button
                  onClick={() => handleClose(tunnel.id)}
                  className="p-1 text-gray-400 hover:text-red-500 transition"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {ConfirmDialogComponent}
    </div>
  )
}
