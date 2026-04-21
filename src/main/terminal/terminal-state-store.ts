export class TerminalStateStore<TState extends { session: { id: string } }> {
  private readonly sessions = new Map<string, TState>()

  set(sessionId: string, state: TState): void {
    this.sessions.set(sessionId, state)
  }

  get(sessionId: string): TState | undefined {
    return this.sessions.get(sessionId)
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId)
  }

  values(): TState[] {
    return Array.from(this.sessions.values())
  }
}
