import { describe, expect, it } from 'vitest'
import { normalizeAgentError, retryDelayMs } from '../agent-error'

describe('normalizeAgentError', () => {
  it('classifies auth and invalid request errors as non-retryable', () => {
    expect(normalizeAgentError({ status: 401, message: 'Invalid API key' })).toMatchObject({
      kind: 'auth',
      retryable: false,
      statusCode: 401
    })

    expect(normalizeAgentError({ status: 400, message: 'Bad request' })).toMatchObject({
      kind: 'invalid_request',
      retryable: false,
      statusCode: 400
    })
  })

  it('classifies rate limits and server errors as retryable', () => {
    expect(normalizeAgentError({ status: 429, message: 'rate limit exceeded' })).toMatchObject({
      kind: 'rate_limit',
      retryable: true,
      statusCode: 429
    })

    expect(normalizeAgentError({ status: 503, message: 'overloaded' })).toMatchObject({
      kind: 'server_error',
      retryable: true,
      statusCode: 503
    })
  })

  it('keeps context overflow and abort non-retryable', () => {
    expect(normalizeAgentError(new Error('maximum context length exceeded'))).toMatchObject({
      kind: 'context_overflow',
      retryable: false
    })

    expect(normalizeAgentError({ name: 'AbortError', message: 'aborted' })).toMatchObject({
      kind: 'abort',
      retryable: false
    })
  })
})

describe('retryDelayMs', () => {
  it('uses bounded exponential backoff', () => {
    expect(retryDelayMs(1)).toBe(500)
    expect(retryDelayMs(5)).toBe(8000)
  })
})
