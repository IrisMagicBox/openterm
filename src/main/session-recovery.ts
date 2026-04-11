import { terminalSessionDB } from './db'
import { createAgentSession } from './ssh'
import { createLocalSession } from './local-terminal'
import { logger } from './logger'
import type { TerminalSession } from '../shared/types'
import { WebContents } from 'electron'

interface RecoveredSession {
  originalSession: TerminalSession
  newSessionId: string | null
  recovered: boolean
}

export async function recoverSessions(webContents: WebContents): Promise<RecoveredSession[]> {
  const activeSessions = terminalSessionDB.getActiveSessions()

  if (activeSessions.length === 0) {
    logger.info('SessionRecovery', 'No active sessions to recover')
    return []
  }

  logger.info('SessionRecovery', `Found ${activeSessions.length} active sessions to recover`)

  terminalSessionDB.markAllSessionsClosed()

  const results: RecoveredSession[] = []

  for (const session of activeSessions) {
    try {
      let newSessionId: string | null = null

      if (session.hostId === 'local') {
        newSessionId = await createLocalSession(session.id, session.topicId, webContents, true)
          .then((s) => s.id)
          .catch(() => null)
      } else {
        newSessionId = await createAgentSession(session.hostId, webContents, session.topicId).catch(
          () => null
        )
      }

      if (newSessionId) {
        logger.info(
          'SessionRecovery',
          `Recovered session for ${session.hostAlias} (${session.hostId})`
        )
        results.push({ originalSession: session, newSessionId, recovered: true })
      } else {
        logger.warn(
          'SessionRecovery',
          `Failed to recover session for ${session.hostAlias} (${session.hostId})`
        )
        results.push({ originalSession: session, newSessionId: null, recovered: false })
      }
    } catch (err: any) {
      logger.error('SessionRecovery', `Error recovering session ${session.id}: ${err.message}`)
      results.push({ originalSession: session, newSessionId: null, recovered: false })
    }
  }

  return results
}

export function getRecoverableSessions(): TerminalSession[] {
  return terminalSessionDB.getActiveSessions()
}
