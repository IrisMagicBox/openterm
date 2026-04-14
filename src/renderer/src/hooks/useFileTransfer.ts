import { useState, useCallback, useRef } from 'react'

export interface FileTransfer {
  id: string
  fileName: string
  sourceHostAlias: string
  destHostAlias: string
  phase: 'downloading' | 'uploading' | 'complete' | 'error'
  progress: number
  error?: string
}

export function useFileTransfer() {
  const [transfers, setTransfers] = useState<FileTransfer[]>([])
  const cleanupTimers = useRef<Map<string, NodeJS.Timeout>>(new Map())

  const startTransfer = useCallback(
    async (
      transferId: string,
      fileName: string,
      sourceHostAlias: string,
      destHostAlias: string,
      sourceHostId: string,
      sourcePath: string,
      destHostId: string,
      destPath: string
    ) => {
      setTransfers((prev) => [
        ...prev,
        {
          id: transferId,
          fileName,
          sourceHostAlias,
          destHostAlias,
          phase: 'downloading',
          progress: 0
        }
      ])

      const unsub = window.api.onSftpTransferProgress(transferId, (data) => {
        setTransfers((prev) =>
          prev.map((t) =>
            t.id === transferId
              ? { ...t, phase: data.phase as FileTransfer['phase'], progress: data.progress }
              : t
          )
        )
      })

      try {
        await window.api.sftpTransferBetweenHosts(
          transferId,
          sourceHostId,
          sourcePath,
          destHostId,
          destPath
        )
        setTransfers((prev) =>
          prev.map((t) => (t.id === transferId ? { ...t, phase: 'complete', progress: 100 } : t))
        )
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : typeof err === 'string' ? err : '传输失败'
        setTransfers((prev) =>
          prev.map((t) => (t.id === transferId ? { ...t, phase: 'error', error: message } : t))
        )
      } finally {
        unsub()
        const timer = setTimeout(() => {
          setTransfers((prev) => prev.filter((t) => t.id !== transferId))
          cleanupTimers.current.delete(transferId)
        }, 3000)
        cleanupTimers.current.set(transferId, timer)
      }
    },
    []
  )

  const removeTransfer = useCallback((id: string) => {
    setTransfers((prev) => prev.filter((t) => t.id !== id))
    const timer = cleanupTimers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      cleanupTimers.current.delete(id)
    }
  }, [])

  return { transfers, startTransfer, removeTransfer }
}
