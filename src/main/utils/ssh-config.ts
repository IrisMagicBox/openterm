import { readFileSync } from 'fs'
import type { Host } from '../../shared/types'
import { DEFAULT_SSH_PORT } from '../../shared/constants'

export interface SSHConnectionConfig {
  host: string
  port: number
  username: string
  privateKey?: Buffer | string
  password?: string
}

export function buildSSHConfig(host: Host): SSHConnectionConfig {
  const config: SSHConnectionConfig = {
    host: host.ip,
    port: host.port || DEFAULT_SSH_PORT,
    username: host.username
  }

  if (host.keyPath) {
    try {
      config.privateKey = readFileSync(host.keyPath)
    } catch {
      if (host.password) config.password = host.password
    }
  } else if (host.password) {
    config.password = host.password
  }

  return config
}
