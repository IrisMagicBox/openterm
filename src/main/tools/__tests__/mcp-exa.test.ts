import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  callMcpExaSearch,
  getExaMcpUrl,
  parseMcpSseText,
  type ExaSearchArgs
} from '../mcp-exa'

const searchArgs: ExaSearchArgs = {
  query: 'openterm web search',
  numResults: 8
}

describe('mcp-exa', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function restoreEnv(key: string, value: string | undefined): void {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  it('builds an anonymous MCP URL when no API key is configured', () => {
    const previous = process.env.EXA_API_KEY
    delete process.env.EXA_API_KEY
    try {
      expect(getExaMcpUrl()).toBe('https://mcp.exa.ai/mcp')
    } finally {
      restoreEnv('EXA_API_KEY', previous)
    }
  })

  it('adds EXA_API_KEY to the hosted MCP URL when present', () => {
    const previous = process.env.EXA_API_KEY
    process.env.EXA_API_KEY = 'key with space'
    try {
      expect(getExaMcpUrl()).toBe('https://mcp.exa.ai/mcp?exaApiKey=key%20with%20space')
    } finally {
      restoreEnv('EXA_API_KEY', previous)
    }
  })

  it('parses the first text content from SSE data lines', () => {
    const body = [
      'event: message',
      'data: {"result":{"content":[{"type":"text","text":"search result"}]},"jsonrpc":"2.0","id":1}',
      ''
    ].join('\n')

    expect(parseMcpSseText(body)).toBe('search result')
  })

  it('returns undefined for empty content, non-json data, or no result', () => {
    expect(parseMcpSseText('data: not json\n')).toBeUndefined()
    expect(parseMcpSseText('data: {"result":{"content":[]}}\n')).toBeUndefined()
    expect(parseMcpSseText('event: ping\n')).toBeUndefined()
  })

  it('posts JSON-RPC search requests to Exa hosted MCP', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        'data: {"result":{"content":[{"type":"text","text":"ok"}]},"jsonrpc":"2.0","id":1}\n',
        { status: 200, headers: { 'content-type': 'text/event-stream' } }
      )
    })

    const previous = process.env.EXA_API_KEY
    delete process.env.EXA_API_KEY
    let result: string | undefined
    try {
      result = await callMcpExaSearch(searchArgs, {
        fetchImpl: fetchMock as unknown as typeof fetch,
        timeoutMs: 1000
      })
    } finally {
      restoreEnv('EXA_API_KEY', previous)
    }

    expect(result).toBe('ok')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://mcp.exa.ai/mcp')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json'
    })
    expect(JSON.parse(String(init.body))).toMatchObject({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'web_search_exa',
        arguments: searchArgs
      }
    })
  })
})
