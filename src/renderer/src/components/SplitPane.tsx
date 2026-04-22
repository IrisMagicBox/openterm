import { useCallback, useEffect, useRef, useState } from 'react'
import type { PaneNode, PaneLeaf, PaneSplit } from '../types/pane'

interface SplitPaneProps {
  node: PaneNode
  renderLeaf: (leaf: PaneLeaf) => React.ReactNode
  onResizeSplit: (splitId: string, sizes: number[]) => void
  minSize?: number
}

export function SplitPane({
  node,
  renderLeaf,
  onResizeSplit,
  minSize = 80
}: SplitPaneProps): React.ReactElement {
  if (node.type === 'leaf') {
    return <div className="h-full w-full min-h-0 min-w-0 overflow-hidden">{renderLeaf(node)}</div>
  }

  return (
    <SplitContainer
      split={node}
      renderLeaf={renderLeaf}
      onResizeSplit={onResizeSplit}
      minSize={minSize}
    />
  )
}

interface SplitContainerProps {
  split: PaneSplit
  renderLeaf: (leaf: PaneLeaf) => React.ReactNode
  onResizeSplit: (splitId: string, sizes: number[]) => void
  minSize: number
}

function SplitContainer({
  split,
  renderLeaf,
  onResizeSplit,
  minSize
}: SplitContainerProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)

  const isHorizontal = split.direction === 'horizontal'

  const handleMouseDown = useCallback((index: number, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDraggingIndex(index)
  }, [])

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (draggingIndex === null || !containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      const totalSize = isHorizontal ? rect.width : rect.height
      if (totalSize <= 0) return

      const mousePos = isHorizontal ? e.clientX - rect.left : e.clientY - rect.top

      const sizes = [...split.sizes]
      const minPercent = (minSize / totalSize) * 100

      const posPercent = (mousePos / totalSize) * 100
      let leftSize = posPercent
      for (let i = 0; i < draggingIndex; i++) {
        leftSize -= sizes[i]
      }

      const pairTotal = sizes[draggingIndex] + sizes[draggingIndex + 1]
      const pairMinPercent = Math.min(minPercent, pairTotal / 2)
      const clampedLeft = Math.max(pairMinPercent, Math.min(pairTotal - pairMinPercent, leftSize))
      const diff = clampedLeft - sizes[draggingIndex]

      const newSizes = [...sizes]
      newSizes[draggingIndex] += diff
      newSizes[draggingIndex + 1] -= diff

      if (
        newSizes[draggingIndex] >= pairMinPercent &&
        newSizes[draggingIndex + 1] >= pairMinPercent
      ) {
        onResizeSplit(split.id, newSizes)
      }
    },
    [draggingIndex, split, isHorizontal, minSize, onResizeSplit]
  )

  const handleMouseUp = useCallback(() => {
    setDraggingIndex(null)
  }, [])

  useEffect(() => {
    if (draggingIndex === null) return

    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
    }
  }, [draggingIndex, handleMouseMove, handleMouseUp, isHorizontal])

  return (
    <div
      ref={containerRef}
      className={`flex ${isHorizontal ? 'flex-row' : 'flex-col'} h-full w-full min-h-0 min-w-0 flex-1 gap-2 overflow-hidden`}
    >
      {split.children.map((child, index) => (
        <div key={child.id} className="contents">
          <div
            style={{
              flex: `${split.sizes[index]} 1 0`,
              overflow: 'hidden',
              minWidth: minSize,
              minHeight: minSize
            }}
          >
            {child.type === 'leaf' ? (
              <div className="w-full h-full overflow-hidden">{renderLeaf(child as PaneLeaf)}</div>
            ) : (
              <SplitPane
                node={child}
                renderLeaf={renderLeaf}
                onResizeSplit={onResizeSplit}
                minSize={minSize}
              />
            )}
          </div>
          {index < split.children.length - 1 && (
            <div
              onMouseDown={(e) => handleMouseDown(index, e)}
              role="separator"
              aria-orientation={isHorizontal ? 'vertical' : 'horizontal'}
              className={`${
                isHorizontal
                  ? 'w-1.5 cursor-col-resize hover:bg-accent/35 active:bg-accent/50'
                  : 'h-1.5 cursor-row-resize hover:bg-accent/35 active:bg-accent/50'
              } shrink-0 rounded-full bg-workspace-border/70 transition-colors`}
            />
          )}
        </div>
      ))}
      {draggingIndex !== null && (
        <div
          className={`pointer-events-none fixed inset-0 z-[90] ${
            isHorizontal ? 'cursor-col-resize' : 'cursor-row-resize'
          }`}
        />
      )}
    </div>
  )
}
