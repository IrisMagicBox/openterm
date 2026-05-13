import { z } from 'zod'
import { define, Tool } from './tool-factory'
import { commandExecutor, TerminalScreenHistoryEntry, TerminalScreenSnapshot } from '../terminal'
import { normalizeHostId, resolveHostId } from '../utils/host-resolver'
import { shellQuote } from './shell-quote'
import { PolicyEngine } from '../PolicyEngine'
import { permissionDB } from '../db'
import { shouldRequestApproval } from '../permissions'
import { ShellAnalyzer } from '../utils/shell-analyzer'

const KEY_SEQUENCES = {
  Enter: '\r',
  Return: '\r',
  Tab: '\t',
  Escape: '\x1b',
  Esc: '\x1b',
  Backspace: '\x7f',
  Delete: '\x1b[3~',
  ArrowUp: '\x1b[A',
  ArrowDown: '\x1b[B',
  ArrowRight: '\x1b[C',
  ArrowLeft: '\x1b[D',
  Up: '\x1b[A',
  Down: '\x1b[B',
  Right: '\x1b[C',
  Left: '\x1b[D',
  Home: '\x1b[H',
  End: '\x1b[F',
  PageUp: '\x1b[5~',
  PageDown: '\x1b[6~',
  Space: ' ',
  CtrlA: '\x01',
  CtrlC: '\x03',
  CtrlD: '\x04',
  CtrlE: '\x05',
  CtrlL: '\x0c',
  CtrlU: '\x15',
  F1: '\x1bOP',
  F2: '\x1bOQ',
  F3: '\x1bOR',
  F4: '\x1bOS',
  F5: '\x1b[15~',
  F6: '\x1b[17~',
  F7: '\x1b[18~',
  F8: '\x1b[19~',
  F9: '\x1b[20~',
  F10: '\x1b[21~',
  F11: '\x1b[23~',
  F12: '\x1b[24~'
} as const

const KEY_NAMES = Object.keys(KEY_SEQUENCES) as [keyof typeof KEY_SEQUENCES]

type TerminalKeyName = keyof typeof KEY_SEQUENCES

const observeParameters = z.object({
  sessionId: z.string().optional().describe('要观察的终端会话 ID。已有终端优先传这个。'),
  hostId: z
    .string()
    .optional()
    .describe('没有 sessionId 时指定主机 ID 或 @别名，工具会复用或打开一个终端。'),
  terminalName: z.string().optional().describe('没有 sessionId 时用于复用或创建的终端名称。'),
  includeHistory: z
    .boolean()
    .default(false)
    .describe('是否包含最近屏幕变化摘要。长 TUI 任务复盘时设为 true。'),
  sinceUpdatedAt: z.number().optional().describe('只返回该时间戳之后的屏幕变化历史。'),
  maxHistory: z.number().min(1).max(120).default(12).describe('最多返回多少条屏幕变化历史。'),
  reason: z.string().optional().describe('观察这个终端的原因。')
})

const keyNameSchema = z.enum(KEY_NAMES)

const sendParameters = z.object({
  sessionId: z.string().describe('要控制的终端会话 ID。'),
  text: z
    .string()
    .max(4000)
    .optional()
    .describe('要输入的普通文本。此字段只会输入文本；提交请使用 submit=true 或 keys: ["Enter"]。'),
  submit: z
    .boolean()
    .default(false)
    .describe(
      '当 text 存在时自动追加 Enter/Return。若 keys 中已经包含 Enter/Return，则不会重复追加。'
    ),
  keys: z.array(keyNameSchema).max(100).optional().describe('要发送的特殊按键列表。'),
  sequence: z
    .array(
      z.object({
        text: z.string().max(4000).optional().describe('本步骤输入的普通文本。'),
        key: keyNameSchema.optional().describe('本步骤发送的特殊按键。')
      })
    )
    .max(100)
    .optional()
    .describe('按顺序发送文本和按键；需要精确交互时优先使用。'),
  reason: z.string().describe('为什么要发送这些输入。')
})

const waitParameters = z.object({
  sessionId: z.string().describe('要等待的终端会话 ID。'),
  text: z.string().optional().describe('等待屏幕上出现的固定文本。'),
  regex: z.string().optional().describe('等待屏幕匹配的正则表达式。'),
  timeoutMs: z.number().min(100).max(300000).default(10000).describe('最长等待毫秒数。'),
  stableMs: z
    .number()
    .min(0)
    .max(10000)
    .default(0)
    .describe('匹配后屏幕需要保持不变的毫秒数，适合等待 TUI 渲染稳定。'),
  reason: z.string().optional().describe('等待这个界面状态的原因。')
})

