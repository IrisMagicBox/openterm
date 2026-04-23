import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { CommandRunner } from '../command-runner'
import type { Host } from '../../shared/types'

const tmpDirs: string[] = []

function localHost(): Host {
  return {
    id: 'local',
    alias: '本机',
    ip: 'localhost',
    port: 22,
    username: 'local',
    tags: [],
    createdAt: Date.now()
  }
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('CommandRunner', () => {
  it('runs local commands with stdout/stderr and workdir separated from visible PTY sessions', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openterm-command-runner-'))
    tmpDirs.push(dir)
    fs.writeFileSync(path.join(dir, 'marker.txt'), 'ok')

    const chunks: string[] = []
    const result = await new CommandRunner().run(localHost(), 'pwd && ls marker.txt', {
      workdir: dir,
      onOutputChunk: ({ content }) => chunks.push(content)
    })

    expect(result.exitCode).toBe(0)
    expect(result.workdir).toBe(dir)
    expect(result.stdout).toContain(dir)
    expect(result.stdout).toContain('marker.txt')
    expect(result.stderr).toBe('')
    expect(chunks.length).toBeGreaterThan(0)
  })

  it('marks local commands as timed out when they exceed timeoutMs', async () => {
    const result = await new CommandRunner().run(
      localHost(),
      'node -e "setTimeout(() => {}, 2000)"',
      { timeoutMs: 100 }
    )

    expect(result.timedOut).toBe(true)
    expect(result.exitCode).not.toBe(0)
  })
})
