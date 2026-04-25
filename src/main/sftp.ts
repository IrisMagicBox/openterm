import { Client } from 'ssh2'
import { ipcMain } from 'electron'
import os from 'node:os'
import path from 'node:path'
import { hostDB } from './db'
import { createReadStream, createWriteStream } from 'fs'
import { logger } from './logger'
import { buildSSHConfig } from './utils/ssh-config'

interface SFTPSession {
  client: Client
  sftp: SFTPClient
  hostId: string
}

interface SFTPAttrs {
  isDirectory(): boolean
  mode: number
  mtime: number
  size: number
}

interface SFTPDirEntry {
  attrs: SFTPAttrs
  filename: string
}

interface SFTPFileItem {
  modifyTime: number
  name: string
  permissions: number
  size: number
  type: 'directory' | 'file'
}

interface SFTPClient {
  createReadStream(remotePath: string): NodeJS.ReadableStream
  createWriteStream(remotePath: string): NodeJS.WritableStream
  mkdir(remotePath: string, callback: (err?: Error | null) => void): void
  readdir(
    remotePath: string,
    callback: (err: Error | null | undefined, list: SFTPDirEntry[]) => void
  ): void
  rmdir(remotePath: string, callback: (err?: Error | null) => void): void
  stat(
    remotePath: string,
    callback: (err: Error | null | undefined, stats: SFTPAttrs) => void
  ): void
  unlink(remotePath: string, callback: (err?: Error | null) => void): void
}

const sessions = new Map<string, SFTPSession>()

function expandLocalPath(filePath: string): string {
  if (filePath === '~') return os.homedir()
  if (filePath.startsWith('~/')) return path.join(os.homedir(), filePath.slice(2))
  return filePath
}

export async function createSFTPSession(hostId: string): Promise<string> {
  const host = hostDB.getHostById(hostId)
  if (!host) throw new Error('Host not found')

  const config = buildSSHConfig(host)

  return new Promise((resolve, reject) => {
    const client = new Client()
    client
      .on('ready', () => {
        client.sftp((err, sftp) => {
          if (err) {
            client.end()
            reject(err)
            return
          }
          const sessionId = `sftp-${hostId}-${Date.now()}`
          sessions.set(sessionId, { client, sftp: sftp as SFTPClient, hostId })
          logger.info('SFTP', `Session created: ${sessionId}`)
          resolve(sessionId)
        })
      })
      .on('error', reject)
      .connect(config)
  })
}

export function listDirectory(sessionId: string, remotePath: string): Promise<SFTPFileItem[]> {
  return new Promise((resolve, reject) => {
    const session = sessions.get(sessionId)
    if (!session) {
      reject(new Error('SFTP session not found'))
      return
    }
    session.sftp.readdir(remotePath, (err, list) => {
      if (err) reject(err)
      else
        resolve(
          list.map((item) => ({
            name: item.filename,
            type: item.attrs.isDirectory() ? 'directory' : 'file',
            size: item.attrs.size,
            modifyTime: item.attrs.mtime * 1000,
            permissions: item.attrs.mode
          }))
        )
    })
  })
}

export function uploadFile(
  sessionId: string,
  localPath: string,
  remotePath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const session = sessions.get(sessionId)
    if (!session) {
      reject(new Error('SFTP session not found'))
      return
    }
    const readStream = createReadStream(expandLocalPath(localPath))
    const writeStream = session.sftp.createWriteStream(remotePath)
    writeStream.on('close', resolve).on('error', reject)
    readStream.on('error', reject)
    readStream.pipe(writeStream)
  })
}

export function downloadFile(
  sessionId: string,
  remotePath: string,
  localPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const session = sessions.get(sessionId)
    if (!session) {
      reject(new Error('SFTP session not found'))
      return
    }
    const readStream = session.sftp.createReadStream(remotePath)
    const writeStream = createWriteStream(expandLocalPath(localPath))
    writeStream.on('close', resolve).on('error', reject)
    readStream.on('error', reject)
    readStream.pipe(writeStream)
  })
}

export function createDirectory(sessionId: string, remotePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const session = sessions.get(sessionId)
    if (!session) {
      reject(new Error('SFTP session not found'))
      return
    }
    session.sftp.mkdir(remotePath, (err) => (err ? reject(err) : resolve()))
  })
}

