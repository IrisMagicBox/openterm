import { useState, useEffect, useCallback } from 'react'

interface DebugEntry {
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
  timestamp: number
  category: string
  message: string
  data?: any
}

export function useDebug() {
  const [debugLogs, setDebugLogs] = useState<DebugEntry[]>([])
  const [showDebug, setShowDebug] = useState(false)

  const clearDebugLogs = useCallback(() => {
    setDebugLogs([])
  }, [])

  useEffect(() => {
    const unlisten = window.api.onDebugLog((entry: DebugEntry) => {
      setDebugLogs((prev) => [entry, ...prev].slice(0, 100))
    })

    const handleDebugKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        setShowDebug((v) => !v)
      }
    }

    window.addEventListener('keydown', handleDebugKey)

    return () => {
      if (unlisten) unlisten()
      window.removeEventListener('keydown', handleDebugKey)
    }
  }, [])

  return {
    debugLogs,
    showDebug,
    setShowDebug,
    clearDebugLogs
  }
}
