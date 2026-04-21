import { describe, expect, it } from 'vitest'
import { shellQuote } from '../shell-quote'

describe('shellQuote', () => {
  it('wraps values in single quotes', () => {
    expect(shellQuote('/tmp/file name.txt')).toBe("'/tmp/file name.txt'")
  })

  it('escapes embedded single quotes without reopening command syntax', () => {
    expect(shellQuote("a'$(touch /tmp/pwned)'b")).toBe("'a'\\''$(touch /tmp/pwned)'\\''b'")
  })
})
