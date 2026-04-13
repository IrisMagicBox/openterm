import type { Host } from '../../shared/types'
import { hostDB } from '../db'

export function resolveHostId(hostId: string): Host | undefined {
  const normalizedId = hostId.startsWith('@') ? hostId.slice(1) : hostId
  const hosts = hostDB.getHosts()
  return hosts.find((h) => h.id === normalizedId || h.alias === normalizedId)
}

export function normalizeHostId(hostId: string): string {
  return hostId.startsWith('@') ? hostId.slice(1) : hostId
}
