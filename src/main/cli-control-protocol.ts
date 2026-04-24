import os from 'node:os'
import path from 'node:path'

export interface CliControlRequest {
  id: string
  command: string
  args?: Record<string, unknown>
}

export interface CliControlResponse {
  id: string
  ok: boolean
  data?: unknown
  result?: unknown
  error?: string
}

export function getCliControlSocketPath(): string {
  if (process.env.OPENTERM_CONTROL_SOCKET) return process.env.OPENTERM_CONTROL_SOCKET
  if (process.platform === 'win32') return '\\\\.\\pipe\\opentermctl'
  return path.join(defaultAppDataDir(), 'opentermctl.sock')
}

function defaultAppDataDir(): string {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'openterm')
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA ?? os.homedir(), 'openterm')
  }
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'openterm')
}
