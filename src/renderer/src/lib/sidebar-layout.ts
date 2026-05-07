export const SIDEBAR_COLLAPSED_WIDTH = 0
export const SIDEBAR_DEFAULT_WIDTH = 272
export const SIDEBAR_MIN_EXPANDED_WIDTH = 224
export const SIDEBAR_MAX_WIDTH = 360
export const SIDEBAR_COMPACT_THRESHOLD = 216
export const SIDEBAR_COLLAPSE_THRESHOLD = 176

export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_COLLAPSED_WIDTH, width))
}
