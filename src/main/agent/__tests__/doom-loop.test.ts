import { describe, it, expect } from 'vitest'
import { DoomLoopDetector, DOOM_LOOP_THRESHOLD } from '../doom-loop'

describe('DoomLoopDetector', () => {
  it('does not trigger before threshold', () => {
    const d = new DoomLoopDetector()
    expect(d.check('bash', { cmd: 'ls' })).toBe(false)
    expect(d.check('bash', { cmd: 'ls' })).toBe(false)
  })

  it('triggers at threshold with identical calls', () => {
    const d = new DoomLoopDetector()
    d.check('bash', { cmd: 'ls' })
    d.check('bash', { cmd: 'ls' })
    expect(d.check('bash', { cmd: 'ls' })).toBe(true)
  })

  it('does not trigger with different calls', () => {
    const d = new DoomLoopDetector()
    d.check('bash', { cmd: 'ls' })
    d.check('bash', { cmd: 'pwd' })
    expect(d.check('bash', { cmd: 'cat' })).toBe(false)
  })

  it('resets after clear', () => {
    const d = new DoomLoopDetector()
    d.check('bash', { cmd: 'ls' })
    d.check('bash', { cmd: 'ls' })
    d.reset()
    expect(d.check('bash', { cmd: 'ls' })).toBe(false)
  })

  it('does not trigger with same tool but different args', () => {
    const d = new DoomLoopDetector()
    d.check('execute_command', { hostId: 'h1', command: 'ls' })
    d.check('execute_command', { hostId: 'h1', command: 'pwd' })
    expect(d.check('execute_command', { hostId: 'h1', command: 'ls' })).toBe(false)
  })

  it('DOOM_LOOP_THRESHOLD is 3', () => {
    expect(DOOM_LOOP_THRESHOLD).toBe(3)
  })
})
