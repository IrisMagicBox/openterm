import { describe, it, expect } from 'vitest'
import { formatObservation, fromCommandResult } from '../observation'
import type { CommandResult, StructuredObservation } from '@shared/types'

describe('fromCommandResult', () => {
  it('maps CommandResult fields to StructuredObservation', () => {
    const result: CommandResult = {
      content: 'hello world',
      exitCode: 0,
      durationMs: 150,
      isTruncated: false,
      sessionId: 'sess-1',
      cwd: '/home/user'
    }

    const obs = fromCommandResult(result, 'host-1', 'term-1')

    expect(obs.hostId).toBe('host-1')
    expect(obs.terminalName).toBe('term-1')
    expect(obs.exitCode).toBe(0)
    expect(obs.cwd).toBe('/home/user')
    expect(obs.durationMs).toBe(150)
    expect(obs.stdout).toBe('hello world')
    expect(obs.stderr).toBe('')
    expect(obs.isTruncated).toBe(false)
  })

  it('preserves undefined cwd from CommandResult', () => {
    const result: CommandResult = {
      content: 'output',
      exitCode: 1,
      durationMs: 50,
      isTruncated: false,
      sessionId: 'sess-2'
    }

    const obs = fromCommandResult(result, 'host-2', 'term-2')
    expect(obs.cwd).toBeUndefined()
  })
})

describe('formatObservation', () => {
  it('formats a complete observation with all fields', () => {
    const obs: StructuredObservation = {
      hostId: 'host-1',
      terminalName: 'main',
      exitCode: 0,
      cwd: '/home/user/project',
      durationMs: 1234,
      stdout: 'build succeeded',
      stderr: '1 warning',
      isTruncated: false
    }

    const result = formatObservation(obs)

    expect(result).toContain('[Host: host-1, Terminal: main]')
    expect(result).toContain('Exit: 0 | Duration: 1234ms')
    expect(result).toContain('CWD: /home/user/project')
    expect(result).toContain('--- stdout ---')
    expect(result).toContain('build succeeded')
    expect(result).toContain('--- stderr ---')
    expect(result).toContain('1 warning')
  })

  it('includes truncation hint when truncated', () => {
    const obs: StructuredObservation = {
      hostId: 'h',
      terminalName: 't',
      exitCode: 0,
      durationMs: 500,
      stdout: 'x'.repeat(100),
      stderr: '',
      isTruncated: true,
      truncatedAt: 10000,
      diskPath: '/tmp/output.log'
    }

    const result = formatObservation(obs)
    expect(result).toContain(
      '[Output truncated at 10000 chars. Full output saved to: /tmp/output.log]'
    )
  })

  it('omits cwd when undefined', () => {
    const obs: StructuredObservation = {
      hostId: 'h',
      terminalName: 't',
      exitCode: 1,
      durationMs: 10,
      stdout: 'out',
      stderr: 'err',
      isTruncated: false
    }

    const result = formatObservation(obs)
    expect(result).not.toContain('CWD:')
  })

  it('omits stderr when empty', () => {
    const obs: StructuredObservation = {
      hostId: 'h',
      terminalName: 't',
      exitCode: 0,
      durationMs: 10,
      stdout: 'out',
      stderr: '',
      isTruncated: false
    }

    const result = formatObservation(obs)
    expect(result).not.toContain('--- stderr ---')
  })

  it('handles zero exit code correctly', () => {
    const obs: StructuredObservation = {
      hostId: 'h',
      terminalName: 't',
      exitCode: 0,
      durationMs: 5,
      stdout: '',
      stderr: '',
      isTruncated: false
    }

    const result = formatObservation(obs)
    expect(result).toContain('Exit: 0 | Duration: 5ms')
    expect(result).not.toContain('--- stdout ---')
    expect(result).not.toContain('--- stderr ---')
  })

  it('omits truncation hint when not truncated', () => {
    const obs: StructuredObservation = {
      hostId: 'h',
      terminalName: 't',
      exitCode: 0,
      durationMs: 5,
      stdout: 'out',
      stderr: '',
      isTruncated: false,
      truncatedAt: 1000,
      diskPath: '/tmp/file'
    }

    const result = formatObservation(obs)
    expect(result).not.toContain('Output truncated')
  })
})
