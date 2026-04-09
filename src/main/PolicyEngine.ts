import { ApprovalRiskLevel } from '../shared/types'

export type PolicyAction = 'allow' | 'confirm' | 'deny'

export interface PolicyResult {
  action: PolicyAction
  riskLevel: ApprovalRiskLevel
  reason: string
}

export class PolicyEngine {
  /**
   * System-critical paths that should trigger higher risk levels
   */
  private static DANGEROUS_PATHS = [
    '/etc', '/var/lib', '/boot', '/root', '/bin', '/sbin', '/usr/bin', '/usr/sbin', 
    '/dev/sd', '/dev/nvme', '/etc/shadow', '/etc/passwd', '/proc', '/sys'
  ]

  /**
   * Commands that can modify or delete data
   */
  private static MODIFY_COMMANDS = [
    'rm', 'mkfs', 'dd', 'shutdown', 'reboot', 'halt', 'init 0', 'init 6', 
    'mv', 'cp', 'tar', 'zip', 'unzip', 'sed -i', 'truncate'
  ]

  /**
   * Commands that affect system state or permissions
   */
  private static SYSTEM_COMMANDS = [
    'sudo', 'systemctl', 'service', 'iptables', 'ufw', 'chmod', 'chown', 
    'useradd', 'usermod', 'visudo', 'passwd', 'apt', 'yum', 'dnf', 'pacman'
  ]

  /**
   * Commands that initiate external communication
   */
  private static NETWORK_COMMANDS = [
    'curl', 'wget', 'ssh', 'scp', 'ftp', 'nc', 'nmap', 'telnet', 'git clone', 'git push'
  ]

  /**
   * Evaluates a command against the security policy to determine risk.
   */
  static evaluate(command: string): PolicyResult {
    const trimmed = command.trim()
    const lower = trimmed.toLowerCase()
    
    if (!trimmed) {
      return { action: 'allow', riskLevel: 'low', reason: 'Empty command.' }
    }

    // 1. Detect Code Injection / Remote Execution patterns
    if (
      lower.includes('| bash') || 
      lower.includes('| sh') || 
      lower.includes('python -c') || 
      lower.includes('node -e') || 
      lower.includes('eval ') ||
      lower.includes('> /dev/')
    ) {
      return { 
        action: 'confirm', 
        riskLevel: 'high', 
        reason: 'Detected dynamic code execution or direct hardware pipe.' 
      }
    }

    // 2. Check for Modification/Deletion
    const foundModify = this.MODIFY_COMMANDS.find(cmd => lower.startsWith(cmd + ' ') || lower === cmd)
    if (foundModify) {
      const isCriticalPath = this.DANGEROUS_PATHS.some(path => lower.includes(path))
      if (isCriticalPath) {
        return { 
          action: 'confirm', 
          riskLevel: 'critical', 
          reason: `Destructive command '${foundModify}' targeting system-critical paths.` 
        }
      }
      return { 
        action: 'confirm', 
        riskLevel: 'high', 
        reason: `Potentially destructive command: ${foundModify}` 
      }
    }

    // 3. Check for System Administration
    const foundSystem = this.SYSTEM_COMMANDS.find(cmd => lower.includes(cmd))
    if (foundSystem) {
      return { 
        action: 'confirm', 
        riskLevel: 'high', 
        reason: `System-level modification or administration: ${foundSystem}` 
      }
    }

    // 4. Check for Network Activity
    const foundNetwork = this.NETWORK_COMMANDS.find(cmd => lower.startsWith(cmd + ' '))
    if (foundNetwork) {
      return { 
        action: 'confirm', 
        riskLevel: 'medium', 
        reason: `External network activity: ${foundNetwork}` 
      }
    }

    // 5. Check for sensitive path access even in read commands
    const foundDangerousPath = this.DANGEROUS_PATHS.find(path => lower.includes(path))
    if (foundDangerousPath) {
      // Allow general ls/cat/grep on paths but with confirmation if they look sensitive
      if (lower.startsWith('ls ') || lower.startsWith('cat ') || lower.startsWith('grep ')) {
         return { 
           action: 'confirm', 
           riskLevel: 'medium', 
           reason: `Accessing system-sensitive directory or file: ${foundDangerousPath}` 
         }
      }
    }

    // 6. Default to Low Risk for everything else (usually read-only or local non-destructive)
    return { 
      action: 'allow', 
      riskLevel: 'low', 
      reason: 'Command satisfies basic safety criteria for automatic execution.' 
    }
  }
}
