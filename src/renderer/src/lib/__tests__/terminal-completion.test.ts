import { describe, expect, it } from 'vitest'
import {
  buildTerminalCompletion,
  buildTerminalModelCompletion,
  updateTerminalInputBuffer
} from '../terminal-completion'

describe('terminal completion helpers', () => {
  it('uses command history as the first completion source', () => {
    const completion = buildTerminalCompletion('git st', ['git stash', 'git status'])

    expect(completion).toMatchObject({
      value: 'git stash',
      suffix: 'ash',
      insertText: 'ash',
      mode: 'append',
      source: 'history',
      confidence: 'high',
      displayLabel: '历史'
    })
  })

  it('falls back to common commands', () => {
    const completion = buildTerminalCompletion('npm ru', [])

    expect(completion).toMatchObject({
      value: 'npm run',
      suffix: 'n',
      insertText: 'n',
      mode: 'append',
      source: 'common',
      confidence: 'high',
      displayLabel: '命令'
    })
  })

  it('shows a local command candidate while model completion is warming up', () => {
    const completion = buildTerminalCompletion('docker im', [])

    expect(completion).toMatchObject({
      value: 'docker images',
      suffix: 'ages',
      insertText: 'ages',
      mode: 'append',
      source: 'common',
      confidence: 'high',
      displayLabel: '命令'
    })
  })

  it('keeps leading whitespace when completing', () => {
    const completion = buildTerminalCompletion('  git sta', ['git status'])

    expect(completion).toMatchObject({
      value: '  git status',
      suffix: 'tus',
      insertText: 'tus'
    })
  })

  it('repairs mistyped commands with a whole-line replacement', () => {
    const completion = buildTerminalCompletion('kuebclt ge', [])

    expect(completion).toMatchObject({
      value: 'kubectl get pod',
      insertText: '\x15kubectl get pod',
      mode: 'replace',
      source: 'common',
      confidence: 'high',
      displayLabel: '修正'
    })
  })

  it('can repair mistyped history commands before common commands', () => {
    const completion = buildTerminalCompletion('gti st', ['git status --short'])

    expect(completion).toMatchObject({
      value: 'git status --short',
      insertText: '\x15git status --short',
      mode: 'replace',
      source: 'history',
      confidence: 'high',
      displayLabel: '修正'
    })
  })

  it('does not show low-confidence fuzzy completions', () => {
    expect(buildTerminalCompletion('g st', ['git status'])).toBeNull()
  })

  it('leaves path-like input to the shell unless history matches it', () => {
    expect(buildTerminalCompletion('ls /Us', [])).toBeNull()
    expect(buildTerminalCompletion('ls /Us', ['ls /Users'])).toMatchObject({
      value: 'ls /Users',
      source: 'history'
    })
  })

  it('turns model output into a tab completion replacement', () => {
    const completion = buildTerminalModelCompletion('kuebclt ge', 'kubectl get pod')

    expect(completion).toMatchObject({
      value: 'kubectl get pod',
      insertText: '\x15kubectl get pod',
      mode: 'replace',
      source: 'model',
      confidence: 'high',
      displayLabel: 'AI 修正'
    })
  })

  it('turns model output into an append completion for command prefixes', () => {
    const completion = buildTerminalModelCompletion('docker im', 'docker images', 'high')

    expect(completion).toMatchObject({
      value: 'docker images',
      suffix: 'ages',
      insertText: 'ages',
      mode: 'append',
      source: 'model',
      confidence: 'high',
      displayLabel: 'AI'
    })
  })

  it('ignores empty, unchanged, and low-confidence model output', () => {
    expect(buildTerminalModelCompletion('git st', '')).toBeNull()
    expect(buildTerminalModelCompletion('git status', 'git status')).toBeNull()
    expect(buildTerminalModelCompletion('kuebclt ge', 'kubectl get pods', 'low')).toBeNull()
  })

  it('tracks printable terminal input and editing keys', () => {
    let buffer = ''
    buffer = updateTerminalInputBuffer(buffer, 'gi')
    buffer = updateTerminalInputBuffer(buffer, 't')
    buffer = updateTerminalInputBuffer(buffer, '\x7f')
    buffer = updateTerminalInputBuffer(buffer, 't status')

    expect(buffer).toBe('git status')
    expect(updateTerminalInputBuffer(buffer, '\r')).toBe('')
    expect(updateTerminalInputBuffer(buffer, '\x03')).toBe('')
  })
})
