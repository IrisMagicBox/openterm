import { describe, expect, it } from 'vitest'
import {
  buildTerminalModelCompletion,
  getTerminalShiftTabCompletionAction,
  updateTerminalInputBuffer
} from '../terminal-completion'

describe('terminal completion helpers', () => {
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

  it('can build model append completions for short command starts', () => {
    const completion = buildTerminalModelCompletion('d', 'docker', 'medium')

    expect(completion).toMatchObject({
      value: 'docker',
      suffix: 'ocker',
      insertText: 'ocker',
      mode: 'append',
      source: 'model',
      confidence: 'medium',
      displayLabel: 'AI'
    })
  })

  it('ignores empty, unchanged, and low-confidence model output', () => {
    expect(buildTerminalModelCompletion('git st', '')).toBeNull()
    expect(buildTerminalModelCompletion('git status', 'git status')).toBeNull()
    expect(buildTerminalModelCompletion('kuebclt ge', 'kubectl get pods', 'low')).toBeNull()
    expect(
      buildTerminalModelCompletion('docker image', '用户正在输入 docker image', 'medium')
    ).toBeNull()
    expect(buildTerminalModelCompletion('git st', 'docker images', 'high')).toBeNull()
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

  it('keeps tab input out of the tracked command buffer', () => {
    expect(updateTerminalInputBuffer('docke', '\t')).toBe('docke')
  })

  it('accepts an available model candidate with shift-tab', () => {
    expect(
      getTerminalShiftTabCompletionAction({
        hasVisibleCompletion: false,
        hasCompletionCandidate: true,
        completionPending: false,
        input: 'docker im'
      })
    ).toBe('accept')
    expect(
      getTerminalShiftTabCompletionAction({
        hasVisibleCompletion: true,
        hasCompletionCandidate: true,
        completionPending: false,
        input: 'docker im'
      })
    ).toBe('accept')
  })

  it('requests model completion only when shift-tab has usable input and no candidate', () => {
    expect(
      getTerminalShiftTabCompletionAction({
        hasVisibleCompletion: false,
        hasCompletionCandidate: false,
        completionPending: false,
        input: 'docker im'
      })
    ).toBe('request')
    expect(
      getTerminalShiftTabCompletionAction({
        hasVisibleCompletion: false,
        hasCompletionCandidate: false,
        completionPending: true,
        input: 'docker im'
      })
    ).toBe('wait')
    expect(
      getTerminalShiftTabCompletionAction({
        hasVisibleCompletion: false,
        hasCompletionCandidate: false,
        completionPending: false,
        input: '   '
      })
    ).toBe('hide')
  })
})
