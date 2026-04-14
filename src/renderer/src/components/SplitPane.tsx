import { useCallback, useRef, useState } from 'react'
import type { PaneNode, PaneLeaf, PaneSplit } from '../types/pane'

interface SplitPaneProps {
  node: PaneNode
  renderLeaf: (leaf: PaneLeaf) => React.ReactNode
  onResizeSplit: (splitId: string, sizes: number[]) => void
  minSize?: number
}

export function SplitPane({ node, renderLeaf, onResizeSplit, minSize = 80 }: SplitPaneProps) {
  if (node.type === 'leaf') {
    return <div className="flex-1 overflow-hidden">{renderLeaf(node)}</div>
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

function SplitContainer({ split, renderLeaf, onResizeSplit, minSize }: SplitContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)

  const isHorizontal = split.direction === 'horizontal'

  const handleMouseDown = useCallback((index: number, e: React.MouseEvent) => {
    e.preventDefault()
    setDraggingIndex(index)
  }, [])

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (draggingIndex === null || !containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      const totalSize = isHorizontal ? rect.width : rect.height
      const mousePos = isHorizontal ? e.clientX - rect.left : e.clientY - rect.top

      const sizes = [...split.sizes]
      const minPercent = (minSize / totalSize) * 100

      const posPercent = (mousePos / totalSize) * 100
      let leftSize = posPercent
      for (let i = 0; i < draggingIndex; i++) {
        leftSize -= sizes[i]
      }

      const clampedLeft = Math.max(minPercent, Math.min(100 - minPercent, leftSize))
      const diff = clampedLeft - sizes[draggingIndex]

      const newSizes = [...sizes]
      newSizes[draggingIndex] += diff
      newSizes[draggingIndex + 1] -= diff

      if (newSizes[draggingIndex] >= minPercent && newSizes[draggingIndex + 1] >= minPercent) {
        onResizeSplit(split.id, newSizes)
      }
    },
    [draggingIndex, split, isHorizontal, minSize, onResizeSplit]
  )

  const handleMouseUp = useCallback(() => {
    setDraggingIndex(null)
  }, [])

  return (
    <div
      ref={containerRef}
      className={`flex ${isHorizontal ? 'flex-row' : 'flex-col'} flex-1 overflow-hidden`}
      onMouseMove={draggingIndex !== null ? (e) => handleMouseMove(e.nativeEvent) : undefined}
      onMouseUp={draggingIndex !== null ? () => handleMouseUp() : undefined}
      onMouseLeave={draggingIndex !== null ? () => handleMouseUp() : undefined}
    >
      {split.children.map((child, index) => (
        <div key={child.id} className="contents">
          <div
            style={{
              flex: `${split.sizes[index]} 0 0`,
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
              className={`${
                isHorizontal
                  ? 'w-1.5 cursor-col-resize hover:bg-blue-400/60 active:bg-blue-500'
                  : 'h-1.5 cursor-row-resize hover:bg-blue-400/60 active:bg-blue-500'
              } bg-gray-200/80 transition-colors shrink-0`}
            />
          )}
        </div>
      ))}
      {draggingIndex !== null && (
        <div
          className="fixed inset-0 z-[90]"
          onMouseMove={(e) => {
            handleMouseMove(e.nativeEvent)
          }}
          onMouseUp={() => setDraggingIndex(null)}
        />
      )}
    </div>
  )
}
