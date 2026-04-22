import { describe, expect, it } from 'vitest'
import { resolvePaneDropEdgeFromPoint } from '../pane-drop'

const rect = { left: 100, top: 200, width: 400, height: 300 }

describe('pane drop zones', () => {
  it('keeps the center as a move target', () => {
    expect(resolvePaneDropEdgeFromPoint(300, 350, rect)).toBeNull()
  })

  it('resolves side halves into split edges', () => {
    expect(resolvePaneDropEdgeFromPoint(160, 350, rect)).toBe('left')
    expect(resolvePaneDropEdgeFromPoint(450, 350, rect)).toBe('right')
    expect(resolvePaneDropEdgeFromPoint(300, 230, rect)).toBe('top')
    expect(resolvePaneDropEdgeFromPoint(300, 470, rect)).toBe('bottom')
  })

  it('uses the dominant axis near corners', () => {
    expect(resolvePaneDropEdgeFromPoint(130, 320, rect)).toBe('left')
    expect(resolvePaneDropEdgeFromPoint(280, 215, rect)).toBe('top')
  })

  it('ignores invalid pane geometry', () => {
    expect(resolvePaneDropEdgeFromPoint(0, 0, { ...rect, width: 0 })).toBeNull()
    expect(resolvePaneDropEdgeFromPoint(0, 0, { ...rect, height: 0 })).toBeNull()
  })
})
