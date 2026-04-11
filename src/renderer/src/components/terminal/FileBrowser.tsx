import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Folder,
  File,
  Upload,
  Download,
  RefreshCw,
  ChevronRight,
  FolderPlus,
  Trash2,
  X,
  Loader2
} from 'lucide-react'

interface FileItem {
  name: string
  type: 'directory' | 'file'
  size: number
  modifyTime: number
  permissions: number
}

interface FileBrowserProps {
  hostId: string
  hostAlias: string
  onClose: () => void
}

const api = window.api as any

function formatSize(bytes: number): string {
  if (bytes === 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function FileBrowser({ hostId, hostAlias, onClose }: FileBrowserProps) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [currentPath, setCurrentPath] = useState('/')
  const [items, setItems] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [showMkdir, setShowMkdir] = useState(false)
  const [mkdirName, setMkdirName] = useState('')
  const [selectedItem, setSelectedItem] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const connect = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.sftpConnect(hostId)
      setSessionId(result.sessionId)
    } catch (err: any) {
      setError(err.message || '连接失败')
    } finally {
      setLoading(false)
    }
  }, [hostId])

  const loadDirectory = useCallback(
    async (path: string) => {
      if (!sessionId) return
      setLoading(true)
      setError(null)
      try {
        const list = await api.sftpList(sessionId, path)
        const sorted = list.sort((a: FileItem, b: FileItem) => {
          if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
          return a.name.localeCompare(b.name)
        })
        setItems(sorted)
        setCurrentPath(path)
      } catch (err: any) {
        setError(err.message || '读取目录失败')
      } finally {
        setLoading(false)
      }
    },
    [sessionId]
  )

  useEffect(() => {
    connect()
  }, [connect])

  useEffect(() => {
    if (sessionId) loadDirectory(currentPath)
  }, [sessionId])

  useEffect(() => {
    return () => {
      if (sessionId) api.sftpClose(sessionId)
    }
  }, [])

  const navigateTo = (path: string) => {
    loadDirectory(path)
    setSelectedItem(null)
  }

  const handleItemClick = (item: FileItem) => {
    if (item.type === 'directory') {
      const newPath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`
      navigateTo(newPath)
    } else {
      setSelectedItem(item.name)
    }
  }

  const handleBreadcrumb = (index: number) => {
    const parts = currentPath.split('/').filter(Boolean)
    const newPath = '/' + parts.slice(0, index + 1).join('/')
    navigateTo(newPath)
  }

  const handleUpload = async () => {
    fileInputRef.current?.click()
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !sessionId) return
    setUploading(true)
    setError(null)
    try {
      const remotePath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`
      await api.sftpUpload(sessionId, (file as any).path, remotePath)
      await loadDirectory(currentPath)
    } catch (err: any) {
      setError(err.message || '上传失败')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDownload = async () => {
    if (!selectedItem || !sessionId) return
    const remotePath = currentPath === '/' ? `/${selectedItem}` : `${currentPath}/${selectedItem}`
    const localPath = `${process.env.HOME || '~'}/Downloads/${selectedItem}`
    setLoading(true)
    setError(null)
    try {
      await api.sftpDownload(sessionId, remotePath, localPath)
    } catch (err: any) {
      setError(err.message || '下载失败')
    } finally {
      setLoading(false)
    }
  }

  const handleMkdir = async () => {
    if (!mkdirName.trim() || !sessionId) return
    setLoading(true)
    setError(null)
    try {
      const newPath =
        currentPath === '/' ? `/${mkdirName.trim()}` : `${currentPath}/${mkdirName.trim()}`
      await api.sftpMkdir(sessionId, newPath)
      setShowMkdir(false)
      setMkdirName('')
      await loadDirectory(currentPath)
    } catch (err: any) {
      setError(err.message || '创建目录失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedItem || !sessionId) return
    if (!confirm(`确定删除 ${selectedItem} 吗？`)) return
    setLoading(true)
    setError(null)
    try {
      const remotePath = currentPath === '/' ? `/${selectedItem}` : `${currentPath}/${selectedItem}`
      await api.sftpDelete(sessionId, remotePath)
      setSelectedItem(null)
      await loadDirectory(currentPath)
    } catch (err: any) {
      setError(err.message || '删除失败')
    } finally {
      setLoading(false)
    }
  }

  const goUp = () => {
    if (currentPath === '/') return
    const parts = currentPath.split('/').filter(Boolean)
    parts.pop()
    navigateTo('/' + parts.join('/'))
  }

  const pathParts = currentPath.split('/').filter(Boolean)

  return (
    <div className="flex flex-col h-full bg-[#1a1a2e] text-gray-200 text-sm">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/50 bg-[#16162a]">
        <div className="flex items-center gap-2 min-w-0">
          <Folder className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="font-medium truncate">{hostAlias}</span>
          <span className="text-gray-500 text-xs">文件管理</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-700/50 text-gray-400 hover:text-gray-200"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-700/30 text-xs overflow-x-auto">
        <button
          onClick={() => navigateTo('/')}
          className="px-1.5 py-0.5 rounded hover:bg-gray-700/50 text-blue-400 shrink-0"
        >
          /
        </button>
        {pathParts.map((part, i) => (
          <div key={i} className="flex items-center gap-1 shrink-0">
            <ChevronRight className="w-3 h-3 text-gray-600" />
            <button
              onClick={() => handleBreadcrumb(i)}
              className="px-1.5 py-0.5 rounded hover:bg-gray-700/50 text-blue-400"
            >
              {part}
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-700/30">
        <button
          onClick={goUp}
          disabled={currentPath === '/'}
          className="px-2 py-1 rounded text-xs bg-gray-700/40 hover:bg-gray-700/70 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ..
        </button>
        <button
          onClick={() => loadDirectory(currentPath)}
          className="p-1.5 rounded hover:bg-gray-700/50 text-gray-400 hover:text-gray-200"
          title="刷新"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setShowMkdir(true)}
          className="p-1.5 rounded hover:bg-gray-700/50 text-gray-400 hover:text-gray-200"
          title="新建目录"
        >
          <FolderPlus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-blue-600/80 hover:bg-blue-600 disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Upload className="w-3 h-3" />
          )}
          上传
        </button>
        <button
          onClick={handleDownload}
          disabled={!selectedItem}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-green-600/80 hover:bg-green-600 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Download className="w-3 h-3" />
          下载
        </button>
        <button
          onClick={handleDelete}
          disabled={!selectedItem}
          className="p-1.5 rounded hover:bg-red-600/50 text-gray-400 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
          title="删除"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelected} />
      </div>

      {showMkdir && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700/30 bg-gray-800/30">
          <input
            value={mkdirName}
            onChange={(e) => setMkdirName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleMkdir()}
            placeholder="目录名称"
            className="flex-1 px-2 py-1 rounded bg-gray-900/50 border border-gray-600/50 text-sm outline-none focus:border-blue-500/50"
            autoFocus
          />
          <button
            onClick={handleMkdir}
            className="px-2 py-1 rounded text-xs bg-blue-600/80 hover:bg-blue-600"
          >
            创建
          </button>
          <button
            onClick={() => {
              setShowMkdir(false)
              setMkdirName('')
            }}
            className="px-2 py-1 rounded text-xs bg-gray-700/50 hover:bg-gray-700"
          >
            取消
          </button>
        </div>
      )}

      {error && (
        <div className="px-3 py-1.5 text-xs text-red-400 bg-red-900/20 border-b border-red-800/30">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            加载中...
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-xs">
            空目录
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-700/30">
                <th className="text-left px-3 py-1.5 font-normal">名称</th>
                <th className="text-right px-3 py-1.5 font-normal w-20">大小</th>
                <th className="text-right px-3 py-1.5 font-normal w-32">修改时间</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.name}
                  onClick={() => handleItemClick(item)}
                  className={`cursor-pointer border-b border-gray-800/30 hover:bg-gray-700/20 ${
                    selectedItem === item.name ? 'bg-blue-900/20' : ''
                  }`}
                >
                  <td className="px-3 py-1.5 flex items-center gap-2">
                    {item.type === 'directory' ? (
                      <Folder className="w-4 h-4 text-blue-400 shrink-0" />
                    ) : (
                      <File className="w-4 h-4 text-gray-500 shrink-0" />
                    )}
                    <span className="truncate">{item.name}</span>
                  </td>
                  <td className="text-right px-3 py-1.5 text-gray-500 text-xs">
                    {item.type === 'file' ? formatSize(item.size) : '-'}
                  </td>
                  <td className="text-right px-3 py-1.5 text-gray-500 text-xs">
                    {formatDate(item.modifyTime)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
