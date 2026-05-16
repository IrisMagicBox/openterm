import { readFileSync } from 'fs'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Host } from '../../../shared/types'
import { buildSSHConfig } from '../ssh-config'

const originalAgentSocket = process.env.SSH_AUTH_SOCK

function host(overrides: Partial<Host> = {}): Host {
  return {
    id: 'host-1',
    alias: 'test-host',
    ip: '10.0.0.1',
    port: 22,
    username: 'ubuntu',
    tags: [],
    createdAt: 1,
    ...overrides
  }
}

function fixture(name: string): string {
  return readFileSync(
    join(process.cwd(), 'node_modules/ssh2/test/fixtures/keyParser', name),
    'utf8'
  )
}

afterEach(() => {
  if (originalAgentSocket === undefined) {
    delete process.env.SSH_AUTH_SOCK
  } else {
    process.env.SSH_AUTH_SOCK = originalAgentSocket
  }
})

describe('buildSSHConfig', () => {
  it('uses parseable direct SSH key content before key path or password', () => {
    const config = buildSSHConfig(
      host({
        keyContent: fixture('openssh_new_rsa'),
        keyPath: '/missing/key',
        password: 'secret'
      })
    )

    expect(config.privateKey).toBe(fixture('openssh_new_rsa'))
    expect(config.password).toBeUndefined()
  })

  it('uses passphrase with encrypted direct key content', () => {
    const config = buildSSHConfig(
      host({
        keyContent: fixture('openssh_new_rsa_enc'),
        keyPassphrase: 'password',
        password: 'secret'
      })
    )

    expect(config.privateKey).toBe(fixture('openssh_new_rsa_enc'))
    expect(config.passphrase).toBe('password')
    expect(config.password).toBeUndefined()
  })

  it('uses ssh-agent and does not pass encrypted direct key content to ssh2 without passphrase', () => {
    process.env.SSH_AUTH_SOCK = '/tmp/test-agent.sock'

    const config = buildSSHConfig(
      host({
        keyContent: fixture('openssh_new_rsa_enc'),
        password: 'secret'
      })
    )

    expect(config.agent).toBe('/tmp/test-agent.sock')
    expect(config.privateKey).toBeUndefined()
    expect(config.password).toBeUndefined()
  })

  it('uses password when no key is configured', () => {
    const config = buildSSHConfig(host({ password: 'secret' }))

    expect(config.privateKey).toBeUndefined()
    expect(config.password).toBe('secret')
  })
})
