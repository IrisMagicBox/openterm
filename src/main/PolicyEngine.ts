import { ApprovalRiskLevel, TrustLevel } from '../shared/types'
import { commandPatternDB } from './db'
import { TRUST_APPROVAL_THRESHOLD, TRUST_FAMILIAR_THRESHOLD } from './constants'

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
      return { action: 'allow', riskLevel: 'low', reason: '空命令。' }
    }

    // 1. Critical destructive patterns
    if (this.isNeverAutoApprove(command)) {
      return {
        action: 'deny',
        riskLevel: 'critical',
        reason: '检测到极度危险的系统操作（如全盘删除或格式化），已自动拦截。'
      }
    }

    // 2. Dangerous execution methods
    const dynamicExecPatterns = [
      {
        pattern: /\|\s*(bash|sh|zsh|python|node|perl|php)\b/,
        reason: '警告：检测到管道符直接执行外部脚本。'
      },
      { pattern: /\b(python|node|perl|php)\s+-c\b/, reason: '警告：检测到内联代码执行。' },
      { pattern: /\beval\s+/, reason: '警告：检测到 eval 动态执行。' },
      {
        pattern: />\s*\/dev\/(sd|nvme|mem|kmem|port|hd)/,
        reason: '警告：检测到对硬件设备的直接写操作。'
      }
    ]

    for (const { pattern, reason } of dynamicExecPatterns) {
      if (pattern.test(lower)) {
        return { action: 'confirm', riskLevel: 'high', reason }
      }
    }

    // 3. Command classification
    const firstWord = lower.split(/\s+/)[0]

    // Modification commands
    const foundModify = this.MODIFY_COMMANDS.find(
      (cmd) => firstWord === cmd || lower.startsWith(cmd + ' ')
    )
    if (foundModify) {
      const isCriticalPath = this.DANGEROUS_PATHS.some((path) => lower.includes(path))
      if (isCriticalPath) {
        return {
          action: 'confirm',
          riskLevel: 'critical',
          reason: `破坏性命令 '${foundModify}' 尝试操作系统关键路径。`
        }
      }
      return {
        action: 'confirm',
        riskLevel: 'high',
        reason: `检测到修改或删除操作: ${foundModify}`
      }
    }

    // System administration
    const foundSystem = this.SYSTEM_COMMANDS.find((cmd) => lower.includes(cmd))
    if (foundSystem) {
      return {
        action: 'confirm',
        riskLevel: 'high',
        reason: `涉及系统配置或权限管理: ${foundSystem}`
      }
    }

    // Network commands
    const foundNetwork = this.NETWORK_COMMANDS.find(
      (cmd) => firstWord === cmd || lower.startsWith(cmd + ' ')
    )
    if (foundNetwork) {
      return {
        action: 'confirm',
        riskLevel: 'medium',
        reason: `涉及外部网络访问: ${foundNetwork}`
      }
    }

    // Sensitive path access (even for read-only commands)
    const sensitiveReadCommands = [
      'cat',
      'less',
      'more',
      'tail',
      'head',
      'grep',
      'vi',
      'nano',
      'ls'
    ]
    if (sensitiveReadCommands.includes(firstWord)) {
      const foundDangerousPath = this.DANGEROUS_PATHS.find((path) => lower.includes(path))
      if (foundDangerousPath) {
        return {
          action: 'confirm',
          riskLevel: 'medium',
          reason: `正在访问系统敏感目录或文件: ${foundDangerousPath}`
        }
      }
    }

    return {
      action: 'allow',
      riskLevel: 'low',
      reason: '命令符合基础安全策略，可以自动执行。'
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

    if (existing.approvalCount >= TRUST_APPROVAL_THRESHOLD && existing.rejectionCount === 0) {
      return {
        action: 'allow',
        riskLevel: baseResult.riskLevel,
        reason: `Trusted pattern (approved ${existing.approvalCount}x without rejection): ${commandPattern}`,
        trustLevel: 'trusted',
        commandPattern,
        patternId: existing.id
      }
    }

    if (existing.approvalCount >= TRUST_FAMILIAR_THRESHOLD && existing.rejectionCount <= 1) {
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
