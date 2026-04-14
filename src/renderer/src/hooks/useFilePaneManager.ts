import { useCallback, useMemo, useRef } from 'react'
import { PaneLeaf } from '../types/pane'
import { usePaneTree } from './usePaneTree'

export interface FileTab {
  hostId: string
  hostAlias: string
  tabId: string
}

let nextFileTabId = 1
function genFileTabId() {
  return `ftab-${nextFileTabId++}`
}

export function useFilePaneManager() {
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

  const tabsRef = useRef<Map<string, FileTab>>(new Map())

  const registerTab = useCallback((tabId: string, data: FileTab) => {
    tabsRef.current.set(tabId, data)
  }, [])

  const unregisterTab = useCallback((tabId: string) => {
    tabsRef.current.delete(tabId)
  }, [])

  const getTabData = useCallback((tabId: string): FileTab | undefined => {
    return tabsRef.current.get(tabId)
  }, [])

  const openFileTab = useCallback(
    (hostId: string, hostAlias: string, targetPaneId?: string): string => {
      const tabId = genFileTabId()
      tabsRef.current.set(tabId, { hostId, hostAlias, tabId })
      addTab(tabId, targetPaneId)
      return tabId
    },
    [addTab]
  )

  const closeFileTab = useCallback(
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

  const getAllTabs = useCallback((): FileTab[] => {
    return Array.from(tabsRef.current.values())
  }, [])

  const getLeafTabs = useCallback((leaf: PaneLeaf): FileTab[] => {
    return leaf.tabIds.map((id) => tabsRef.current.get(id)).filter((t): t is FileTab => !!t)
  }, [])

  const getActiveTab = useCallback((leaf: PaneLeaf): FileTab | undefined => {
    if (!leaf.activeTabId) return undefined
    return tabsRef.current.get(leaf.activeTabId)
  }, [])

  const isEmpty = useMemo(() => {
    const leaves = getLeaves()
    return leaves.length === 1 && leaves[0].tabIds.length === 0
  }, [root, getLeaves])

  return {
    root,
    openFileTab,
    closeFileTab,
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
