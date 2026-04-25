import { describe, expect, it } from 'vitest'
import {
  buildTerminalCommandCompletionMessages,
  buildTerminalCommandDraftMessages,
  sanitizeTerminalCommandCompletion,
  sanitizeTerminalCommandDraft
} from '../terminal-command-assist'

describe('terminal command assist prompt', () => {
  it('anchors the natural-language request to the selected terminal session', () => {
    const messages = buildTerminalCommandDraftMessages({
      request: '查看最近的错误日志',
      session: {
        id: 'session-1',
        hostId: 'local',
        hostAlias: '本机',
        name: '开发终端',
        role: 'user'
      },
      historyCommands: ['npm run dev', 'tail -n 100 app.log'],
      screen: 'dev@local % npm run dev',
      currentInput: ''
    })
    const prompt = messages.map((message) => message.content).join('\n')

    expect(prompt).toContain('sessionId: session-1')
    expect(prompt).toContain('hostId: local')
    expect(prompt).toContain('查看最近的错误日志')
    expect(prompt).toContain('tail -n 100 app.log')
    expect(prompt).toContain('不要执行命令')
    expect(prompt).toContain('{"command":"..."}')
  })

  it('extracts a single draft command from provider output', () => {
    expect(sanitizeTerminalCommandDraft('```json\n{"command":"tail -n 100 app.log"}\n```')).toBe(
      'tail -n 100 app.log'
    )
    expect(sanitizeTerminalCommandDraft('$ git status\n')).toBe('git status')
  })

  it('builds a model-backed tab completion prompt for the current input', () => {
    const messages = buildTerminalCommandCompletionMessages({
      currentInput: 'kuebclt ge',
      session: {
        id: 'session-1',
        hostId: 'local',
        hostAlias: '本机',
        name: '开发终端',
        role: 'user'
      },
      historyCommands: ['kubectl get pods -n default'],
      screen: 'dev@local % kubectl get pods'
    })
    const prompt = messages.map((message) => message.content).join('\n')

    expect(prompt).toContain('Tab 命令补全引擎')
    expect(prompt).toContain('currentInput:')
    expect(prompt).toContain('kuebclt ge')
    expect(prompt).toContain('kuebclt ge -> kubectl get pods')
    expect(prompt).toContain('docker im -> docker images')
    expect(prompt).toContain('{"command":"...","confidence":"high","reason":"..."}')
    expect(prompt).toContain('{"command":"","confidence":"low","reason":"uncertain"}')
  })

  it('extracts structured model completion output', () => {
    expect(
      sanitizeTerminalCommandCompletion(
        '```json\n{"command":"kubectl get pods","confidence":"high","reason":"kubectl context"}\n```'
      )
    ).toEqual({
      command: 'kubectl get pods',
      confidence: 'high',
      reason: 'kubectl context'
    })
    expect(sanitizeTerminalCommandCompletion('not sure')).toEqual({
      command: 'not sure',
      confidence: 'medium'
    })
  })
})
