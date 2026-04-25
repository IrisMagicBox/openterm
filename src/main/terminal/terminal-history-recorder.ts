import type { TerminalIO, TerminalSession, TerminalSessionDeletedBy } from '../../shared/types'
import { terminalIODB, terminalSessionDB } from '../db'

export class TerminalHistoryRecorder {
  createSession(session: TerminalSession): void {
    if (session.topicId) terminalSessionDB.createSession(session)
  }

  updateShellIntegration(sessionId: string, ready: boolean): void {
    terminalSessionDB.updateSessionShellIntegration(sessionId, ready)
  }

  createIO(io: TerminalIO): void {
    terminalIODB.createIO(io)
  }

  closeSession(sessionId: string, deletedBy: TerminalSessionDeletedBy = 'agent'): void {
    terminalSessionDB.closeSession(sessionId, deletedBy)
    terminalIODB.markIOAsDeletedBySession(sessionId, Date.now(), deletedBy)
  }

  getRecentIO(sessionId: string, limit: number): TerminalIO[] {
    return terminalIODB.getIOBySession(sessionId, limit)
  }

  getSessionsByTopic(topicId: string): TerminalSession[] {
    return terminalSessionDB.getSessionsByTopic(topicId)
  }

  getOutputByRelatedInput(inputId: string): TerminalIO | undefined {
    return terminalIODB.getOutputByRelatedInput(inputId)
  }
}