const waitActivityParameters = z.object({
  sessionId: z.string().describe('要等待的终端会话 ID。'),
  timeoutMs: z.number().min(100).max(300000).default(120000).describe('最长等待毫秒数。'),
  idleMs: z
    .number()
    .min(250)
    .max(30000)
    .default(3000)
    .describe('屏幕发生变化后静默多久视为阶段稳定。'),
  stopText: z.string().optional().describe('可选：等待新屏幕变化中出现的固定文本。'),
  stopRegex: z.string().optional().describe('可选：等待新屏幕变化匹配的正则表达式。'),
  requireFreshMatch: z
    .boolean()
    .default(true)
    .describe('是否要求 stopText/stopRegex 出现在本次等待之后的新变化中，避免误命中旧屏。'),
  returnOnIdle: z
    .boolean()
    .default(false)
    .describe(
      '兼容旧行为：屏幕变化后静默达到 idleMs 即返回 idle。默认 false，会继续区分 stable_output / awaiting_input / running。'
    ),
  reason: z.string().optional().describe('等待这个 TUI 阶段的原因。')
})

const startInteractiveParameters = z.object({
  hostId: z.string().describe('主机 ID 或 @别名。'),
  terminalName: z.string().optional().describe('交互终端名称；未指定时会复用或创建一个。'),
  command: z.string().describe('要启动的 TUI/REPL/安装器/菜单类交互命令。'),
  workdir: z
    .string()
    .optional()
    .describe('命令工作目录。优先使用此字段，不要手写 cd <dir> && command。'),
  waitForInitialActivity: z
    .boolean()
    .default(true)
    .describe('启动后是否等待首屏变化并返回最终屏幕。'),
  initialWaitMs: z.number().min(100).max(30000).default(5000).describe('首屏等待毫秒数。'),
  reason: z.string().describe('为什么需要启动这个交互命令。')
})

const interactParameters = sendParameters.extend({
  waitFor: z
    .enum(['activity', 'text', 'none'])
    .default('activity')
    .describe('发送输入后等待什么：activity 等屏幕变化稳定，text 等明确文本，none 只发送并观察。'),
  expectText: z.string().optional().describe('waitFor 为 text/activity 时可等待的新文本。'),
  expectRegex: z.string().optional().describe('waitFor 为 text/activity 时可等待的新正则。'),
  timeoutMs: z.number().min(100).max(300000).default(120000).describe('最长等待毫秒数。'),
  idleMs: z
    .number()
    .min(250)
    .max(30000)
    .default(3000)
    .describe('waitFor=activity 时，屏幕变化后静默多久视为阶段稳定。'),
  stableMs: z
    .number()
    .min(0)
    .max(10000)
    .default(0)
    .describe('waitFor=text 时，匹配后屏幕需要保持不变的毫秒数。'),
  requireFreshMatch: z
    .boolean()
    .default(true)
    .describe('waitFor=activity 时，expectText/expectRegex 是否必须出现在本次输入后的新变化中。'),
  includeHistory: z.boolean().default(true).describe('是否返回最近屏幕变化摘要。')
})

function summarizeText(text: string): string {
  const normalized = text.replace(/\s+/g, ' ')
  if (normalized.length <= 120) return JSON.stringify(normalized)
  return `${JSON.stringify(normalized.slice(0, 120))}... (${text.length} chars)`
}

