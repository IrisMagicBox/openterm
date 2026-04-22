export type PaneDropEdge = 'top' | 'bottom' | 'left' | 'right'

interface PaneDropRect {
  left: number
  top: number
  width: number
  height: number
}

const CENTER_DEAD_ZONE = 0.18

function clampRatio(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function resolvePaneDropEdgeFromPoint(
  clientX: number,
  clientY: number,
  rect: PaneDropRect
): PaneDropEdge | null {
  if (rect.width <= 0 || rect.height <= 0) return null

  const xRatio = clampRatio((clientX - rect.left) / rect.width)
  const yRatio = clampRatio((clientY - rect.top) / rect.height)
  const xDelta = xRatio - 0.5
  const yDelta = yRatio - 0.5

  if (Math.abs(xDelta) < CENTER_DEAD_ZONE && Math.abs(yDelta) < CENTER_DEAD_ZONE) {
    return null
  }

  if (Math.abs(xDelta) >= Math.abs(yDelta)) {
    return xDelta < 0 ? 'left' : 'right'
  }

  return yDelta < 0 ? 'top' : 'bottom'
}

export function paneDropPreviewClass(edge: PaneDropEdge): string {
  switch (edge) {
    case 'top':
      return 'left-0 right-0 top-0 h-1/2 rounded-t-xl'
    case 'bottom':
      return 'bottom-0 left-0 right-0 h-1/2 rounded-b-xl'
    case 'left':
      return 'bottom-0 left-0 top-0 w-1/2 rounded-l-xl'
    case 'right':
      return 'bottom-0 right-0 top-0 w-1/2 rounded-r-xl'
  }
}
