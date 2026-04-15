export const DOOM_LOOP_THRESHOLD = 3

export interface ToolCallSignature {
  toolName: string
  input: Record<string, unknown>
}

export class DoomLoopDetector {
  private recentCalls: ToolCallSignature[] = []

  /**
   * Check if a tool call would create a doom loop.
   * Returns true if the last DOOM_LOOP_THRESHOLD calls are all identical.
   */
  check(toolName: string, input: Record<string, unknown>): boolean {
    this.recentCalls.push({ toolName, input })
    if (this.recentCalls.length > DOOM_LOOP_THRESHOLD) {
      this.recentCalls.shift()
    }
    if (this.recentCalls.length < DOOM_LOOP_THRESHOLD) return false
    const first = this.recentCalls[0]
    return this.recentCalls.every(
      (call) =>
        call.toolName === first.toolName &&
        JSON.stringify(call.input) === JSON.stringify(first.input)
    )
  }

  /** Reset the detector after an intervention */
  reset(): void {
    this.recentCalls = []
  }
}
