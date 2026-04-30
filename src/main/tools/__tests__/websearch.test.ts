import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: (name: string) => `/tmp/test-openterm/${name}` }
}))

import websearchTool, {
  buildFreshnessSearchQuery,
  buildSearchOutput,
  extractLatestResultDate,
  queryNeedsStrictFreshness
} from '../websearch'
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

  it('adds explicit freshness context to relative-date searches', () => {
    const query = buildFreshnessSearchQuery('搜索现在的新闻', {
      isoDate: '2026-05-01',
      localizedDate: '2026年5月1日',
      localDateTime: '2026/05/01 01:16:00 GMT+8',
      timeZone: 'Asia/Shanghai'
    })

    expect(query).toContain('搜索现在的新闻 2026-05-01 2026年5月1日')
    expect(query).toContain('Current date context: 2026-05-01 (2026年5月1日)')
    expect(query).toContain('local time: 2026/05/01 01:16:00 GMT+8')
    expect(query).toContain('timezone: Asia/Shanghai')
    expect(query).toContain('最新')
    expect(query).toContain('published on or very near 2026-05-01 / 2026年5月1日')
  })

  it('omits stale current-news results instead of presenting them as today', () => {
    const result = buildSearchOutput(
      '今天的新闻',
      [
        'Title: 正当时：2025年6月25日-新华网',
        'URL: http://www.news.cn/government/20250625/example.html',
        'Published: 2025-06-25T00:00:00.000Z'
      ].join('\n'),
      {
        isoDate: '2026-05-01',
        localizedDate: '2026年5月1日',
        localDateTime: '2026/05/01 01:20:00 GMT+8',
        timeZone: 'Asia/Shanghai'
      }
    )

    expect(queryNeedsStrictFreshness('今天的新闻')).toBe(true)
    expect(extractLatestResultDate('来源：央视新闻 | 2026年04月29日 10:16:33')).toBe(
      '2026-04-29'
    )
    expect(result.stale).toBe(true)
    expect(result.latestResultDate).toBe('2025-06-25')
    expect(result.output).toContain('Freshness guard:')
    expect(result.output).toContain('stale matches were omitted')
    expect(result.output).not.toContain('正当时')
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
        searchDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        searchTimeZone: expect.any(String)
      }
    })
    expect(result.output).toContain('Search reference time:')
    expect(result.output).toContain('Treat this as authoritative')
    expect(result.output).toContain('default result')
    expect(result.metadata).toMatchObject({
      provider: 'exa',
      query: 'latest openterm release',
      effectiveQuery: expect.stringContaining('Current date context:'),
      searchDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      searchTimeZone: expect.any(String),
      staleCurrentNewsResults: false,
      numResults: 8
    })
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({
      params: {
        name: 'web_search_exa',
        arguments: {
          numResults: 8
        }
      }
    })
    expect(body.params.arguments.query).toContain('latest openterm release')
    expect(body.params.arguments.query).toContain('Current date context:')
    expect(body.params.arguments.query).toContain('Interpret relative words')
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
