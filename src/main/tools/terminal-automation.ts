import { z } from 'zod'
import { define, Tool } from './tool-factory'
import { commandExecutor, TerminalScreenSnapshot } from '../terminal'
import { normalizeHostId, resolveHostId } from '../utils/host-resolver'

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
  reason: z.string().optional().describe('观察这个终端的原因。')
})

const keyNameSchema = z.enum(KEY_NAMES)

const sendParameters = z.object({
  sessionId: z.string().describe('要控制的终端会话 ID。'),
  text: z
    .string()
    .max(4000)
    .optional()
    .describe('要输入的普通文本。回车请优先用 keys: ["Enter"]。'),
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
  timeoutMs: z.number().min(100).max(120000).default(10000).describe('最长等待毫秒数。'),
  stableMs: z
    .number()
    .min(0)
    .max(10000)
    .default(0)
    .describe('匹配后屏幕需要保持不变的毫秒数，适合等待 TUI 渲染稳定。'),
  reason: z.string().optional().describe('等待这个界面状态的原因。')
})

function summarizeText(text: string): string {
  const normalized = text.replace(/\s+/g, ' ')
  if (normalized.length <= 120) return JSON.stringify(normalized)
  return `${JSON.stringify(normalized.slice(0, 120))}... (${text.length} chars)`
}

function formatSnapshot(snapshot: TerminalScreenSnapshot): string {
  const numberedLines = snapshot.lines
    .map((line) => {
      const row = String(line.row + 1).padStart(2, '0')
      const cursor = line.row === snapshot.cursorY ? '>' : ' '
      return `${row}${cursor} ${line.text}`
    })
    .join('\n')
    .replace(/\s+$/g, '')

  return [
    `sessionId: ${snapshot.sessionId}`,
    `host: ${snapshot.hostAlias} (${snapshot.hostId})`,
    `size: ${snapshot.cols}x${snapshot.rows}, cursor: ${snapshot.cursorX + 1},${snapshot.cursorY + 1}, buffer: ${snapshot.bufferType}`,
    `locked: ${snapshot.isLocked ? snapshot.lockedBy || 'unknown' : 'false'}, runningCommand: ${snapshot.isCommandRunning}`,
    'screen:',
    '```text',
    numberedLines || '(blank)',
    '```'
  ].join('\n')
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
    args.terminalName
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

export function encodeTerminalInput(args: z.infer<typeof sendParameters>): {
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
    for (const key of args.keys ?? []) {
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
    '读取一个现有终端的当前可见屏幕，适合 TUI、交互式安装器、菜单选择、REPL、编辑器等无法用普通命令输出表达的场景。对交互式任务先 observe_terminal，再 send_terminal_keys，再 wait_terminal_text 或再次 observe_terminal。',
  parameters: observeParameters,
  async execute(
    args: z.infer<typeof observeParameters>,
    ctx: Tool.Context
  ): Promise<Tool.ExecuteResult> {
    const resolved = await resolveSessionId(args, ctx)
    if (!resolved.sessionId) return { output: resolved.error ?? 'Error: No terminal session.' }

    const snapshot = await commandExecutor.getTerminalSnapshot(resolved.sessionId)
    return {
      output: formatSnapshot(snapshot),
      metadata: { sessionId: resolved.sessionId, snapshot }
    }
  }
})

export const sendTerminalKeysTool = define('send_terminal_keys', {
  description:
    '向现有终端发送文本或键盘按键，用于自动操作 TUI/交互式安装器/菜单/REPL。发送前应先用 observe_terminal 确认界面状态；发送后应用 wait_terminal_text 或 observe_terminal 验证界面变化。普通命令优先用 execute_command，只有交互式场景用本工具。',
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

export const waitTerminalTextTool = define('wait_terminal_text', {
  description:
    '等待终端可见屏幕出现指定文本或匹配正则，常用于 TUI 自动化中等待菜单、提示符、安装完成信息或错误信息。返回最终屏幕快照。',
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

export const supportedTerminalKeys = KEY_NAMES satisfies TerminalKeyName[]
