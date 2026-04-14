import { useReducer, useCallback, useState } from 'react'
import { PaneNode, PaneLeaf, PaneSplit } from '../types/pane'

let nextId = 1
function genId() {
  return `pane-${nextId++}`
}

type PaneAction =
  | { type: 'ADD_TAB'; tabId: string; targetPaneId?: string }
  | { type: 'REMOVE_TAB'; tabId: string }
  | { type: 'SET_ACTIVE_TAB'; paneId: string; tabId: string }
  | {
      type: 'SPLIT_PANE'
      paneId: string
      direction: 'horizontal' | 'vertical'
      tabIdToMove?: string
    }
  | { type: 'CLOSE_PANE'; paneId: string }
  | { type: 'RESIZE_SPLIT'; splitId: string; sizes: number[] }
  | { type: 'MOVE_TAB'; tabId: string; fromPaneId: string; toPaneId: string }

function findNode(root: PaneNode, id: string): PaneNode | null {
  if (root.id === id) return root
  if (root.type === 'split') {
    for (const child of root.children) {
      const found = findNode(child, id)
      if (found) return found
    }
  }
  return null
}

function findParent(root: PaneNode, id: string): PaneSplit | null {
  if (root.type === 'split') {
    for (const child of root.children) {
      if (child.id === id) return root
      const found = findParent(child, id)
      if (found) return found
    }
  }
  return null
}

function findLeafForTab(root: PaneNode, tabId: string): PaneLeaf | null {
  if (root.type === 'leaf') {
    if (root.tabIds.includes(tabId)) return root
    return null
  }
  for (const child of root.children) {
    const found = findLeafForTab(child, tabId)
    if (found) return found
  }
  return null
}

function getAllLeaves(root: PaneNode): PaneLeaf[] {
  if (root.type === 'leaf') return [root]
  return root.children.flatMap(getAllLeaves)
}

function cloneTree(node: PaneNode): PaneNode {
  if (node.type === 'leaf') return { ...node, tabIds: [...node.tabIds] }
  return { ...node, children: node.children.map(cloneTree), sizes: [...node.sizes] }
}

function simplifyTree(node: PaneNode): PaneNode {
  if (node.type === 'leaf') return node
  const simplifiedChildren = node.children.map(simplifyTree)
  if (simplifiedChildren.length === 1) return simplifiedChildren[0]
  return { ...node, children: simplifiedChildren }
}

function removeNode(root: PaneNode, id: string): PaneNode {
  if (root.type === 'leaf') return root
  const newChildren = root.children.filter((c) => c.id !== id).map((c) => removeNode(c, id))
  if (newChildren.length === 0) return root
  return simplifyTree({
    ...root,
    children: newChildren,
    sizes: newChildren.map(() => 100 / newChildren.length)
  })
}