function formatSnapshot(snapshot: TerminalScreenSnapshot, full = false): string {
  const displayRows = full ? snapshot.lines.map((line) => line.row) : compactRows(snapshot)
  const numberedLines = displayRows
    .map((row) => {
      const line = snapshot.lines[row]
      const cursor = row === snapshot.cursorY ? '>' : ' '
      return `${String(row + 1).padStart(2, '0')}${cursor} ${line?.text ?? ''}`
    })
    .join('\n')
    .replace(/\s+$/g, '')

  return [
    `sessionId: ${snapshot.sessionId}`,
    `host: ${snapshot.hostAlias} (${snapshot.hostId})`,
    `size: ${snapshot.cols}x${snapshot.rows}, cursor: ${snapshot.cursorX + 1},${snapshot.cursorY + 1}, buffer: ${snapshot.bufferType}`,
    `locked: ${snapshot.isLocked ? snapshot.lockedBy || 'unknown' : 'false'}, runningCommand: ${snapshot.isCommandRunning}`,
    `phase: ${snapshot.phase ?? 'unknown'}${snapshot.phaseConfidence ? ` (${snapshot.phaseConfidence})` : ''}, menuLike: ${snapshot.menuLike ?? false}, progress: ${snapshot.hasProgress ?? false}, spinner: ${snapshot.hasSpinner ?? false}`,
    snapshot.selectedLineText ? `selected: ${snapshot.selectedLineText}` : '',
    snapshot.inputHints?.length ? `inputHints: ${snapshot.inputHints.join(', ')}` : '',
    'screen:',
    '```text',
    numberedLines || '(blank)',
    '```'
  ]
    .filter(Boolean)
    .join('\n')
}

function compactRows(snapshot: TerminalScreenSnapshot): number[] {
  const rows = new Set<number>()
  snapshot.lines.forEach((line) => {
    if (line.text.trim()) rows.add(line.row)
  })
  for (let row = snapshot.cursorY - 3; row <= snapshot.cursorY + 3; row++) {
    if (row >= 0 && row < snapshot.lines.length) rows.add(row)
  }
  return [...rows].sort((a, b) => a - b).slice(-24)
}

function formatHistory(history: TerminalScreenHistoryEntry[]): string {
  if (history.length === 0) return 'recent changes: (none)'
  const chunks = history.slice(-12).map((entry) => {
    const changedRows = entry.changedLines
      .slice(-6)
      .map((line) => String(line.row + 1))
      .join(', ')
    return [
      `- updatedAt=${entry.updatedAt}, cursor=${entry.cursorX + 1},${entry.cursorY + 1}, buffer=${entry.bufferType}, changedRows=${changedRows || '(none)'}`,
      entry.excerpt
        .split('\n')
        .slice(-8)
        .map((line) => `  ${line}`)
        .join('\n')
    ]
      .filter(Boolean)
      .join('\n')
  })
  return ['recent changes:', ...chunks].join('\n')
}

async function resolveSessionId(
  args: z.infer<typeof observeParameters>,
  ctx: Tool.Context
): Promise<{ sessionId?: string; error?: string }> {
  if (args.sessionId) {
    return { sessionId: args.sessionId }
  }

  if (!args.hostId) {
    return { error: 'Error: observe_terminal requires either sessionId or hostId.' }
  }

  const normalizedHostId = normalizeHostId(args.hostId)
  const host = resolveHostId(normalizedHostId)
  if (!host && normalizedHostId !== 'local') {
    return { error: `Error: Host ${args.hostId} not found. Use list_hosts first.` }
  }

  const sessionId = await ctx.ensureSession(
    host?.id ?? 'local',
    host?.alias ?? '本地终端',
    args.terminalName,
    { role: 'interactive' }
  )
  return { sessionId }
}

function assertSafeText(text: string): void {
  const hasUnsafeControlChar = Array.from(text).some((char) => {
    const code = char.charCodeAt(0)
    return (
      (code >= 0x00 && code <= 0x08) ||
      code === 0x0b ||
      (code >= 0x0e && code <= 0x1f) ||
      code === 0x7f
    )
  })

  if (hasUnsafeControlChar) {
    throw new Error(
      'Text input contains control characters. Use the keys field for Escape/Ctrl/arrow keys.'
    )
  }
}

function resolveHostForTool(hostId: string): { id: string; alias: string } | { error: string } {
  const normalizedHostId = normalizeHostId(hostId)
  const host = resolveHostId(normalizedHostId)
  if (!host && normalizedHostId !== 'local') {
    return { error: `Error: Host ${hostId} not found. Use list_hosts first.` }
  }
  return {
    id: host?.id ?? 'local',
    alias: host?.alias ?? '本地终端'
  }
}

