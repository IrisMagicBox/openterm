import { spawn } from 'child_process'
import { Client } from 'ssh2'
import type { Host } from '../shared/types'
import { COMMAND_TIMEOUT_MS } from './constants'
import { buildSSHConfig } from './utils/ssh-config'
import { shellQuote } from './tools/shell-quote'

export interface CommandRunnerChunk {
  stream: 'stdout' | 'stderr'
  chunk: string
  stdout: string
  stderr: string
  content: string
}

export interface CommandRunnerOptions {
  workdir?: string
  timeoutMs?: number
  signal?: AbortSignal
  onOutputChunk?: (chunk: CommandRunnerChunk) => void
}

export interface CommandRunnerResult {
  stdout: string
  stderr: string
  content: string
  exitCode: number | null
  durationMs: number
  timedOut: boolean
  workdir?: string
}

const LOCAL_HOST_IDS = new Set(['local', 'localhost', '127.0.0.1'])

function isLocalHost(host: Host): boolean {
  return LOCAL_HOST_IDS.has(host.id) || LOCAL_HOST_IDS.has(host.ip) || host.alias === '本机'
}

function appendContent(stdout: string, stderr: string): string {
  if (!stderr) return stdout
  if (!stdout) return stderr
  return `${stdout}${stdout.endsWith('\n') ? '' : '\n'}${stderr}`
}

export class CommandRunner {
  async run(
    host: Host,
    command: string,
    options: CommandRunnerOptions = {}
  ): Promise<CommandRunnerResult> {
    return isLocalHost(host)
      ? this.runLocal(command, options)
      : this.runRemote(host, command, options)
  }

  private runLocal(
    command: string,
    options: CommandRunnerOptions
  ): Promise<CommandRunnerResult> {
    const startedAt = Date.now()
    const shell =
      process.platform === 'win32'
        ? process.env.COMSPEC || 'powershell.exe'
        : process.env.SHELL || '/bin/bash'
    const timeoutMs = Math.max(100, options.timeoutMs ?? COMMAND_TIMEOUT_MS)
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false

    return new Promise((resolve, reject) => {
      const proc = spawn(command, {
        shell,
        cwd: options.workdir || process.cwd(),
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
        windowsHide: true
      })

      const finish = (exitCode: number | null): void => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        options.signal?.removeEventListener('abort', abortHandler)
        resolve({
          stdout,
          stderr,
          content: appendContent(stdout, stderr),
          exitCode,
          durationMs: Date.now() - startedAt,
          timedOut,
          workdir: options.workdir || process.cwd()
        })
      }

      const kill = (): void => {
        try {
          if (process.platform !== 'win32' && proc.pid) {
            process.kill(-proc.pid, 'SIGTERM')
          } else {
            proc.kill()
          }
        } catch {
          try {
            proc.kill()
          } catch {
            // Process may already be gone.
          }
        }
      }

      const publish = (stream: 'stdout' | 'stderr', chunk: string): void => {
        if (stream === 'stdout') stdout += chunk
        else stderr += chunk
        options.onOutputChunk?.({
          stream,
          chunk,
          stdout,
          stderr,
          content: appendContent(stdout, stderr)
        })
      }

      const abortHandler = (): void => {
        timedOut = true
        kill()
      }

      const timeout = setTimeout(() => {
        timedOut = true
        kill()
      }, timeoutMs)

      options.signal?.addEventListener('abort', abortHandler, { once: true })
      if (options.signal?.aborted) abortHandler()

      proc.stdout?.on('data', (data: Buffer) => publish('stdout', data.toString()))
      proc.stderr?.on('data', (data: Buffer) => publish('stderr', data.toString()))
      proc.once('error', (error) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        options.signal?.removeEventListener('abort', abortHandler)
        reject(error)
      })
      proc.once('close', (code) => finish(code))
    })
  }

  private runRemote(
    host: Host,
    command: string,
    options: CommandRunnerOptions
  ): Promise<CommandRunnerResult> {
    const startedAt = Date.now()
    const client = new Client()
    const timeoutMs = Math.max(100, options.timeoutMs ?? COMMAND_TIMEOUT_MS)
    const commandWithWorkdir = options.workdir
      ? `cd ${shellQuote(options.workdir)} && ${command}`
      : command
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false

    return new Promise((resolve, reject) => {
      const cleanup = (): void => {
        clearTimeout(timeout)
        options.signal?.removeEventListener('abort', abortHandler)
        try {
          client.end()
        } catch {
          // Ignore connection cleanup failures.
        }
      }

      const finish = (exitCode: number | null): void => {
        if (settled) return
        settled = true
        cleanup()
        resolve({
          stdout,
          stderr,
          content: appendContent(stdout, stderr),
          exitCode,
          durationMs: Date.now() - startedAt,
          timedOut,
          workdir: options.workdir
        })
      }

      const fail = (error: Error): void => {
        if (settled) return
        settled = true
        cleanup()
        reject(error)
      }

      const publish = (stream: 'stdout' | 'stderr', chunk: string): void => {
        if (stream === 'stdout') stdout += chunk
        else stderr += chunk
        options.onOutputChunk?.({
          stream,
          chunk,
          stdout,
          stderr,
          content: appendContent(stdout, stderr)
        })
      }

      const abortHandler = (): void => {
        timedOut = true
        try {
          client.end()
        } catch {
          // Ignore connection cleanup failures.
        }
      }

      const timeout = setTimeout(() => {
        timedOut = true
        try {
          client.end()
        } catch {
          // Ignore connection cleanup failures.
        }
      }, timeoutMs)

      options.signal?.addEventListener('abort', abortHandler, { once: true })
      if (options.signal?.aborted) abortHandler()

      client
        .on('ready', () => {
          client.exec(commandWithWorkdir, (error, stream) => {
            if (error) {
              fail(error)
              return
            }

            stream.on('data', (data: Buffer) => publish('stdout', data.toString()))
            stream.stderr.on('data', (data: Buffer) => publish('stderr', data.toString()))
            stream.once('close', (code: number | null) => finish(code))
            stream.once('error', fail)
          })
        })
        .on('error', fail)
        .on('end', () => {
          if (timedOut && !settled) finish(null)
        })
        .on('close', () => {
          if (timedOut && !settled) finish(null)
        })
        .connect(buildSSHConfig(host))
    })
  }
}

export const commandRunner = new CommandRunner()