export function deleteItem(sessionId: string, remotePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const session = sessions.get(sessionId)
    if (!session) {
      reject(new Error('SFTP session not found'))
      return
    }
    session.sftp.stat(remotePath, (err, stats) => {
      if (err) {
        reject(err)
        return
      }
      if (stats.isDirectory()) {
        session.sftp.rmdir(remotePath, (err) => (err ? reject(err) : resolve()))
      } else {
        session.sftp.unlink(remotePath, (err) => (err ? reject(err) : resolve()))
      }
    })
  })
}

export function closeSFTPSession(sessionId: string): void {
  const session = sessions.get(sessionId)
  if (session) {
    session.client.end()
    sessions.delete(sessionId)
    logger.info('SFTP', `Session closed: ${sessionId}`)
  }
}

function findSessionIdByHostId(hostId: string): string | undefined {
  for (const [sessionId, session] of sessions) {
    if (session.hostId === hostId) return sessionId
  }
  return undefined
}

export async function transferBetweenHosts(
  sourceHostId: string,
  sourcePath: string,
  destHostId: string,
  destPath: string,
  transferId: string,
  event: Electron.IpcMainInvokeEvent
): Promise<void> {
  const os = await import('os')
  const path = await import('path')
  const fs = await import('fs/promises')

  const tmpDir = os.tmpdir()
  const tmpFile = path.join(tmpDir, `openterm-transfer-${transferId}`)

  try {
    event.sender.send(`sftp:transfer-progress:${transferId}`, {
      phase: 'downloading',
      progress: 0,
      transferId
    })

    if (sourceHostId === 'local') {
      await fs.copyFile(sourcePath, tmpFile)
    } else {
      const sourceSessionId = findSessionIdByHostId(sourceHostId)
      if (!sourceSessionId) throw new Error(`No SFTP session for source host ${sourceHostId}`)
      logger.info('Transfer', `Using session ${sourceSessionId} for download from ${sourceHostId}`)
      await downloadFile(sourceSessionId, sourcePath, tmpFile)
    }

    event.sender.send(`sftp:transfer-progress:${transferId}`, {
      phase: 'uploading',
      progress: 50,
      transferId
    })

    if (destHostId === 'local') {
      await fs.copyFile(tmpFile, destPath)
    } else {
      const destSessionId = findSessionIdByHostId(destHostId)
      if (!destSessionId) throw new Error(`No SFTP session for destination host ${destHostId}`)
      logger.info('Transfer', `Using session ${destSessionId} for upload to ${destHostId}`)
      await uploadFile(destSessionId, tmpFile, destPath)
    }

    event.sender.send(`sftp:transfer-progress:${transferId}`, {
      phase: 'complete',
      progress: 100,
      transferId
    })
  } catch (err) {
    logger.error('Transfer', `Failed: ${err}`)
    event.sender.send(`sftp:transfer-progress:${transferId}`, {
      phase: 'error',
      progress: 0,
      transferId,
      error: String(err)
    })
    throw err
  } finally {
    try {
      await fs.unlink(tmpFile)
    } catch {
      // Temporary-file cleanup should not mask the transfer result.
    }
  }
}

export function registerSFTPIPC(): void {
  ipcMain.handle('sftp:connect', async (_, hostId: string) => {
    const sessionId = await createSFTPSession(hostId)
    return { sessionId, hostId }
  })
  ipcMain.handle('sftp:list', (_, sessionId: string, path: string) =>
    listDirectory(sessionId, path)
  )
  ipcMain.handle('sftp:upload', (_, sessionId: string, localPath: string, remotePath: string) =>
    uploadFile(sessionId, localPath, remotePath)
  )
  ipcMain.handle('sftp:download', (_, sessionId: string, remotePath: string, localPath: string) =>
    downloadFile(sessionId, remotePath, localPath)
  )
  ipcMain.handle('sftp:mkdir', (_, sessionId: string, path: string) =>
    createDirectory(sessionId, path)
  )
  ipcMain.handle('sftp:delete', (_, sessionId: string, path: string) => deleteItem(sessionId, path))
  ipcMain.handle('sftp:close', (_, sessionId: string) => {
    closeSFTPSession(sessionId)
    return true
  })
  ipcMain.handle(
    'sftp:transfer-between-hosts',
    async (
      event,
      transferId: string,
      sourceHostId: string,
      sourcePath: string,
      destHostId: string,
      destPath: string
    ) => {
      await transferBetweenHosts(sourceHostId, sourcePath, destHostId, destPath, transferId, event)
      return { success: true, transferId }
    }
  )
}
