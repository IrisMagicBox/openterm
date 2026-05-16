import { readFileSync } from 'fs'
import { execFileSync } from 'child_process'
import { utils as sshUtils } from 'ssh2'
import type { Host } from '../../shared/types'
import { DEFAULT_SSH_PORT } from '../../shared/constants'

export interface SSHConnectionConfig {
  host: string
  port: number
  username: string
  privateKey?: Buffer | string
  passphrase?: string
  password?: string
  agent?: string
}

export function canUsePrivateKey(privateKey: Buffer | string, passphrase?: string): boolean {
  const parsed = sshUtils.parseKey(privateKey, passphrase)
  return !(parsed instanceof Error)
}

export function resolveSSHAuthSock(): string | undefined {
  if (process.env.SSH_AUTH_SOCK) return process.env.SSH_AUTH_SOCK
  if (process.platform !== 'darwin') return undefined

  try {
    const socket = execFileSync('launchctl', ['getenv', 'SSH_AUTH_SOCK'], {
      encoding: 'utf8'
    }).trim()
    return socket || undefined
  } catch {
    return undefined
  }
}

export function buildSSHConfig(host: Host): SSHConnectionConfig {
  const config: SSHConnectionConfig = {
    host: host.ip,
    port: host.port || DEFAULT_SSH_PORT,
    username: host.username
  }

  const agentSocket = resolveSSHAuthSock()
  if (agentSocket) {
    config.agent = agentSocket
  }

  if (host.keyContent) {
    if (canUsePrivateKey(host.keyContent, host.keyPassphrase)) {
      config.privateKey = host.keyContent
      if (host.keyPassphrase) config.passphrase = host.keyPassphrase
    }
  } else if (host.keyPath) {
    try {
      const keyFile = readFileSync(host.keyPath)
      if (canUsePrivateKey(keyFile, host.keyPassphrase)) {
        config.privateKey = keyFile
        if (host.keyPassphrase) config.passphrase = host.keyPassphrase
      }
    } catch {
      if (host.password) config.password = host.password
    }
  } else if (host.password) {
    config.password = host.password
  }

  return config
}
