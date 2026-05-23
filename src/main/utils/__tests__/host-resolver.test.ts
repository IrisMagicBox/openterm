import { describe, expect, it, vi } from 'vitest'

vi.mock('../../db', () => ({
  hostDB: {
    getHosts: vi.fn(() => [
      {
        id: 'host-1',
        alias: 'testing',
        ip: '139.198.168.153',
        port: 10022,
        username: 'root',
        tags: [],
        createdAt: 1
      }
    ])
  }
}))

import { normalizeHostId, resolveHostId } from '../host-resolver'

describe('host resolver', () => {
  it('resolves hosts by id, alias, ip, and common ssh address forms', () => {
    expect(resolveHostId('host-1')?.id).toBe('host-1')
    expect(resolveHostId('@testing')?.id).toBe('host-1')
    expect(resolveHostId('139.198.168.153')?.id).toBe('host-1')
    expect(resolveHostId('139.198.168.153:10022')?.id).toBe('host-1')
    expect(resolveHostId('root@139.198.168.153')?.id).toBe('host-1')
    expect(resolveHostId('ssh://root@139.198.168.153:10022/')?.id).toBe('host-1')
  })

  it('normalizes visible host references without mutating canonical ids', () => {
    expect(normalizeHostId('@testing')).toBe('testing')
    expect(normalizeHostId(' ssh://root@139.198.168.153:10022/ ')).toBe(
      'root@139.198.168.153:10022'
    )
  })
})
