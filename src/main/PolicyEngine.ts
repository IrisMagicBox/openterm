import { ApprovalRiskLevel, TrustLevel } from '../shared/types'
import { commandPatternDB } from './db'
import { TRUST_APPROVAL_THRESHOLD, TRUST_FAMILIAR_THRESHOLD } from './constants'
import { ShellAnalyzer } from './utils/shell-analyzer'

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
    if (!trimmed) {
      return { action: 'allow', riskLevel: 'low', reason: '空命令。' }
    }

    const segments = ShellAnalyzer.splitSegments(trimmed)
    const results: PolicyResult[] = []

    for (const segment of segments) {
      const lowerCmd = segment.command.toLowerCase()
      const lowerRaw = segment.raw.toLowerCase()

      // 1. Critical destructive patterns (per segment)
      if (this.isNeverAutoApprove(segment.raw)) {
        return {
          action: 'deny',
          riskLevel: 'critical',
          reason: `片段 '${segment.raw}' 包含极度危险的操作，已拦截。`
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
        if (pattern.test(lowerRaw)) {
          results.push({ action: 'confirm', riskLevel: 'high', reason })
        }
      }

      // Redirection audit
      if (ShellAnalyzer.hasDangerousRedirection(segment.raw)) {
        results.push({
          action: 'confirm',
          riskLevel: 'critical',
          reason: `警告：检测到试图通过重定向修改系统敏感路径: ${segment.raw}`
        })
      }

      // 3. Command classification
      // Modification commands
      const foundModify = this.MODIFY_COMMANDS.find(
        (cmd) => lowerCmd === cmd || lowerRaw.startsWith(cmd + ' ')
      )
      if (foundModify) {
        const isCriticalPath = this.DANGEROUS_PATHS.some((path) => lowerRaw.includes(path))
        if (isCriticalPath) {
          results.push({
            action: 'confirm',
            riskLevel: 'critical',
            reason: `破坏性命令 '${foundModify}' 尝试操作关键路径: ${segment.raw}`
          })
        } else {
          results.push({
            action: 'confirm',
            riskLevel: 'high',
            reason: `检测到修改或删除操作: ${foundModify}`
          })
        }
      }

      // System administration
      const foundSystem = this.SYSTEM_COMMANDS.find((cmd) => lowerRaw.includes(cmd))
      if (foundSystem) {
        results.push({
          action: 'confirm',
          riskLevel: 'high',
          reason: `涉及系统配置或权限管理: ${foundSystem}`
        })
      }

      // Network commands
      const foundNetwork = this.NETWORK_COMMANDS.find(
        (cmd) => lowerCmd === cmd || lowerRaw.startsWith(cmd + ' ')
      )
      if (foundNetwork) {
        results.push({
          action: 'confirm',
          riskLevel: 'medium',
          reason: `涉及外部网络访问: ${foundNetwork}`
        })
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
      if (sensitiveReadCommands.includes(lowerCmd)) {
        const foundDangerousPath = this.DANGEROUS_PATHS.find((path) => lowerRaw.includes(path))
        if (foundDangerousPath) {
          results.push({
            action: 'confirm',
            riskLevel: 'medium',
            reason: `正在访问系统敏感目录或文件: ${foundDangerousPath}`
          })
        }
      }
    }

    // Determine aggregate result: highest risk wins
    if (results.length === 0) {
      return {
        action: 'allow',
        riskLevel: 'low',
        reason: '命令符合基础安全策略，可以自动执行。'
      }
    }

    // Sort by risk level importance
    const riskPriority: Record<ApprovalRiskLevel, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1
    }

    const worstResult = results.sort((a, b) => riskPriority[b.riskLevel] - riskPriority[a.riskLevel])[0]
    return {
      ...worstResult,
      action: 'confirm' // Aggregate result that hit a policy is always confirm
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
