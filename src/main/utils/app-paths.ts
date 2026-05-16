import { homedir } from 'os'
import { join } from 'path'

export function getUserDataPath(): string {
  if (process.env.OPENTERM_USER_DATA_PATH) return process.env.OPENTERM_USER_DATA_PATH

  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'openterm')
  }

  if (process.platform === 'win32') {
    return join(process.env.APPDATA ?? homedir(), 'openterm')
  }

  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'openterm')
}
