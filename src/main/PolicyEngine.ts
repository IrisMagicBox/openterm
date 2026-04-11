import { ApprovalRiskLevel, TrustLevel } from '../shared/types'
import { commandPatternDB } from './db'

export type PolicyAction = 'allow' | 'confirm' | 'deny'

export interface PolicyResult {
  action: PolicyAction
  riskLevel: ApprovalRiskLevel
  reason: string
  trustLevel?: TrustLevel
  commandPattern?: string
  patternId?: string
}

export class PolicyEngine {
  private static DANGEROUS_PATHS = [
    '/etc',
    '/var/lib',
    '/boot',
    '/root',
    '/bin',
    '/sbin',
    '/usr/bin',
    '/usr/sbin',
    '/dev/sd',
    '/dev/nvme',
    '/etc/shadow',
    '/etc/passwd',
    '/proc',
    '/sys'
  ]

  private static MODIFY_COMMANDS = [
    'rm',
    'mkfs',
    'dd',
    'shutdown',
    'reboot',
    'halt',
    'init 0',
    'init 6',
    'mv',
    'cp',
    'tar',
    'zip',
    'unzip',
    'sed -i',
    'truncate'
  ]

  private static SYSTEM_COMMANDS = [
    'sudo',
    'systemctl',
    'service',
    'iptables',
    'ufw',
    'chmod',
    'chown',
    'useradd',
    'usermod',
    'visudo',
    'passwd',
    'apt',
    'yum',
    'dnf',
    'pacman'
  ]

  private static NETWORK_COMMANDS = [
    'curl',
    'wget',
    'ssh',
    'scp',
    'ftp',
    'nc',
    'nmap',
    'telnet',
    'git clone',
    'git push'
  ]

  private static NEVER_AUTO_APPROVE_PATTERNS = [
    /\brm\s+-rf\s+\//i,
    /\bmkfs\b/i,
    /\bdd\s+if=.*of=\/dev\//i,
    /:\(\)\{\s*:\|:&\s*\};:/,
    /\bshutdown\b/i,
    /\breboot\b/i,
    /\bhalt\b/i,
    />\s*\/dev\/sd/i
  ]

  static isNeverAutoApprove(command: string): boolean {
    return this.NEVER_AUTO_APPROVE_PATTERNS.some((p) => p.test(command))
  }

  static normalizeCommand(command: string): string {
    let normalized = command.trim()

    normalized = normalized.replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      '{uuid}'
    )

    normalized = normalized.replace(/\/home\/\w+/g, '/home/{user}')
    normalized = normalized.replace(/\/tmp\/\w+/g, '/tmp/{name}')

    normalized = normalized.replace(/"[^"]*"/g, '{str}')

    normalized = normalized.replace(/\b\d+\b/g, '{n}')

    return normalized
  }

  static evaluate(command: string): PolicyResult {
    const trimmed = command.trim()
    const lower = trimmed.toLowerCase()

    if (!trimmed) {
      return { action: 'allow', riskLevel: 'low', reason: 'Empty command.' }
    }

    if (this.isNeverAutoApprove(command)) {
      return {
        action: 'deny',
        riskLevel: 'critical',
        reason: 'Command matches a never-auto-approve pattern (dangerous system operation).'
      }
    }

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

    const foundModify = this.MODIFY_COMMANDS.find(
      (cmd) => lower.startsWith(cmd + ' ') || lower === cmd
    )
    if (foundModify) {
      const isCriticalPath = this.DANGEROUS_PATHS.some((path) => lower.includes(path))
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

    const foundSystem = this.SYSTEM_COMMANDS.find((cmd) => lower.includes(cmd))
    if (foundSystem) {
      return {
        action: 'confirm',
        riskLevel: 'high',
        reason: `System-level modification or administration: ${foundSystem}`
      }
    }

    const foundNetwork = this.NETWORK_COMMANDS.find((cmd) => lower.startsWith(cmd + ' '))
    if (foundNetwork) {
      return {
        action: 'confirm',
        riskLevel: 'medium',
        reason: `External network activity: ${foundNetwork}`
      }
    }

    const foundDangerousPath = this.DANGEROUS_PATHS.find((path) => lower.includes(path))
    if (foundDangerousPath) {
      if (lower.startsWith('ls ') || lower.startsWith('cat ') || lower.startsWith('grep ')) {
        return {
          action: 'confirm',
          riskLevel: 'medium',
          reason: `Accessing system-sensitive directory or file: ${foundDangerousPath}`
        }
      }
    }

    return {
      action: 'allow',
      riskLevel: 'low',
      reason: 'Command satisfies basic safety criteria for automatic execution.'
    }
  }

  static evaluateWithTrust(command: string, hostId: string): PolicyResult {
    const baseResult = this.evaluate(command)

    if (baseResult.action === 'deny') {
      return baseResult
    }

    if (baseResult.action === 'allow') {
      return { ...baseResult, trustLevel: 'trusted' }
    }

    if (this.isNeverAutoApprove(command)) {
      return {
        ...baseResult,
        action: 'deny',
        riskLevel: 'critical',
        reason: 'Command matches a never-auto-approve pattern (dangerous system operation).',
        trustLevel: 'untrusted'
      }
    }

    const commandPattern = this.normalizeCommand(command)
    const existing = commandPatternDB.getPatternByHostAndPattern(hostId, commandPattern)

    if (!existing) {
      return {
        ...baseResult,
        trustLevel: 'untrusted',
        commandPattern,
        patternId: undefined
      }
    }

    if (existing.approvalCount >= 3 && existing.rejectionCount === 0) {
      return {
        action: 'allow',
        riskLevel: baseResult.riskLevel,
        reason: `Trusted pattern (approved ${existing.approvalCount}x without rejection): ${commandPattern}`,
        trustLevel: 'trusted',
        commandPattern,
        patternId: existing.id
      }
    }

    if (existing.approvalCount >= 2 && existing.rejectionCount <= 1) {
      return {
        ...baseResult,
        trustLevel: 'familiar',
        commandPattern,
        patternId: existing.id
      }
    }

    return {
      ...baseResult,
      trustLevel: 'untrusted',
      commandPattern,
      patternId: existing.id
    }
  }
}
