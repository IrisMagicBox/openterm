import { Client } from 'ssh2'
import { ipcMain } from 'electron'
import { hostDB } from './db'
import { readFileSync, createReadStream, createWriteStream } from 'fs'
import { logger } from './logger'

interface SFTPSession {
  client: Client
  sftp: any
  hostId: string
}

const sessions = new Map<string, SFTPSession>()

export async function createSFTPSession(hostId: string): Promise<string> {
  const host = hostDB.getHostById(hostId)
  if (!host) throw new Error('Host not found')

  const config: any = { host: host.ip, port: host.port || 22, username: host.username }
  if (host.keyPath) {
    try {
      config.privateKey = readFileSync(host.keyPath)
    } catch {
      if (host.password) config.password = host.password
    }
  } else if (host.password) {
    config.password = host.password
  }

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
          sessions.set(sessionId, { client, sftp, hostId })
          logger.info('SFTP', `Session created: ${sessionId}`)
          resolve(sessionId)
        })
      })
      .on('error', reject)
      .connect(config)
  })
}

export function listDirectory(sessionId: string, remotePath: string): Promise<any[]> {
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
          list.map((item: any) => ({
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
    const readStream = createReadStream(localPath)
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
    const writeStream = createWriteStream(localPath)
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
}
