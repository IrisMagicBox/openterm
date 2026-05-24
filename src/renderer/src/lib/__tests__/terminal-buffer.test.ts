import { describe, expect, it } from 'vitest'
import { pendingTerminalLiveDataAfterBuffer } from '../terminal-buffer'

describe('terminal buffer merging', () => {
  it('keeps live data when there is no initial buffer', () => {
    expect(pendingTerminalLiveDataAfterBuffer('', 'echo hi\r\n')).toBe('echo hi\r\n')
  })

  it('does not duplicate live data already included by the initial buffer', () => {
    expect(pendingTerminalLiveDataAfterBuffer('prompt$ echo hi\r\n', 'echo hi\r\n')).toBe('')
  })

  it('keeps the non-overlapping suffix of pending live data', () => {
    expect(pendingTerminalLiveDataAfterBuffer('prompt$ echo', 'echo hi\r\n')).toBe(' hi\r\n')
  })

  it('keeps all pending live data when there is no overlap', () => {
    expect(pendingTerminalLiveDataAfterBuffer('prompt$ ', 'date\r\n')).toBe('date\r\n')
  })
})
