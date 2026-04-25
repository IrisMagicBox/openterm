import { useState, useEffect, type Dispatch, type SetStateAction } from 'react'
import type { TerminalTab } from '../types'

type ZoomDirection = 'in' | 'out' | 'reset'

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
    const applyTerminalZoom = (direction: ZoomDirection): void => {
      if (document.documentElement.dataset.zoomTarget !== 'terminal') return
      if (direction === 'in') {
        setTerminalFontSize((s) => Math.min(s + 1, 30))
        return
      }
      if (direction === 'out') {
        setTerminalFontSize((s) => Math.max(s - 1, 6))
        return
      }
      setTerminalFontSize(13)
    }

    const handleZoomKey = (e: KeyboardEvent): void => {
      if (document.documentElement.dataset.zoomTarget !== 'terminal') return
      if (e.metaKey || e.ctrlKey) {
        if (e.key === '=' || e.key === '+' || e.code === 'Equal' || e.code === 'NumpadAdd') {
          e.preventDefault()
          applyTerminalZoom('in')
        } else if (
          e.key === '-' ||
          e.key === '_' ||
          e.code === 'Minus' ||
          e.code === 'NumpadSubtract'
        ) {
          e.preventDefault()
          applyTerminalZoom('out')
        } else if (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0') {
          e.preventDefault()
          applyTerminalZoom('reset')
        }
      }
    }

    window.addEventListener('keydown', handleZoomKey)
    const unlistenZoomShortcut = window.api.onZoomShortcut(({ direction }) =>
      applyTerminalZoom(direction)
    )

    return () => {
      unlistenZoomShortcut()
      window.removeEventListener('keydown', handleZoomKey)
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