function paneReducer(state: PaneNode, action: PaneAction): PaneNode {
  const newRoot = cloneTree(state)

  switch (action.type) {
    case 'ADD_TAB': {
      const targetId = action.targetPaneId
      if (!targetId) {
        const leaves = getAllLeaves(newRoot)
        if (leaves.length > 0) {
          const leaf = leaves[0]
          leaf.tabIds.push(action.tabId)
          leaf.activeTabId = action.tabId
        }
      } else {
        const node = findNode(newRoot, targetId)
        if (node && node.type === 'leaf') {
          node.tabIds.push(action.tabId)
          node.activeTabId = action.tabId
        }
      }
      return newRoot
    }

    case 'REMOVE_TAB': {
      const leaf = findLeafForTab(newRoot, action.tabId)
      if (!leaf) return state
      leaf.tabIds = leaf.tabIds.filter((id) => id !== action.tabId)
      if (leaf.activeTabId === action.tabId) {
        leaf.activeTabId = leaf.tabIds.length > 0 ? leaf.tabIds[leaf.tabIds.length - 1] : null
      }
      if (leaf.tabIds.length === 0) {
        return removeNode(newRoot, leaf.id)
      }
      return newRoot
    }

    case 'SET_ACTIVE_TAB': {
      const node = findNode(newRoot, action.paneId)
      if (node && node.type === 'leaf') {
        node.activeTabId = action.tabId
      }
      return newRoot
    }

    case 'SPLIT_PANE': {
      const node = findNode(newRoot, action.paneId)
      if (!node || node.type !== 'leaf') return state

      const newLeafId = genId()
      const newSplitId = genId()

      let originalTabIds = [...node.tabIds]
      let originalActiveTabId = node.activeTabId
      let newLeafTabIds: string[] = []
      let newLeafActiveTabId: string | null = null

      if (action.tabIdToMove && originalTabIds.includes(action.tabIdToMove)) {
        originalTabIds = originalTabIds.filter((id) => id !== action.tabIdToMove)
        newLeafTabIds = [action.tabIdToMove]
        newLeafActiveTabId = action.tabIdToMove
        if (originalActiveTabId === action.tabIdToMove) {
          originalActiveTabId = originalTabIds.length > 0 ? originalTabIds[0] : null
        }
      }

      const originalLeaf: PaneLeaf = {
        type: 'leaf',
        id: node.id,
        activeTabId: originalActiveTabId,
        tabIds: originalTabIds
      }

      const newLeaf: PaneLeaf = {
        type: 'leaf',
        id: newLeafId,
        activeTabId: newLeafActiveTabId,
        tabIds: newLeafTabIds
      }

      const split: PaneSplit = {
        type: 'split',
        id: newSplitId,
        direction: action.direction,
        children: [originalLeaf, newLeaf],
        sizes: [50, 50]
      }

      const parent = findParent(newRoot, action.paneId)
      if (!parent) return split

      const idx = parent.children.findIndex((c) => c.id === action.paneId)
      parent.children[idx] = split
      return newRoot
    }

    case 'CLOSE_PANE': {
      return removeNode(newRoot, action.paneId)
    }

    case 'RESIZE_SPLIT': {
      const node = findNode(newRoot, action.splitId)
      if (node && node.type === 'split') {
        node.sizes = [...action.sizes]
      }
      return newRoot
    }

    case 'MOVE_TAB': {
      const fromLeaf = findNode(newRoot, action.fromPaneId) as PaneLeaf | null
      const toLeaf = findNode(newRoot, action.toPaneId) as PaneLeaf | null
      if (!fromLeaf || !toLeaf || fromLeaf.type !== 'leaf' || toLeaf.type !== 'leaf') return state

      fromLeaf.tabIds = fromLeaf.tabIds.filter((id) => id !== action.tabId)
      if (fromLeaf.activeTabId === action.tabId) {
        fromLeaf.activeTabId = fromLeaf.tabIds.length > 0 ? fromLeaf.tabIds[0] : null
      }
      toLeaf.tabIds.push(action.tabId)
      toLeaf.activeTabId = action.tabId

      if (fromLeaf.tabIds.length === 0) {
        return removeNode(newRoot, fromLeaf.id)
      }
      return newRoot
    }

    default:
      return state
  }
}

export function usePaneTree() {
  const [root, dispatch] = useReducer(paneReducer, {
    type: 'leaf' as const,
    id: genId(),
    activeTabId: null,
    tabIds: []
  } as PaneNode)

  const [focusedLeafId, setFocusedLeafId] = useState<string | null>(null)

  const addTab = useCallback((tabId: string, targetPaneId?: string) => {
    dispatch({ type: 'ADD_TAB', tabId, targetPaneId })
    if (targetPaneId) {
      setFocusedLeafId(targetPaneId)
    } else {
      const leaves = getAllLeaves(root)
      if (leaves.length > 0) setFocusedLeafId(leaves[0].id)
    }
  }, [root])

  const removeTab = useCallback((tabId: string) => {
    dispatch({ type: 'REMOVE_TAB', tabId })
  }, [])

  const setActiveTab = useCallback((paneId: string, tabId: string) => {
    dispatch({ type: 'SET_ACTIVE_TAB', paneId, tabId })
    setFocusedLeafId(paneId)
  }, [])

  const splitPane = useCallback(
    (paneId: string, direction: 'horizontal' | 'vertical', tabIdToMove?: string) => {
      dispatch({ type: 'SPLIT_PANE', paneId, direction, tabIdToMove })
    },
    []
  )

  const closePane = useCallback((paneId: string) => {
    dispatch({ type: 'CLOSE_PANE', paneId })
  }, [])

  const resizeSplit = useCallback((splitId: string, sizes: number[]) => {
    dispatch({ type: 'RESIZE_SPLIT', splitId, sizes })
  }, [])

  const moveTabToPane = useCallback((tabId: string, fromPaneId: string, toPaneId: string) => {
    dispatch({ type: 'MOVE_TAB', tabId, fromPaneId, toPaneId })
    setFocusedLeafId(toPaneId)
  }, [])

  const findPaneForTab = useCallback(
    (tabId: string) => {
      return findLeafForTab(root, tabId)
    },
    [root]
  )

  const getLeaves = useCallback(() => {
    return getAllLeaves(root)
  }, [root])

  return {
    root,
    focusedLeafId,
    setFocusedLeafId,
    addTab,
    removeTab,
    setActiveTab,
    splitPane,
    closePane,
    resizeSplit,
    moveTabToPane,
    findPaneForTab,
    getLeaves
  }
}
