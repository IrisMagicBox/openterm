import { useCallback, useMemo, useRef } from 'react'
import { Host } from '../../../shared/types'
import { PaneLeaf } from '../types/pane'
import { usePaneTree } from './usePaneTree'

export interface TerminalTab {
  host: Host
  sessionId: string
}

export function useTerminalPaneManager() {
  const {
    root,
    addTab,
    removeTab,
    setActiveTab,
    splitPane,
    closePane,
    resizeSplit,
    moveTabToPane,
    findPaneForTab,
    getLeaves,
    focusedLeafId,
    setFocusedLeafId
  } = usePaneTree()

  const tabsRef = useRef<Map<string, TerminalTab>>(new Map())

  const registerTab = useCallback((tabId: string, data: TerminalTab) => {
    tabsRef.current.set(tabId, data)
  }, [])

  const unregisterTab = useCallback((tabId: string) => {
    tabsRef.current.delete(tabId)
  }, [])

  const getTabData = useCallback((tabId: string): TerminalTab | undefined => {
    return tabsRef.current.get(tabId)
  }, [])

  const openTerminal = useCallback(
    (host: Host, sessionId: string, targetPaneId?: string) => {
      const tabId = sessionId
      tabsRef.current.set(tabId, { host, sessionId })
      addTab(tabId, targetPaneId)
      return tabId
    },
    [addTab]
  )

  const closeTerminalTab = useCallback(
    (tabId: string) => {
      tabsRef.current.delete(tabId)
      removeTab(tabId)
    },
    [removeTab]
  )

  const focusTab = useCallback(
    (tabId: string) => {
      const leaf = findPaneForTab(tabId)
      if (leaf) {
        setActiveTab(leaf.id, tabId)
      }
    },
    [findPaneForTab, setActiveTab]
  )

  const splitPaneWithTab = useCallback(
    (paneId: string, direction: 'horizontal' | 'vertical', tabIdToMove?: string) => {
      splitPane(paneId, direction, tabIdToMove)
    },
    [splitPane]
  )

  const moveTab = useCallback(
    (tabId: string, fromPaneId: string, toPaneId: string) => {
      moveTabToPane(tabId, fromPaneId, toPaneId)
    },
    [moveTabToPane]
  )

  const closePaneById = useCallback(
    (paneId: string) => {
      closePane(paneId)
    },
    [closePane]
  )

  const getAllTabs = useCallback((): TerminalTab[] => {
    return Array.from(tabsRef.current.values())
  }, [])

  const getLeafTabs = useCallback((leaf: PaneLeaf): TerminalTab[] => {
    return leaf.tabIds.map((id) => tabsRef.current.get(id)).filter((t): t is TerminalTab => !!t)
  }, [])

  const getActiveTab = useCallback((leaf: PaneLeaf): TerminalTab | undefined => {
    if (!leaf.activeTabId) return undefined
    return tabsRef.current.get(leaf.activeTabId)
  }, [])

  const isEmpty = useMemo(() => {
    const leaves = getLeaves()
    return leaves.length === 1 && leaves[0].tabIds.length === 0
  }, [root, getLeaves])

  return {
    root,
    openTerminal,
    closeTerminalTab,
    focusTab,
    splitPaneWithTab,
    moveTab,
    closePaneById,
    resizeSplit,
    registerTab,
    unregisterTab,
    getTabData,
    getAllTabs,
    getLeafTabs,
    getActiveTab,
    getLeaves,
    findPaneForTab,
    focusedLeafId,
    setFocusedLeafId,
    isEmpty
  }
}
