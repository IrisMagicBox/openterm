import type { CommandResult, StructuredObservation } from '../../shared/types'

export type { StructuredObservation }

export function fromCommandResult(
  result: CommandResult,
  hostId: string,
  terminalName: string
): StructuredObservation {
  return {
    hostId,
    terminalName,
    exitCode: result.exitCode,
    cwd: result.cwd,
    durationMs: result.durationMs,
    stdout: result.content,
    stderr: '',
    isTruncated: result.isTruncated
  }
}

export function formatObservation(obs: StructuredObservation): string {
  const lines: string[] = []

  lines.push(`[Host: ${obs.hostId}, Terminal: ${obs.terminalName}]`)
  lines.push(`Exit: ${obs.exitCode} | Duration: ${obs.durationMs}ms`)

  if (obs.cwd !== undefined) {
    lines.push(`CWD: ${obs.cwd}`)
  }

  if (obs.stdout.length > 0) {
    lines.push(`--- stdout ---`)
    lines.push(obs.stdout)
  }

  if (obs.stderr.length > 0) {
    lines.push(`--- stderr ---`)
    lines.push(obs.stderr)
  }

  if (obs.isTruncated && obs.truncatedAt !== undefined && obs.diskPath !== undefined) {
    lines.push(
      `[Output truncated at ${obs.truncatedAt} chars. Full output saved to: ${obs.diskPath}]`
    )
  }

  return lines.join('\n')
}
