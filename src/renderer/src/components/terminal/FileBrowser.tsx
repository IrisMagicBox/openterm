import { getErrorMessage } from '../../../../shared/errors'
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
import { ConfirmActionButton } from '../ui'

interface FileItem {
  name: string
  type: 'directory' | 'file'
  size: number
  modifyTime: number
  permissions: number
}

export interface FileDragData {
  type: 'file-transfer'
  sourceHostId: string
  sourcePath: string
  fileName: string
  fileType: 'file' | 'directory'
}

interface FileBrowserProps {
  hostId: string
  hostAlias: string
  embedded?: boolean
  onClose: () => void
  onFileDrop?: (
    sourceHostId: string,
    sourcePath: string,
    fileName: string,
    destHostId: string,
    destPath: string
  ) => void
}

const api = window.api

type ElectronFile = File & { path?: string }
type FileSessionConnectResult = { sessionId: string; hostId: string; homeDir?: string }

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

function joinRemotePath(base: string, name: string): string {
  return base === '/' ? `/${name}` : `${base}/${name}`
}

export function FileBrowser({
  hostId,
  hostAlias,
  embedded = false,
  onClose,
  onFileDrop
}: FileBrowserProps): React.ReactElement {
  const isLocal = hostId === 'local'
  const fsList = isLocal ? api.localFsList : api.sftpList
  const fsUpload = isLocal ? api.localFsUpload : api.sftpUpload
  const fsDownload = isLocal ? api.localFsDownload : api.sftpDownload
  const fsMkdir = isLocal ? api.localFsMkdir : api.sftpMkdir
  const fsDelete = isLocal ? api.localFsDelete : api.sftpDelete
  const fsClose = isLocal ? api.localFsClose : api.sftpClose
  const initialPathRef = useRef('/')
  const localHomeDirRef = useRef('/')

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [currentPath, setCurrentPath] = useState(initialPathRef.current)
  const [items, setItems] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [showMkdir, setShowMkdir] = useState(false)
  const [mkdirName, setMkdirName] = useState('')
  const [selectedItem, setSelectedItem] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isConnectedRef = useRef(false)
  const sessionIdRef = useRef(sessionId)
  const fsCloseRef = useRef(fsClose)

  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  useEffect(() => {
    fsCloseRef.current = fsClose
  }, [fsClose])

  const connect = useCallback(async (): Promise<void> => {
    if (sessionId || isConnectedRef.current) return
    isConnectedRef.current = true
    setLoading(true)
    setError(null)
    try {
      const result: FileSessionConnectResult = isLocal
        ? await api.localFsConnect()
        : await api.sftpConnect(hostId)
      if (isLocal && result.homeDir) {
        localHomeDirRef.current = result.homeDir
        setCurrentPath(result.homeDir)
      }
      setSessionId(result.sessionId)
    } catch (err: unknown) {
      setError(getErrorMessage(err) || '连接失败')
      isConnectedRef.current = false
    } finally {
      setLoading(false)
    }
  }, [hostId, isLocal, sessionId])

  useEffect(() => {
    return () => {
      if (sessionIdRef.current) fsCloseRef.current(sessionIdRef.current)
    }
  }, [])

  const loadDirectory = useCallback(
    async (path: string): Promise<void> => {
      if (!sessionId) return
      setLoading(true)
      setError(null)
      try {
        const list = await fsList(sessionId, path)
        const sorted = list.sort((a: FileItem, b: FileItem) => {
          if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
          return a.name.localeCompare(b.name)
        })
        setItems(sorted)
        setCurrentPath(path)
      } catch (err: unknown) {
        setError(getErrorMessage(err) || '读取目录失败')
      } finally {
        setLoading(false)
      }
    },
    [sessionId, fsList]
  )

  useEffect(() => {
    connect()
  }, [connect])

  useEffect(() => {
    if (sessionId) void loadDirectory(isLocal ? localHomeDirRef.current : initialPathRef.current)
  }, [sessionId, loadDirectory, isLocal])

  const navigateTo = (path: string): void => {
    void loadDirectory(path)
    setSelectedItem(null)
  }

  const handleItemClick = (item: FileItem): void => {
    if (item.type === 'directory') {
      const newPath = joinRemotePath(currentPath, item.name)
      navigateTo(newPath)
    } else {
      setSelectedItem(item.name)
    }
  }

  const handleBreadcrumb = (index: number): void => {
    const parts = currentPath.split('/').filter(Boolean)
    const newPath = '/' + parts.slice(0, index + 1).join('/')
    navigateTo(newPath)
  }

  const handleUpload = async (): Promise<void> => {
    fileInputRef.current?.click()
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    if (!file || !sessionId) return
    setUploading(true)
    setError(null)
    try {
      const remotePath = joinRemotePath(currentPath, file.name)
      const filePath = (file as ElectronFile).path
      if (!filePath) {
        setError('无法读取本地文件路径')
        return
      }
      await fsUpload(sessionId, filePath, remotePath)
      await loadDirectory(currentPath)
    } catch (err: unknown) {
      setError(getErrorMessage(err) || '上传失败')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDownload = async (): Promise<void> => {
    if (!selectedItem || !sessionId) return
    const remotePath = joinRemotePath(currentPath, selectedItem)
    const localPath = `~/Downloads/${selectedItem}`
    setLoading(true)
    setError(null)
    try {
      await fsDownload(sessionId, remotePath, localPath)
    } catch (err: unknown) {
      setError(getErrorMessage(err) || '下载失败')
    } finally {
      setLoading(false)
    }
  }

  const handleMkdir = async (): Promise<void> => {
    if (!mkdirName.trim() || !sessionId) return
    setLoading(true)
    setError(null)
    try {
      const newPath =
        joinRemotePath(currentPath, mkdirName.trim())
      await fsMkdir(sessionId, newPath)
      setShowMkdir(false)
      setMkdirName('')
      await loadDirectory(currentPath)
    } catch (err: unknown) {
      setError(getErrorMessage(err) || '创建目录失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!selectedItem || !sessionId) return
    setLoading(true)
    setError(null)
    try {
      const remotePath = joinRemotePath(currentPath, selectedItem)
      await fsDelete(sessionId, remotePath)
      setSelectedItem(null)
      await loadDirectory(currentPath)
    } catch (err: unknown) {
      setError(getErrorMessage(err) || '删除失败')
    } finally {
      setLoading(false)
    }
  }

  const goUp = (): void => {
    if (currentPath === '/') return
    const parts = currentPath.split('/').filter(Boolean)
    parts.pop()
    navigateTo('/' + parts.join('/'))
  }

  const handleRowDragStart = (e: React.DragEvent, item: FileItem): void => {
    const fullPath = joinRemotePath(currentPath, item.name)

    const dragData: FileDragData = {
      type: 'file-transfer',
      sourceHostId: hostId,
      sourcePath: fullPath,
      fileName: item.name,
      fileType: item.type
    }
    e.dataTransfer.setData('application/json', JSON.stringify(dragData))
    e.dataTransfer.effectAllowed = 'copy'
  }

  const handleContainerDragOver = (e: React.DragEvent): void => {
    const isInternal = e.dataTransfer.types.includes('application/json')
    const isFiles = e.dataTransfer.types.includes('Files')
    if (!isInternal && !isFiles) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setIsDragOver(true)
  }

  const handleContainerDragLeave = (e: React.DragEvent): void => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragOver(false)
  }

  const handleContainerDrop = async (e: React.DragEvent): Promise<void> => {
    e.preventDefault()
    setIsDragOver(false)

    // Handle OS files
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (!sessionId) return
      setUploading(true)
      try {
        for (let i = 0; i < e.dataTransfer.files.length; i++) {
          const file = e.dataTransfer.files[i]
          const filePath = (file as ElectronFile).path
          if (!filePath) continue
          const remotePath = joinRemotePath(currentPath, file.name)
          await fsUpload(sessionId, filePath, remotePath)
        }
        await loadDirectory(currentPath)
      } catch (err: unknown) {
        setError(getErrorMessage(err) || '上传失败')
      } finally {
        setUploading(false)
      }
      return
    }

    const raw = e.dataTransfer.getData('application/json')
    if (!raw) return

    let dragData: FileDragData
    try {
      dragData = JSON.parse(raw)
    } catch {
      return
    }

    if (dragData.type !== 'file-transfer') return

    if (dragData.sourceHostId === hostId) {
      setError('同一主机无需传输')
      setTimeout(() => setError(null), 2000)
      return
    }

    if (!onFileDrop) return

    const destPath = joinRemotePath(currentPath, dragData.fileName)
    onFileDrop(dragData.sourceHostId, dragData.sourcePath, dragData.fileName, hostId, destPath)
  }

  const pathParts = currentPath.split('/').filter(Boolean)
  const selectedFile = selectedItem
    ? items.find((item) => item.name === selectedItem && item.type === 'file')
    : undefined
  const selectedPath = selectedItem ? joinRemotePath(currentPath, selectedItem) : ''
  const deleteConfirmTitle = selectedItem
    ? selectedFile
      ? `删除 ${selectedPath}`
      : `递归删除目录 ${selectedPath}`
    : '删除'

  return (
    <div
      className={`relative flex h-full flex-col overflow-hidden text-sm text-workspace-foreground ${
        embedded ? 'bg-transparent' : 'rounded-xl bg-workspace'
      }`}
      onDragOver={handleContainerDragOver}
      onDragLeave={handleContainerDragLeave}
      onDrop={handleContainerDrop}
    >
      {isDragOver && (
        <div
          className={`absolute inset-0 z-10 flex pointer-events-none items-center justify-center border-2 border-accent/45 bg-accent/10 ${
            embedded ? '' : 'rounded-xl'
          }`}
        >
          <span className="rounded-full border border-white/75 bg-white/85 px-3 py-1.5 text-xs font-semibold text-accent shadow-sm backdrop-blur-xl">
            释放以传输文件
          </span>
        </div>
      )}
      <div className="flex items-center justify-between border-b border-workspace-border bg-workspace-muted/85 px-3 py-2 backdrop-blur-xl">
        <div className="flex items-center gap-2 min-w-0">
          <Folder className="h-4 w-4 shrink-0 text-accent" />
          <span className="font-medium truncate">{hostAlias}</span>
          <span className="text-xs text-workspace-muted-foreground">文件管理</span>
        </div>
        <ConfirmActionButton
          aria-label="关闭文件管理"
          onConfirm={onClose}
          className="rounded-lg p-1 text-workspace-muted-foreground hover:bg-white/70 hover:text-workspace-foreground"
          confirmClassName="hover:bg-danger-strong"
          confirmingTitle="关闭"
          title="关闭"
        >
          <X className="w-4 h-4" />
        </ConfirmActionButton>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto border-b border-workspace-border px-3 py-1.5 text-xs">
        <button
          onClick={() => navigateTo('/')}
          className="shrink-0 rounded-md px-1.5 py-0.5 text-accent hover:bg-accent-soft"
        >
          /
        </button>
        {pathParts.map((part, i) => (
          <div key={i} className="flex items-center gap-1 shrink-0">
            <ChevronRight className="h-3 w-3 text-workspace-muted-foreground" />
            <button
              onClick={() => handleBreadcrumb(i)}
              className="rounded-md px-1.5 py-0.5 text-accent hover:bg-accent-soft"
            >
              {part}
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1 border-b border-workspace-border px-3 py-1.5">
        <button
          onClick={goUp}
          disabled={currentPath === '/'}
          className="rounded-lg border border-workspace-border bg-white/70 px-2 py-1 text-xs hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-30"
        >
          ..
        </button>
        <button
          onClick={() => loadDirectory(currentPath)}
          className="rounded-lg p-1.5 text-workspace-muted-foreground hover:bg-white/70 hover:text-workspace-foreground"
          title="刷新"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setShowMkdir(true)}
          className="rounded-lg p-1.5 text-workspace-muted-foreground hover:bg-white/70 hover:text-workspace-foreground"
          title="新建目录"
        >
          <FolderPlus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="flex items-center gap-1 rounded-lg bg-accent px-2 py-1 text-xs font-semibold text-white shadow-sm shadow-accent/15 hover:bg-accent-strong disabled:opacity-50"
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
          className="flex items-center gap-1 rounded-lg bg-success px-2 py-1 text-xs font-semibold text-white shadow-sm shadow-success/10 hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Download className="w-3 h-3" />
          下载
        </button>
        <ConfirmActionButton
          aria-label="删除"
          onConfirm={handleDelete}
          disabled={!selectedItem}
          className="rounded-lg p-1.5 text-workspace-muted-foreground hover:bg-danger/15 hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
          confirmClassName="disabled:opacity-30"
          confirmingTitle={deleteConfirmTitle}
          title={selectedPath ? `删除 ${selectedPath}` : '删除'}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </ConfirmActionButton>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelected} />
      </div>

      {showMkdir && (
        <div className="flex items-center gap-2 border-b border-workspace-border bg-workspace-muted/85 px-3 py-2">
          <input
            value={mkdirName}
            onChange={(e) => setMkdirName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleMkdir()}
            placeholder="目录名称"
            className="flex-1 rounded-lg border border-workspace-border bg-white/70 px-2 py-1 text-sm outline-none focus:border-accent/60"
            autoFocus
          />
          <button
            onClick={handleMkdir}
            className="rounded-lg bg-accent px-2 py-1 text-xs font-semibold text-white hover:bg-accent-strong"
          >
            创建
          </button>
          <button
            onClick={() => {
              setShowMkdir(false)
              setMkdirName('')
            }}
            className="rounded-lg border border-workspace-border bg-white/70 px-2 py-1 text-xs hover:bg-white"
          >
            取消
          </button>
        </div>
      )}

      {error && (
        <div className="border-b border-danger/30 bg-danger/10 px-3 py-1.5 text-xs text-danger">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading && items.length === 0 ? (
          <div className="flex h-full items-center justify-center text-workspace-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            加载中...
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-workspace-muted-foreground">
            空目录
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-workspace-border text-xs text-workspace-muted-foreground">
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
                  draggable
                  onDragStart={(e) => handleRowDragStart(e, item)}
                  className={`cursor-pointer border-b border-workspace-border/60 hover:bg-accent-soft/35 ${
                    selectedItem === item.name ? 'bg-accent-soft/70' : ''
                  }`}
                >
                  <td className="px-3 py-1.5 flex items-center gap-2">
                    {item.type === 'directory' ? (
                      <Folder className="h-4 w-4 shrink-0 text-accent" />
                    ) : (
                      <File className="h-4 w-4 shrink-0 text-workspace-muted-foreground" />
                    )}
                    <span className="truncate">{item.name}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right text-xs text-workspace-muted-foreground">
                    {item.type === 'file' ? formatSize(item.size) : '-'}
                  </td>
                  <td className="px-3 py-1.5 text-right text-xs text-workspace-muted-foreground">
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