async function authorizeInteractiveCommand(
  args: z.infer<typeof startInteractiveParameters>,
  hostId: string,
  ctx: Tool.Context
): Promise<{ ok: true; metadata: Record<string, unknown> } | { ok: false; output: string }> {
  const policyResult = PolicyEngine.evaluateWithTrust(args.command, hostId)
  if (policyResult.action === 'deny') {
    return { ok: false, output: `Error: Command blocked by policy: ${policyResult.reason}` }
  }

  const commandPattern = policyResult.commandPattern || PolicyEngine.normalizeCommand(args.command)
  const commandSegments = ShellAnalyzer.splitSegments(args.command).map((segment, index) => ({
    index,
    raw: segment.raw,
    command: segment.command,
    args: segment.args
  }))
  const policyMetadata = {
    riskLevel: policyResult.riskLevel,
    riskCategory: policyResult.riskCategory,
    trustLevel: policyResult.trustLevel,
    commandPattern,
    commandSegments,
    requiresVerification: policyResult.requiresVerification,
    toolName: 'start_interactive_command'
  }

  if (
    policyResult.action === 'confirm' &&
    shouldRequestApproval(permissionDB.getPermissions(), policyResult)
  ) {
    const authResult = await ctx.requestAuthorization(
      args.command,
      policyResult.riskLevel,
      args.reason,
      policyMetadata
    )
    if (!authResult.approved) {
      return { ok: false, output: 'Error: User rejected command authorization' }
    }
  }

  return { ok: true, metadata: policyMetadata }
}

function parseRegex(pattern: string | undefined, label: string): RegExp | string | undefined {
  if (!pattern) return undefined
  try {
    return new RegExp(pattern)
  } catch (error) {
    return `Error: Invalid ${label}: ${error}`
  }
}

async function observeSession(
  sessionId: string,
  includeHistory: boolean,
  sinceUpdatedAt?: number,
  maxHistory = 12
): Promise<{
  snapshot: TerminalScreenSnapshot
  history: TerminalScreenHistoryEntry[]
  output: string
}> {
  const snapshot = await commandExecutor.getTerminalSnapshot(sessionId)
  const history = includeHistory
    ? await commandExecutor.getTerminalHistory(sessionId, {
        sinceUpdatedAt,
        maxHistory
      })
    : []
  return {
    snapshot,
    history,
    output: [formatSnapshot(snapshot), includeHistory ? formatHistory(history) : '']
      .filter(Boolean)
      .join('\n\n')
  }
}

export function encodeTerminalInput(args: z.input<typeof sendParameters>): {
  data: string
  recordedContent: string
} {
  const chunks: string[] = []
  const summary: string[] = []

  if (args.sequence?.length) {
    for (const item of args.sequence) {
      if (item.text) {
        assertSafeText(item.text)
        chunks.push(item.text)
        summary.push(`text ${summarizeText(item.text)}`)
      }
      if (item.key) {
        chunks.push(KEY_SEQUENCES[item.key])
        summary.push(`key ${item.key}`)
      }
    }
  } else {
    if (args.text) {
      assertSafeText(args.text)
      chunks.push(args.text)
      summary.push(`text ${summarizeText(args.text)}`)
    }
    const keys = [...(args.keys ?? [])]
    if (args.text && args.submit && !keys.some((key) => key === 'Enter' || key === 'Return')) {
      keys.push('Enter')
    }
    for (const key of keys) {
      chunks.push(KEY_SEQUENCES[key])
      summary.push(`key ${key}`)
    }
  }

  return {
    data: chunks.join(''),
    recordedContent: summary.length ? summary.join(', ') : '(empty terminal input)'
  }
}

export const observeTerminalTool = define('observe_terminal', {
  description:
    '读取一个现有终端的当前可见屏幕，适合 TUI、交互式安装器、菜单选择、REPL、编辑器等无法用普通命令输出表达的场景。默认只返回非空行和光标附近行；需要复盘长任务时设置 includeHistory=true。长 TUI 阶段优先用 wait_terminal_activity，避免反复刷新和猜关键词。',
  parameters: observeParameters,
  async execute(
    args: z.infer<typeof observeParameters>,
    ctx: Tool.Context
  ): Promise<Tool.ExecuteResult> {
    const resolved = await resolveSessionId(args, ctx)
    if (!resolved.sessionId) return { output: resolved.error ?? 'Error: No terminal session.' }

    const snapshot = await commandExecutor.getTerminalSnapshot(resolved.sessionId)
    const history = args.includeHistory
      ? await commandExecutor.getTerminalHistory(resolved.sessionId, {
          sinceUpdatedAt: args.sinceUpdatedAt,
          maxHistory: args.maxHistory
        })
      : []
    return {
      output: [formatSnapshot(snapshot), args.includeHistory ? formatHistory(history) : '']
        .filter(Boolean)
        .join('\n\n'),
      metadata: { sessionId: resolved.sessionId, snapshot, history }
    }
  }
})

