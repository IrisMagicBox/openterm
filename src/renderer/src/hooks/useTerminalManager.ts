import { useState, useEffect, type Dispatch, type SetStateAction } from 'react'
import type { TerminalTab } from '../types'

interface TerminalManagerState {
  terminalTabs: TerminalTab[]
  setTerminalTabs: Dispatch<SetStateAction<TerminalTab[]>>
  activeTerminalTabIndex: number
  setActiveTerminalTabIndex: Dispatch<SetStateAction<number>>
  terminalSessionId: string | null
  setTerminalSessionId: Dispatch<SetStateAction<string | null>>
  terminalFontSize: number
  setTerminalFontSize: Dispatch<SetStateAction<number>>
  terminalWidth: number
  setTerminalWidth: Dispatch<SetStateAction<number>>
  commandHistoryOpen: boolean
  setCommandHistoryOpen: Dispatch<SetStateAction<boolean>>
  sidebarCollapsed: boolean
  setSidebarCollapsed: Dispatch<SetStateAction<boolean>>
  fileBrowserHostId: string | null
  setFileBrowserHostId: Dispatch<SetStateAction<string | null>>
  fileBrowserHostAlias: string
  setFileBrowserHostAlias: Dispatch<SetStateAction<string>>
}

export function useTerminalManager(): TerminalManagerState {
  const [terminalTabs, setTerminalTabs] = useState<TerminalTab[]>([])
  const [activeTerminalTabIndex, setActiveTerminalTabIndex] = useState(0)
  const [terminalSessionId, setTerminalSessionId] = useState<string | null>(null)
  const [terminalFontSize, setTerminalFontSize] = useState(13)
  const [terminalWidth, setTerminalWidth] = useState(500)
  const [commandHistoryOpen, setCommandHistoryOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [fileBrowserHostId, setFileBrowserHostId] = useState<string | null>(null)
  const [fileBrowserHostAlias, setFileBrowserHostAlias] = useState('')

  useEffect(() => {
    const handleZoomKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === '=' || e.key === '+' || e.code === 'Equal' || e.code === 'NumpadAdd') {
          e.preventDefault()
          setTerminalFontSize((s) => Math.min(s + 1, 30))
        } else if (
          e.key === '-' ||
          e.key === '_' ||
          e.code === 'Minus' ||
          e.code === 'NumpadSubtract'
        ) {
          e.preventDefault()
          setTerminalFontSize((s) => Math.max(s - 1, 6))
        } else if (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0') {
          e.preventDefault()
          setTerminalFontSize(13)
        }
      }
    }

    const handleCommandHistoryKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'r') {
        e.preventDefault()
        setCommandHistoryOpen(true)
      }
    }

    window.addEventListener('keydown', handleZoomKey)
    window.addEventListener('keydown', handleCommandHistoryKey)

    return () => {
      window.removeEventListener('keydown', handleZoomKey)
      window.removeEventListener('keydown', handleCommandHistoryKey)
    }
  }, [])

  return {
    terminalTabs,
    setTerminalTabs,
    activeTerminalTabIndex,
    setActiveTerminalTabIndex,
    terminalSessionId,
    setTerminalSessionId,
    terminalFontSize,
    setTerminalFontSize,
    terminalWidth,
    setTerminalWidth,
    commandHistoryOpen,
    setCommandHistoryOpen,
    sidebarCollapsed,
    setSidebarCollapsed,
    fileBrowserHostId,
    setFileBrowserHostId,
    fileBrowserHostAlias,
    setFileBrowserHostAlias
  }
}
