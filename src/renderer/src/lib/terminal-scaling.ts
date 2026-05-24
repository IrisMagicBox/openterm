export const DEFAULT_TERMINAL_FONT_SIZE = 11
export const MIN_TERMINAL_FONT_SIZE = 6
export const MAX_TERMINAL_FONT_SIZE = 30

export function clampTerminalFontSize(fontSize: number): number {
  if (!Number.isFinite(fontSize)) return DEFAULT_TERMINAL_FONT_SIZE
  return Math.max(MIN_TERMINAL_FONT_SIZE, Math.min(MAX_TERMINAL_FONT_SIZE, Math.round(fontSize)))
}

export function terminalDensityScale(visibleTerminalCount: number): number {
  const count = Math.max(1, Math.floor(visibleTerminalCount))
  if (count <= 1) return 1
  if (count === 2) return 0.9
  if (count <= 4) return 0.82
  if (count <= 6) return 0.76
  return 0.72
}

export function deriveTerminalFontSize(
  baseFontSize: number,
  visibleTerminalCount: number
): number {
  const base = clampTerminalFontSize(baseFontSize)
  return clampTerminalFontSize(base * terminalDensityScale(visibleTerminalCount))
}