export const startInteractiveCommandTool = define('start_interactive_command', {
  description:
    '在交互终端中启动 TUI/安装器/菜单/REPL/编辑器类命令，不等待命令退出。它会返回 sessionId、首屏 snapshot 和最近变化；后续用 interact_terminal 或 send_terminal_keys 继续操作。普通会自行结束的命令仍使用 execute_command。',
  parameters: startInteractiveParameters,
  async execute(
    args: z.infer<typeof startInteractiveParameters>,
    ctx: Tool.Context
  ): Promise<Tool.ExecuteResult> {
    const host = resolveHostForTool(args.hostId)
    if ('error' in host) return { output: host.error }

    const authorization = await authorizeInteractiveCommand(args, host.id, ctx)
    if (!authorization.ok) return { output: authorization.output }

    const sessionId = await ctx.ensureSession(host.id, host.alias, args.terminalName, {
      role: 'interactive',
      visible: true
    })
    const visibleCommand = args.workdir
      ? `cd ${shellQuote(args.workdir)} && ${args.command}`
      : args.command
    const recordedContent = `start interactive command ${summarizeText(visibleCommand)}`

    ctx.updatePartMetadata?.({
      hostId: host.id,
      hostAlias: host.alias,
      command: args.command,
      visibleCommand,
      workdir: args.workdir,
      displayMode: 'terminal',
      sessionId,
      terminalRole: 'interactive',
      ...authorization.metadata
    })

    await commandExecutor.sendAgentInput(
      sessionId,
      `${visibleCommand}\r`,
      ctx.topicId,
      recordedContent,
      ctx.taskId,
      ctx.stepId
    )

    let waitResult: Awaited<ReturnType<typeof commandExecutor.waitForTerminalActivity>> | undefined
    if (args.waitForInitialActivity) {
      waitResult = await commandExecutor.waitForTerminalActivity(
        sessionId,
        {
          timeoutMs: args.initialWaitMs,
          idleMs: 500,
          requireFreshMatch: true,
          returnOnIdle: false
        },
        ctx.abort
      )
    }

    const observed = waitResult
      ? {
          snapshot: waitResult.snapshot,
          history: waitResult.history,
          output: [
            `Started interactive command in ${sessionId}.`,
            `initialStatus: ${waitResult.status}`,
            `screenPhase: ${waitResult.screenPhase}`,
            formatHistory(waitResult.history),
            formatSnapshot(waitResult.snapshot)
          ].join('\n')
        }
      : await observeSession(sessionId, true)

    const metadata = {
      ...authorization.metadata,
      hostId: host.id,
      hostAlias: host.alias,
      command: args.command,
      visibleCommand,
      workdir: args.workdir,
      displayMode: 'terminal',
      sessionId,
      terminalRole: 'interactive',
      startedInteractiveCommand: true,
      waitResult,
      snapshot: observed.snapshot,
      history: observed.history
    }
    ctx.updatePartMetadata?.(metadata)

    return {
      output: observed.output,
      metadata
    }
  }
})

export const sendTerminalKeysTool = define('send_terminal_keys', {
  description:
    '向现有终端发送文本或键盘按键，用于自动操作 TUI/交互式安装器/菜单/REPL。text 只会输入文本，不会自动回车；需要提交时使用 submit=true 或 keys:["Enter"]。发送前应先用 observe_terminal 确认界面状态；发送后应用 wait_terminal_activity 或 observe_terminal 验证界面变化。普通非交互命令优先用 execute_command，只有交互式场景用本工具。',
  parameters: sendParameters,
  async execute(
    args: z.infer<typeof sendParameters>,
    ctx: Tool.Context
  ): Promise<Tool.ExecuteResult> {
    const encoded = encodeTerminalInput(args)
    if (!encoded.data) {
      return { output: 'Error: No terminal input to send. Provide text, keys, or sequence.' }
    }

    await commandExecutor.sendAgentInput(
      args.sessionId,
      encoded.data,
      ctx.topicId,
      encoded.recordedContent,
      ctx.taskId,
      ctx.stepId
    )

    return {
      output: `Sent terminal input to ${args.sessionId}: ${encoded.recordedContent}`,
      metadata: {
        sessionId: args.sessionId,
        bytes: encoded.data.length,
        recordedContent: encoded.recordedContent
      }
    }
  }
})

