export const DOOM_LOOP_THRESHOLD = 3

export interface ToolCallSignature {
  toolName: string
  input: Record<string, unknown>
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object') return false
  if (a === null || b === null) return false

  const objA = a as Record<string, unknown>
  const objB = b as Record<string, unknown>
  const keysA = Object.keys(objA)
  const keysB = Object.keys(objB)

  if (keysA.length !== keysB.length) return false

  keysA.sort()
  keysB.sort()

  for (let i = 0; i < keysA.length; i++) {
    if (keysA[i] !== keysB[i]) return false
    const valA = objA[keysA[i]]
    const valB = objB[keysB[i]]
    if (!deepEqual(valA, valB)) return false
  }

  return true
}

export class DoomLoopDetector {
  private recentCalls: ToolCallSignature[] = []

  check(toolName: string, input: Record<string, unknown>): boolean {
    this.recentCalls.push({ toolName, input })
    if (this.recentCalls.length > DOOM_LOOP_THRESHOLD) {
      this.recentCalls.shift()
    }
    if (this.recentCalls.length < DOOM_LOOP_THRESHOLD) return false
    const first = this.recentCalls[0]
    return this.recentCalls.every(
      (call) => call.toolName === first.toolName && deepEqual(call.input, first.input)
    )
  }

  reset(): void {
    this.recentCalls = []
  }
}
