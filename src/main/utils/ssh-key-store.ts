import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'
import { join } from 'path'

const SSH_KEY_DIR_NAME = 'ssh-keys'

function chmodIfSupported(path: string, mode: number): void {
  try {
    chmodSync(path, mode)
  } catch {
    // chmod is best-effort on platforms/filesystems that do not support POSIX modes.
  }
}

function normalizePrivateKey(keyContent: string): string {
  return keyContent.endsWith('\n') ? keyContent : `${keyContent}\n`
}

function storedKeyFileName(hostId: string): string {
  return `${createHash('sha256').update(hostId).digest('hex').slice(0, 32)}.key`
}

export function getStoredSSHKeyPath(userDataPath: string, hostId: string): string {
  return join(userDataPath, SSH_KEY_DIR_NAME, storedKeyFileName(hostId))
}

export function writeStoredSSHKey(
  userDataPath: string,
  hostId: string,
  keyContent: string
): string {
  const keyDir = join(userDataPath, SSH_KEY_DIR_NAME)
  mkdirSync(keyDir, { recursive: true, mode: 0o700 })
  chmodIfSupported(keyDir, 0o700)

  const keyPath = getStoredSSHKeyPath(userDataPath, hostId)
  writeFileSync(keyPath, normalizePrivateKey(keyContent), { mode: 0o600 })
  chmodIfSupported(keyPath, 0o600)
  return keyPath
}

export function removeStoredSSHKey(userDataPath: string, hostId: string): void {
  rmSync(getStoredSSHKeyPath(userDataPath, hostId), { force: true })
}