export const interactTerminalTool = define('interact_terminal', {
  description:
    '组合型 TUI 操作：向现有终端发送文本/按键/序列，然后按需等待屏幕变化或指定文本，最后返回屏幕 snapshot 和最近变化。优先用于一次完整交互动作，减少 send/wait/observe 多工具往返。',
  parameters: interactParameters,
  async execute(
    args: z.infer<typeof interactParameters>,
    ctx: Tool.Context
  ): Promise<Tool.ExecuteResult> {
    const encoded = encodeTerminalInput(args)
    if (!encoded.data) {
      return { output: 'Error: No terminal input to send. Provide text, keys, or sequence.' }
    }

    const sinceHistory = await commandExecutor
      .getTerminalHistory(args.sessionId, { maxHistory: 1 })
      .then((history) => history.at(-1)?.updatedAt)
      .catch(() => undefined)

    await commandExecutor.sendAgentInput(
      args.sessionId,
      encoded.data,
      ctx.topicId,
      encoded.recordedContent,
      ctx.taskId,
      ctx.stepId
    )

    if (args.waitFor === 'none') {
      const observed = await observeSession(args.sessionId, args.includeHistory, sinceHistory)
      return {
        output: [
          `Sent terminal input to ${args.sessionId}: ${encoded.recordedContent}`,
          observed.output
        ].join('\n\n'),
        metadata: {
          sessionId: args.sessionId,
          bytes: encoded.data.length,
          recordedContent: encoded.recordedContent,
          waitFor: args.waitFor,
          snapshot: observed.snapshot,
          history: observed.history
        }
      }
    }

    const parsedRegex = parseRegex(args.expectRegex, 'expectRegex')
    if (typeof parsedRegex === 'string') return { output: parsedRegex }

    if (args.waitFor === 'text') {
      if (!args.expectText && !parsedRegex) {
        return {
          output: 'Error: interact_terminal waitFor=text requires expectText or expectRegex.'
        }
      }

      const result = await commandExecutor.waitForTerminalText(
        args.sessionId,
        {
          text: args.expectText,
          regex: parsedRegex,
          timeoutMs: args.timeoutMs,
          stableMs: args.stableMs
        },
        ctx.abort
      )
      const history = args.includeHistory
        ? await commandExecutor.getTerminalHistory(args.sessionId, {
            sinceUpdatedAt: sinceHistory,
            maxHistory: 20
          })
        : []
      return {
        output: [
          `Sent terminal input to ${args.sessionId}: ${encoded.recordedContent}`,
          result.matched ? 'Matched terminal screen.' : 'Timed out waiting for terminal screen.',
          `elapsedMs: ${result.elapsedMs}`,
          args.includeHistory ? formatHistory(history) : '',
          formatSnapshot(result.snapshot)
        ]
          .filter(Boolean)
          .join('\n'),
        metadata: {
          sessionId: args.sessionId,
          bytes: encoded.data.length,
          recordedContent: encoded.recordedContent,
          waitFor: args.waitFor,
          matched: result.matched,
          timedOut: result.timedOut,
          elapsedMs: result.elapsedMs,
          snapshot: result.snapshot,
          history
        }
      }
    }

    const result = await commandExecutor.waitForTerminalActivity(
      args.sessionId,
      {
        stopText: args.expectText,
        stopRegex: parsedRegex,
        timeoutMs: args.timeoutMs,
        idleMs: args.idleMs,
        requireFreshMatch: args.requireFreshMatch,
        returnOnIdle: false
      },
      ctx.abort
    )

    return {
      output: [
        `Sent terminal input to ${args.sessionId}: ${encoded.recordedContent}`,
        result.status === 'matched'
          ? 'Matched fresh terminal activity.'
          : result.status === 'stable_output'
            ? 'Terminal screen stabilized with readable output.'
            : result.status === 'awaiting_input'
              ? 'Terminal appears to be waiting for input.'
              : result.status === 'idle'
                ? 'Terminal activity became idle after screen changes.'
                : 'Timed out waiting for terminal activity.',
        `status: ${result.status}`,
        `screenPhase: ${result.screenPhase}`,
        `elapsedMs: ${result.elapsedMs}`,
        `idleMs: ${result.idleMs}`,
        args.includeHistory ? formatHistory(result.history) : '',
        formatSnapshot(result.snapshot)
      ]
        .filter(Boolean)
        .join('\n'),
      metadata: {
        sessionId: args.sessionId,
        bytes: encoded.data.length,
        recordedContent: encoded.recordedContent,
        waitFor: args.waitFor,
        status: result.status,
        screenPhase: result.screenPhase,
        matched: result.matched,
        timedOut: result.timedOut,
        elapsedMs: result.elapsedMs,
        idleMs: result.idleMs,
        snapshot: result.snapshot,
        history: result.history
      }
    }
  }
})

