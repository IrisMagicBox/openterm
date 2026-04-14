/**
 * Pane tree data model for VS Code-style split-screen layouts.
 * Supports recursive horizontal/vertical splits with tab management per leaf.
 */

export interface PaneLeaf {
  type: 'leaf'
  id: string
  activeTabId: string | null
  tabIds: string[]
}

export interface PaneSplit {
  type: 'split'
  id: string
  direction: 'horizontal' | 'vertical'
  children: PaneNode[]
  sizes: number[] // percentages, sum to 100
}

export type PaneNode = PaneLeaf | PaneSplit

export interface PaneTreeState<T> {
  root: PaneNode
  tabs: Map<string, T>
}
