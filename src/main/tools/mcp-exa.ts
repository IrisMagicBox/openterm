const EXA_MCP_BASE_URL = 'https://mcp.exa.ai/mcp'
const DEFAULT_TIMEOUT_MS = 25_000

export interface ExaSearchArgs {
  query: string
  numResults: number
}

export interface McpExaCallOptions {
  apiKey?: string
  fetchImpl?: typeof fetch
  signal?: AbortSignal
  timeoutMs?: number
}

interface McpTextContent {
  type?: unknown
  text?: unknown
}

interface McpDataMessage {
  result?: {
    content?: McpTextContent[]
  }
  error?: {
    message?: unknown
  } | string
}

export class McpExaError extends Error {
  constructor(
    message: string,
    readonly code: 'rate_limit' | 'auth' | 'http' | 'mcp' | 'timeout' | 'aborted',
    readonly status?: number
  ) {
    super(message)
    this.name = 'McpExaError'
  }
}

export function getExaMcpUrl(apiKey = process.env.EXA_API_KEY): string {
  const key = apiKey?.trim()
  if (!key) return EXA_MCP_BASE_URL
  return `${EXA_MCP_BASE_URL}?exaApiKey=${encodeURIComponent(key)}`
}

function parseMcpErrorMessage(body: string): string | undefined {
  try {
    const data = JSON.parse(body) as McpDataMessage
    const message = typeof data.error === 'string' ? data.error : data.error?.message
    return typeof message === 'string' && message.trim() ? message.trim() : undefined
  } catch {
    return undefined
  }
}

function classifyHttpError(status: number, body: string): McpExaError {
  const message = parseMcpErrorMessage(body)
  if (status === 429) {
    return new McpExaError(
      message ||
        'Exa hosted MCP anonymous rate limit reached. Configure an Exa API key to continue.',
      'rate_limit',
      status
    )
  }
  if (status === 401 || status === 403) {
    return new McpExaError(
      message || 'Exa hosted MCP rejected the API key. Check the configured Exa API key.',
      'auth',
      status
    )
  }
  const detail = body ? `: ${body.slice(0, 500)}` : ''
  return new McpExaError(`MCP request failed with HTTP ${status}${detail}`, 'http', status)
}

export function parseMcpSseText(body: string): string | undefined {
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue

    const payload = line.slice('data:'.length).trim()
    if (!payload || payload === '[DONE]') continue

    let data: McpDataMessage
    try {
      data = JSON.parse(payload) as McpDataMessage
    } catch {
      continue
    }

    if (data.error) {
      const message = typeof data.error === 'string' ? data.error : data.error.message
      throw new McpExaError(
        `MCP error: ${typeof message === 'string' ? message : 'unknown error'}`,
        'mcp'
      )
    }

    const text = data.result?.content?.[0]?.text
    if (typeof text === 'string' && text.length > 0) return text
  }

  return undefined
}

export async function callMcpExaTool(
  toolName: string,
  args: unknown,
  options: McpExaCallOptions = {}
): Promise<string | undefined> {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  let timedOut = false

  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  const abortFromParent = (): void => controller.abort()
  if (options.signal?.aborted) {
    controller.abort()
  } else {
    options.signal?.addEventListener('abort', abortFromParent, { once: true })
  }

  try {
    const response = await fetchImpl(getExaMcpUrl(options.apiKey), {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        }
      }),
      signal: controller.signal
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw classifyHttpError(response.status, text)
    }

    return parseMcpSseText(await response.text())
  } catch (error) {
    if (timedOut) {
      throw new McpExaError(`${toolName} request timed out after ${timeoutMs}ms`, 'timeout')
    }
    if (options.signal?.aborted) {
      throw new McpExaError(`${toolName} request aborted`, 'aborted')
    }
    throw error
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abortFromParent)
  }
}

export function callMcpExaSearch(
  args: ExaSearchArgs,
  options: McpExaCallOptions = {}
): Promise<string | undefined> {
  return callMcpExaTool('web_search_exa', args, options)
}