export const waitTerminalTextTool = define('wait_terminal_text', {
  description:
    '等待终端可见屏幕出现明确、短期、确定的文本或正则，常用于菜单、提示符或短交互确认。长时间 TUI 任务不要用它反复猜 completed/Research Report 等关键词；优先使用 wait_terminal_activity 监听屏幕变化和稳定状态。',
  parameters: waitParameters,
  async execute(
    args: z.infer<typeof waitParameters>,
    ctx: Tool.Context
  ): Promise<Tool.ExecuteResult> {
    if (!args.text && !args.regex) {
      return { output: 'Error: wait_terminal_text requires text or regex.' }
    }

    let regex: RegExp | undefined
    if (args.regex) {
      try {
        regex = new RegExp(args.regex)
      } catch (error) {
        return { output: `Error: Invalid regex: ${error}` }
      }
    }

    const result = await commandExecutor.waitForTerminalText(
      args.sessionId,
      {
        text: args.text,
        regex,
        timeoutMs: args.timeoutMs,
        stableMs: args.stableMs
      },
      ctx.abort
    )

    return {
      output: [
        result.matched ? 'Matched terminal screen.' : 'Timed out waiting for terminal screen.',
        `elapsedMs: ${result.elapsedMs}`,
        formatSnapshot(result.snapshot)
      ].join('\n'),
      metadata: {
        sessionId: args.sessionId,
        matched: result.matched,
        timedOut: result.timedOut,
        elapsedMs: result.elapsedMs,
        snapshot: result.snapshot
      }
    }
  }
})

export const waitTerminalActivityTool = define('wait_terminal_activity', {
  description:
    '等待 TUI 终端出现新屏幕变化并进入稳定状态，或等待新变化中出现 stopText/stopRegex。适合长任务、后台 agent、安装器进度、动态 TUI 输出。返回最近变化摘要和最终屏幕，避免模型频繁刷新。',
  parameters: waitActivityParameters,
  async execute(
    args: z.infer<typeof waitActivityParameters>,
    ctx: Tool.Context
  ): Promise<Tool.ExecuteResult> {
    let stopRegex: RegExp | undefined
    if (args.stopRegex) {
      try {
        stopRegex = new RegExp(args.stopRegex)
      } catch (error) {
        return { output: `Error: Invalid stopRegex: ${error}` }
      }
    }

    const result = await commandExecutor.waitForTerminalActivity(
      args.sessionId,
      {
        stopText: args.stopText,
        stopRegex,
        timeoutMs: args.timeoutMs,
        idleMs: args.idleMs,
        requireFreshMatch: args.requireFreshMatch,
        returnOnIdle: args.returnOnIdle
      },
      ctx.abort
    )

    const statusText =
      result.status === 'matched'
        ? 'Matched fresh terminal activity.'
        : result.status === 'stable_output'
          ? 'Terminal screen stabilized with readable output.'
          : result.status === 'awaiting_input'
            ? 'Terminal appears to be waiting for input.'
            : result.status === 'idle'
              ? 'Terminal activity became idle after screen changes.'
              : 'Timed out waiting for terminal activity.'

    return {
      output: [
        statusText,
        `status: ${result.status}`,
        `screenPhase: ${result.screenPhase}`,
        `elapsedMs: ${result.elapsedMs}`,
        `idleMs: ${result.idleMs}`,
        formatHistory(result.history),
        formatSnapshot(result.snapshot)
      ].join('\n'),
      metadata: {
        sessionId: args.sessionId,
        status: result.status,
        screenPhase: result.screenPhase,
        matched: result.matched,
        timedOut: result.timedOut,
        elapsedMs: result.elapsedMs,
        idleMs: result.idleMs,
        snapshot: result.snapshot,
        history: result.history
      }
    }
  }
})

export const supportedTerminalKeys = KEY_NAMES satisfies TerminalKeyName[]
