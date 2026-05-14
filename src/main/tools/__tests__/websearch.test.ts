import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: (name: string) => `/tmp/test-openterm/${name}` }
}))

const mocks = vi.hoisted(() => ({
  getPermissions: vi.fn(() => ({
    permissionMode: 'default',
    updatedAt: 1
  }))
}))

vi.mock('../../db', () => ({
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

  it('uses DuckDuckGo search without API credentials and asks permission for the query', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        [
          '<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Frelease">OpenTerm Release</a>',
          '<a class="result__snippet" href="#">Latest release details.</a>'
        ].join('\n'),
        { status: 200, headers: { 'content-type': 'text/html' } }
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
    expect(result.output).toContain('Provider: DuckDuckGo HTML Search')
    expect(result.output).toContain('OpenTerm Release')
    expect(result.output).toContain('https://example.com/release')
    expect(result.metadata).toMatchObject({
      provider: 'duckduckgo',
      query: 'latest openterm release',
      effectiveQuery: expect.stringContaining('Current date context:'),
      searchQuery: 'latest openterm release',
      searchDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      searchTimeZone: expect.any(String),
      staleCurrentNewsResults: false,
      numResults: 8
    })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://html.duckduckgo.com/html/?q=latest+openterm+release')
    expect(init.method).toBe('GET')
    expect(init.headers).toMatchObject({
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'OpenTerm/1.0 websearch'
    })
  })

  it('returns a readable error when web search fails', async () => {
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

  it('anchors current-news DuckDuckGo queries to the current date', async () => {
    const today = new Date()
    const yyyy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    const todayIso = `${yyyy}-${mm}-${dd}`
    const fetchMock = vi.fn(async () => {
      return new Response(
        [
          '<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Ftoday">Today News</a>',
          `<a class="result__snippet" href="#">Published ${todayIso} and updated today.</a>`
        ].join('\n'),
        { status: 200 }
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const tool = await websearchTool.init()
    const result = await tool.execute(
      { query: 'today news' } as Parameters<typeof tool.execute>[0],
      makeCtx()
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.output).toContain('Today News')
    expect(result.output).toContain('https://example.com/today')
    expect(result.metadata).toMatchObject({
      provider: 'duckduckgo',
      searchQuery: expect.stringMatching(/^today news \d{4}-\d{2}-\d{2} \d{4}年\d+月\d+日$/)
    })
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(decodeURIComponent(url)).toMatch(
      /^https:\/\/html\.duckduckgo\.com\/html\/\?q=today\+news\+\d{4}-\d{2}-\d{2}\+\d{4}年\d+月\d+日$/
    )
  })
})
