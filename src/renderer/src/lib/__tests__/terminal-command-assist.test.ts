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

  it('builds a prompt-mode model completion prompt for the current input', () => {
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
      executionContext: [
        {
          command: 'kubectl get pods -n default',
          source: 'user',
          output: 'web-7d9f Running\napi-55c CrashLoopBackOff',
          exitCode: 0,
          cwd: '/Users/dev/app'
        }
      ],
      screen: 'dev@local % kubectl get pods'
    })
    const prompt = messages.map((message) => message.content).join('\n')

    expect(prompt).toContain('terminal command completion engine')
    expect(prompt).toContain('currentInput:')
    expect(prompt).toContain('kuebclt ge')
    expect(prompt).toContain('currentInput=kuebclt ge')
    expect(prompt).toContain('currentInput=docker im')
    expect(prompt).toContain('Return exactly one terminal completion XML block')
    expect(prompt).toContain('<terminal_completion>')
    expect(prompt).toContain('<command>kubectl get pods</command>')
    expect(prompt).toContain('最近终端执行上下文')
    expect(prompt).toContain('api-55c CrashLoopBackOff')
    expect(prompt).toContain('cwd=/Users/dev/app')
    expect(prompt).toContain('Return only the XML block')
  })

  it('builds a function-mode model completion prompt for the current input', () => {
    const messages = buildTerminalCommandCompletionMessages(
      {
        currentInput: 'docker im',
        historyCommands: ['docker images'],
        screen: 'dev@local % docker im'
      },
      'function'
    )
    const prompt = messages.map((message) => message.content).join('\n')

    expect(prompt).toContain('Use the complete_terminal_command function')
    expect(prompt).toContain('return exactly one JSON object')
    expect(prompt).toContain('Use the function call when available')
  })

  it('extracts structured model completion output', () => {
    expect(
      sanitizeTerminalCommandCompletion(
        '{"command":"kubectl get pods","confidence":"high","reason":"kubectl context"}',
        'kubectl get'
      )
    ).toEqual({
      command: 'kubectl get pods',
      confidence: 'high',
      reason: 'kubectl context'
    })
    expect(
      sanitizeTerminalCommandCompletion(
        '<terminal_completion><command>docker images</command><confidence>high</confidence><reason>history</reason></terminal_completion>',
        'docker im'
      )
    ).toEqual({
      command: 'docker images',
      confidence: 'high',
      reason: 'history'
    })
    expect(sanitizeTerminalCommandCompletion('git status', 'git st')).toEqual({
      command: '',
      confidence: 'low',
      reason: 'invalid-format'
    })
    expect(sanitizeTerminalCommandCompletion('not sure')).toEqual({
      command: '',
      confidence: 'low',
      reason: 'invalid-format'
    })
    expect(sanitizeTerminalCommandCompletion('Let me analyze the context:')).toEqual({
      command: '',
      confidence: 'low',
      reason: 'invalid-format'
    })
    expect(
      sanitizeTerminalCommandCompletion(
        '用户正在输入 "docker image"，这是 Docker 命令的一部分。用户的历史命令中有多次 `docker images`。',
        'docker image'
      )
    ).toEqual({
      command: '',
      confidence: 'low',
      reason: 'invalid-format'
    })
    expect(
      sanitizeTerminalCommandCompletion(
        'The goal is to complete the command to the most likely intended command, which is `docker images`.',
        'docker im'
      )
    ).toEqual({
      command: '',
      confidence: 'low',
      reason: 'invalid-format'
    })
    expect(
      sanitizeTerminalCommandCompletion(
        'Given the history, the user might be trying to type `docker` or a command related to Docker.',
        'doc'
      )
    ).toEqual({
      command: '',
      confidence: 'low',
      reason: 'invalid-format'
    })
    expect(
      sanitizeTerminalCommandCompletion(
        'The user typed `g`, which is likely the start of a command like `grep`.',
        'docker images | g'
      )
    ).toEqual({
      command: '',
      confidence: 'low',
      reason: 'invalid-format'
    })
    expect(
      sanitizeTerminalCommandCompletion(
        '```json\n{"command":"docker images","confidence":"high"}\n```',
        'docker im'
      )
    ).toEqual({
      command: '',
      confidence: 'low',
      reason: 'invalid-format'
    })
    expect(
      sanitizeTerminalCommandCompletion(
        '{"command":"用户正在输入 \\"docker image\\"，这是 Docker 命令的一部分。","confidence":"medium"}',
        'docker image'
      )
    ).toEqual({
      command: '',
      confidence: 'low',
      reason: 'invalid-command'
    })
  })

  it('parses function-mode tool-call arguments with JSON only', () => {
    expect(
      sanitizeTerminalCommandCompletion(
        '{"command":"docker images","confidence":"high","reason":"tool call"}',
        'docker im',
        { formats: ['json'] }
      )
    ).toEqual({
      command: 'docker images',
      confidence: 'high',
      reason: 'tool call'
    })
    expect(
      sanitizeTerminalCommandCompletion(
        '<terminal_completion><command>docker images</command><confidence>high</confidence></terminal_completion>',
        'docker im',
        { formats: ['json'] }
      )
    ).toEqual({
      command: '',
      confidence: 'low',
      reason: 'invalid-format'
    })
  })
})
