import type { Host } from '../../shared/types'
import { hostDB } from '../db'

export function resolveHostId(hostId: string): Host | undefined {
  const normalizedId = normalizeHostId(hostId)
  const hosts = hostDB.getHosts()
  return hosts.find(
    (h) =>
      h.id === normalizedId ||
      h.alias === normalizedId ||
      h.ip === normalizedId ||
      `${h.username}@${h.ip}` === normalizedId ||
      `${h.ip}:${h.port}` === normalizedId ||
      `${h.username}@${h.ip}:${h.port}` === normalizedId
  )
}

export function normalizeHostId(hostId: string): string {
  let normalized = hostId.trim()
  if (normalized.startsWith('@')) normalized = normalized.slice(1)
  normalized = normalized.replace(/^ssh:\/\//i, '')
  normalized = normalized.replace(/\/+$/, '')
  return normalized
}
