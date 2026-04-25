import { terminalSessionDB } from './db'
import { attachSSHSession, createAgentSession } from './ssh'
import { attachLocalSession, createLocalSession } from './local-terminal'
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

let startupRecoveryCompleted = false

async function registerRecoveredSessions(results: RecoveredSession[]): Promise<void> {
  const recovered = results.filter((r) => r.recovered)
  await Promise.all(
    recovered.map((res) => {
      if (!res.newSessionId) return Promise.resolve()
      const role: TerminalSessionRole = res.originalSession.role ?? 'agent_command'
      return agentService.registerSession({
        id: res.newSessionId,
        topicId: res.originalSession.topicId,
        hostId: res.originalSession.hostId,
        hostAlias: res.originalSession.hostAlias,
        status: 'active',
        role,
        shellType: res.originalSession.shellType,
        shellIntegrationReady: false,
        createdAt: res.originalSession.createdAt,
        paused: false,
        name: res.originalSession.name,
        visible: res.originalSession.visible ?? role !== 'agent_command',
        isPinned: res.originalSession.isPinned
      })
    })
  )
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

export async function reattachLiveSessions(webContents: WebContents): Promise<RecoveredSession[]> {
  const activeSessions = terminalSessionDB.getActiveSessions()

  if (activeSessions.length === 0) {
    logger.info('SessionRecovery', 'No active sessions to reattach')
    return []
  }

  const results: RecoveredSession[] = []
  for (const session of activeSessions) {
    const attached =
      session.hostId === 'local'
        ? attachLocalSession(session.id, webContents)
        : attachSSHSession(session.id, webContents)
    results.push({
      originalSession: session,
      newSessionId: attached ? session.id : null,
      recovered: attached
    })
  }

  return results
}

export function getRecoverableSessions(): TerminalSession[] {
  return terminalSessionDB.getActiveSessions()
}

export function handleSessionRecovery(webContents: WebContents): void {
  const recovery = startupRecoveryCompleted
    ? reattachLiveSessions(webContents)
    : recoverSessions(webContents).finally(() => {
        startupRecoveryCompleted = true
      })

  recovery.then(async (results) => {
    if (results.length === 0) return
    const recovered = results.filter((r) => r.recovered)
    const failed = results.filter((r) => !r.recovered)
    await registerRecoveredSessions(results)
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
