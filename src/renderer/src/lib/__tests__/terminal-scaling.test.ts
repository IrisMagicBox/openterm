import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TERMINAL_FONT_SIZE,
  deriveTerminalFontSize,
  terminalDensityScale
} from '../terminal-scaling'

describe('terminal scaling', () => {
  it('uses a smaller default terminal font size', () => {
    expect(DEFAULT_TERMINAL_FONT_SIZE).toBe(11)
  })

  it('keeps one terminal at the user selected base size', () => {
    expect(deriveTerminalFontSize(11, 1)).toBe(11)
  })

  it('scales terminal content down as visible terminal count grows', () => {
    expect(deriveTerminalFontSize(11, 2)).toBe(10)
    expect(deriveTerminalFontSize(11, 4)).toBe(9)
    expect(deriveTerminalFontSize(11, 7)).toBe(8)
  })

  it('does not let density scale grow above one', () => {
    expect(terminalDensityScale(0)).toBe(1)
    expect(terminalDensityScale(1)).toBe(1)
  })
})
