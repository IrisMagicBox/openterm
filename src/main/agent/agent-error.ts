import { getErrorMessage } from '../../shared/errors'

export type AgentErrorKind =
  | 'abort'
  | 'timeout'
  | 'auth'
  | 'rate_limit'
  | 'context_overflow'
  | 'invalid_request'
  | 'server_error'
  | 'permission_denied'
  | 'provider'
  | 'tool'
  | 'unknown'

export interface NormalizedAgentError {
  kind: AgentErrorKind
  message: string
  retryable: boolean
  statusCode?: number
  cause?: unknown
}

export function normalizeAgentError(error: unknown): NormalizedAgentError {
  const message = getErrorMessage(error)
  const record = error as Record<string, unknown>
  const name = typeof record?.name === 'string' ? record.name : ''
  const code = typeof record?.code === 'string' ? record.code : ''
  const status =
    typeof record?.status === 'number'
      ? record.status
      : typeof record?.statusCode === 'number'
        ? record.statusCode
        : undefined

  if (name === 'AbortError' || code === 'ABORT_ERR' || /aborted|abort/i.test(message)) {
    return { kind: 'abort', message, retryable: false, cause: error }
  }

  if (status === 401 || status === 403 || /auth|api key|unauthorized|forbidden/i.test(message)) {
    return { kind: 'auth', message, retryable: false, statusCode: status, cause: error }
  }

  if (status === 429 || /rate limit|too many requests|quota/i.test(message)) {
    return { kind: 'rate_limit', message, retryable: true, statusCode: status, cause: error }
  }

  if (/timed?\s*out|timeout/i.test(message)) {
    return { kind: 'timeout', message, retryable: true, statusCode: status, cause: error }
  }

  if (/context|maximum context|token limit|too many tokens/i.test(message)) {
    return { kind: 'context_overflow', message, retryable: false, statusCode: status, cause: error }
  }

  if (/permission denied|user rejected|authorization/i.test(message)) {
    return { kind: 'permission_denied', message, retryable: false, cause: error }
  }

  if (status === 400 || status === 422 || /invalid request|bad request/i.test(message)) {
    return { kind: 'invalid_request', message, retryable: false, statusCode: status, cause: error }
  }

  if (status === 408 || status === 409 || status === 425 || (status && status >= 500)) {
    return {
      kind: 'server_error',
      message,
      retryable: true,
      statusCode: status,
      cause: error
    }
  }

  if (status) {
    return { kind: 'provider', message, retryable: false, statusCode: status, cause: error }
  }

  if (
    /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|network|socket|fetch failed|terminated|connection|TLS|UND_ERR/i.test(
      message
    )
  ) {
    return { kind: 'server_error', message, retryable: true, cause: error }
  }

  return { kind: 'unknown', message, retryable: false, cause: error }
}

export function retryDelayMs(attempt: number): number {
  return Math.min(8000, 500 * 2 ** Math.max(0, attempt - 1))
}
