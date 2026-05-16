import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { ensureSSHAskPassScript } from '../ssh-askpass'

let tempDir: string | undefined

function createTempDir(): string {
  tempDir = mkdtempSync(join(tmpdir(), 'openterm-ssh-askpass-test-'))
  return tempDir
}

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  tempDir = undefined
})

describe('ssh askpass', () => {
  it('writes an executable askpass helper that reads the passphrase from env', () => {
    const scriptPath = ensureSSHAskPassScript(createTempDir())

    expect(existsSync(scriptPath)).toBe(true)
    expect(readFileSync(scriptPath, 'utf8')).toContain('OPENTERM_SSH_KEY_PASSPHRASE')

    if (process.platform !== 'win32') {
      expect(statSync(scriptPath).mode & 0o777).toBe(0o700)
    }
  })
})
