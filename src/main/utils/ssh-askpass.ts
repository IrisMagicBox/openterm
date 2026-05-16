import { chmodSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const ASKPASS_SCRIPT = `#!/bin/sh
printf '%s\\n' "$OPENTERM_SSH_KEY_PASSPHRASE"
`

export function ensureSSHAskPassScript(userDataPath: string): string {
  const scriptPath = join(userDataPath, 'ssh-askpass.sh')
  mkdirSync(userDataPath, { recursive: true })
  writeFileSync(scriptPath, ASKPASS_SCRIPT, { mode: 0o700 })
  try {
    chmodSync(scriptPath, 0o700)
  } catch {
    // chmod is best-effort on platforms/filesystems that do not support POSIX modes.
  }
  return scriptPath
}
