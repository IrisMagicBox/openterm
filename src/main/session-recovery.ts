import { terminalSessionDB } from './db'
import { createAgentSession } from './ssh'
import { createLocalSession } from './local-terminal'
import { getErrorMessage } from '../shared/errors'
import { logger } from './logger'
import type { TerminalSession, TerminalSessionRole } from '../shared/types'
import { WebContents } from 'electron'
import { agentService } from './agent'

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
      const role: TerminalSessionRole = session.role ?? 'agent_command'

      if (session.hostId === 'local') {
        newSessionId = await createLocalSession(
          session.id,
          session.topicId,
          webContents,
          role === 'agent_command',
          role
        )
          .then((s) => s.id)
          .catch(() => null)
      } else {
        newSessionId = await createAgentSession(
          session.hostId,
          webContents,
          session.topicId,
          role,
          session.id
        ).catch(() => null)
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
    } catch (err: unknown) {
      logger.error(
        'SessionRecovery',
        `Error recovering session ${session.id}: ${getErrorMessage(err)}`
      )
      results.push({ originalSession: session, newSessionId: null, recovered: false })
    }
  }

  return results
}

export function getRecoverableSessions(): TerminalSession[] {
  return terminalSessionDB.getActiveSessions()
}

export function handleSessionRecovery(webContents: WebContents): void {
  recoverSessions(webContents).then((results) => {
    if (results.length === 0) return
    const recovered = results.filter((r) => r.recovered)
    const failed = results.filter((r) => !r.recovered)
    for (const res of recovered) {
      if (res.newSessionId) {
        const role: TerminalSessionRole = res.originalSession.role ?? 'agent_command'
        agentService.registerSession({
          id: res.newSessionId,
          topicId: res.originalSession.topicId,
          hostId: res.originalSession.hostId,
          hostAlias: res.originalSession.hostAlias,
          status: 'active',
          role,
          shellType: res.originalSession.shellType,
          shellIntegrationReady: false,
          createdAt: Date.now(),
          paused: false,
          name: res.originalSession.name,
          visible: res.originalSession.visible ?? role !== 'agent_command'
        })
      }
    }
    logger.info(
      'SessionRecovery',
      `Recovered ${recovered.length}/${results.length} sessions, ${failed.length} failed`
    )
    webContents.send('session:recovered', {
      recovered: recovered.map((r) => ({
        originalId: r.originalSession.id,
        newSessionId: r.newSessionId,
        hostAlias: r.originalSession.hostAlias,
        topicId: r.originalSession.topicId
      })),
      failed: failed.map((r) => ({
        hostAlias: r.originalSession.hostAlias,
        topicId: r.originalSession.topicId
      }))
    })
  })
}
