import { mkdtempSync, readFileSync, rmSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { getStoredSSHKeyPath, removeStoredSSHKey, writeStoredSSHKey } from '../ssh-key-store'

let tempDir: string | undefined

function createTempDir(): string {
  tempDir = mkdtempSync(join(tmpdir(), 'openterm-ssh-key-store-test-'))
  return tempDir
}

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  tempDir = undefined
})

describe('ssh key store', () => {
  it('writes pasted key content to a stable private key file', () => {
    const userDataPath = createTempDir()
    const firstPath = writeStoredSSHKey(userDataPath, 'host-1', 'PRIVATE KEY')
    const secondPath = writeStoredSSHKey(userDataPath, 'host-1', 'PRIVATE KEY')

    expect(firstPath).toBe(secondPath)
    expect(firstPath).toBe(getStoredSSHKeyPath(userDataPath, 'host-1'))
    expect(readFileSync(firstPath, 'utf8')).toBe('PRIVATE KEY\n')

    if (process.platform !== 'win32') {
      expect(statSync(firstPath).mode & 0o777).toBe(0o600)
    }
  })

  it('removes a stored key without failing when it is already absent', () => {
    const userDataPath = createTempDir()
    const keyPath = writeStoredSSHKey(userDataPath, 'host-1', 'PRIVATE KEY')

    removeStoredSSHKey(userDataPath, 'host-1')
    expect(() => statSync(keyPath)).toThrow()
    expect(() => removeStoredSSHKey(userDataPath, 'host-1')).not.toThrow()
  })
})
