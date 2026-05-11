import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: (name: string) => `/tmp/test-openterm/${name}` }
}))

const mocks = vi.hoisted(() => ({
  getModelSettings: vi.fn(() => ({ exaApiKey: '' })),
  getPermissions: vi.fn(() => ({
    permissionMode: 'default',
    updatedAt: 1
  }))
}))

vi.mock('../../db', () => ({
  modelSettingsDB: {
    getSettings: mocks.getModelSettings
  },
  permissionDB: {
    getPermissions: mocks.getPermissions
  }
}))

import websearchTool, {
  buildFreshnessSearchQuery,
  buildSearchOutput,
  extractLatestResultDate,
  normalizeCurrentNewsQuery,
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
    mocks.getModelSettings.mockReturnValue({ exaApiKey: '' })
    mocks.getPermissions.mockReturnValue({
      permissionMode: 'default',
      updatedAt: 1
    })
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

  it('removes stale explicit dates from current-news queries before adding current date', () => {
    const context = {
      isoDate: '2026-05-06',
      localizedDate: '2026年5月6日',
      localDateTime: '2026/05/06 22:56:00 GMT+8',
      timeZone: 'Asia/Shanghai'
    }
    const normalized = normalizeCurrentNewsQuery('今日新闻 时事 2025年7月15日', context)
    const effectiveQuery = buildFreshnessSearchQuery('今日新闻 时事 2025年7月15日', context)

    expect(normalized).toMatchObject({
      query: '今日新闻 时事',
      displayQuery: '今日新闻 时事 2026年5月6日',
      removedDates: ['2025年7月15日']
    })
    expect(effectiveQuery).not.toContain('2025年7月15日')
    expect(effectiveQuery).toContain('今日新闻 时事 2026-05-06 2026年5月6日')
  })

  it('removes stale year-month dates from current-news queries before display', () => {
    const context = {
      isoDate: '2026-05-06',
      localizedDate: '2026年5月6日',
      localDateTime: '2026/05/06 23:26:00 GMT+8',
      timeZone: 'Asia/Shanghai'
    }
    const normalized = normalizeCurrentNewsQuery(
      '今日新闻 2025年7月 国内外重要新闻 2026年5月6日',
      context
    )

    expect(normalized.query).toBe('今日新闻 国内外重要新闻')
    expect(normalized.displayQuery).toBe('今日新闻 国内外重要新闻 2026年5月6日')
    expect(normalized.removedDates).toEqual(['2026年5月6日', '2025年7月'])
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
    expect(extractLatestResultDate('来源：央视新闻 | 2026年04月29日 10:16:33')).toBe('2026-04-29')
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
      metadata: expect.objectContaining({
        query: 'latest openterm release',
        originalQuery: 'latest openterm release',
        normalizedQuery: 'latest openterm release',
        removedDates: [],
        numResults: 8,
        searchDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        searchTimeZone: expect.any(String),
        riskCategory: 'network'
      })
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

  it('uses a configured Exa API key for hosted MCP requests', async () => {
    mocks.getModelSettings.mockReturnValue({ exaApiKey: 'configured-key' })
    const fetchMock = vi.fn(async () => {
      return new Response(
        'data: {"result":{"content":[{"type":"text","text":"keyed result"}]},"jsonrpc":"2.0","id":1}\n',
        { status: 200, headers: { 'content-type': 'text/event-stream' } }
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const tool = await websearchTool.init()
    await tool.execute({ query: 'anything' } as Parameters<typeof tool.execute>[0], makeCtx())

    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://mcp.exa.ai/mcp?exaApiKey=configured-key')
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

  it('falls back to DuckDuckGo search when Exa is rate limited', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          '{"jsonrpc":"2.0","error":{"code":-32000,"message":"You have hit Exa rate limit"},"id":null}',
          { status: 429 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          [
            '<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Ftoday">Today News</a>',
            '<a class="result__snippet" href="#">Published 2026-05-06 and updated today.</a>'
          ].join('\n'),
          { status: 200 }
        )
      )
    vi.stubGlobal('fetch', fetchMock)

    const tool = await websearchTool.init()
    const result = await tool.execute(
      { query: 'today news' } as Parameters<typeof tool.execute>[0],
      makeCtx()
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.output).toContain('Falling back to DuckDuckGo HTML Search')
    expect(result.output).toContain('Today News')
    expect(result.output).toContain('https://example.com/today')
    expect(result.metadata).toMatchObject({
      provider: 'duckduckgo',
      fallbackFrom: 'exa',
      fallbackReason: 'rate_limit'
    })
  })

  it('returns a clean rate-limit message for anonymous Exa MCP 429 responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            '{"jsonrpc":"2.0","error":{"code":-32000,"message":"You have hit Exa rate limit"},"id":null}',
            { status: 429 }
          )
      )
    )

    const tool = await websearchTool.init()
    const result = await tool.execute(
      { query: 'today news' } as Parameters<typeof tool.execute>[0],
      makeCtx()
    )

    expect(result.output).toContain('Exa hosted MCP rate limit reached (HTTP 429).')
    expect(result.output).toContain('Settings -> General -> Web Search')
    expect(result.output).not.toContain('jsonrpc')
    expect(result.metadata).toMatchObject({ error: true, errorCode: 'rate_limit' })
  })
})
