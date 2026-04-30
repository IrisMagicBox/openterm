import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: (name: string) => `/tmp/test-openterm/${name}` }
}))

import websearchTool from '../websearch'
import type { Tool } from '../tool-factory'

function makeCtx(): Tool.Context {
  return {
    topicId: 'topic-1',
    taskId: 'task-1',
    stepId: 'step-1',
    webContents: {} as never,
    agentService: {} as never,
    ensureSession: vi.fn().mockResolvedValue('session-1'),
    requestAuthorization: vi.fn().mockResolvedValue({ approved: true, alwaysAllow: false }),
    notifyStep: vi.fn(),
    metadata: vi.fn(),
    ask: vi.fn().mockResolvedValue(undefined),
    abort: new AbortController().signal,
    messages: [],
    agent: 'test-agent'
  }
}

describe('websearch tool', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses default Exa parameters and asks permission for the query', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        'data: {"result":{"content":[{"type":"text","text":"default result"}]},"jsonrpc":"2.0","id":1}\n',
        { status: 200, headers: { 'content-type': 'text/event-stream' } }
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const ctx = makeCtx()
    const tool = await websearchTool.init()
    const result = await tool.execute(
      { query: 'latest openterm release' } as Parameters<typeof tool.execute>[0],
      ctx
    )

    expect(ctx.ask).toHaveBeenCalledWith({
      permission: 'websearch',
      pattern: 'latest openterm release',
      metadata: {
        query: 'latest openterm release',
        numResults: 8,
        livecrawl: 'fallback',
        type: 'auto',
        contextMaxCharacters: undefined
      }
    })
    expect(result.output).toBe('default result')
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toMatchObject({
      params: {
        name: 'web_search_exa',
        arguments: {
          query: 'latest openterm release',
          numResults: 8,
          livecrawl: 'fallback',
          type: 'auto'
        }
      }
    })
  })

  it('returns a readable error when the hosted MCP request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('bad gateway', { status: 502 }))
    )

    const tool = await websearchTool.init()
    const result = await tool.execute(
      { query: 'anything' } as Parameters<typeof tool.execute>[0],
      makeCtx()
    )

    expect(result.output).toContain('Error: Web search failed:')
    expect(result.metadata?.error).toBe(true)
  })
})
