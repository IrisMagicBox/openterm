import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: (name: string) => `/tmp/test-openterm/${name}` }
}))

const mocks = vi.hoisted(() => ({
  getPermissions: vi.fn(() => ({
    permissionMode: 'auto_review',
    updatedAt: 1
  }))
}))

vi.mock('../../db', () => ({
  permissionDB: {
    getPermissions: mocks.getPermissions
  }
}))

import webfetchTool, {
  callDirectWebFetch,
  callJinaReader,
  extractReadablePage
} from '../webfetch'
import { ToolSchemaValidationError, type Tool } from '../tool-factory'

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

describe('webfetch tool', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    mocks.getPermissions.mockReturnValue({
      permissionMode: 'auto_review',
      updatedAt: 1
    })
  })

  it('extracts readable content from HTML', () => {
    const page = extractReadablePage(
      `
        <html>
          <head>
            <title>Example &amp; Page</title>
            <meta name="description" content="Short page description.">
          </head>
          <body>
            <nav>Skip navigation</nav>
            <article><h1>Example Page</h1><p>Hello <strong>reader</strong>.</p></article>
          </body>
        </html>
      `,
      'https://example.com/article'
    )

    expect(page.title).toBe('Example & Page')
    expect(page.excerpt).toBe('Short page description.')
    expect(page.markdown).toContain('# Example & Page')
    expect(page.markdown).toContain('Hello reader.')
  })

  it('calls Jina Reader with an exact URL and returns markdown', async () => {
    const fetchMock = vi.fn(async () => new Response('# Example\n\nReadable body.', { status: 200 }))
    const page = await callJinaReader(
      { url: 'https://example.com/a', maxLength: 1000 },
      { fetchImpl: fetchMock as unknown as typeof fetch, timeoutMs: 1000 }
    )

    expect(page.title).toBe('Example')
    expect(page.markdown).toContain('Readable body.')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://r.jina.ai/')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'X-Return-Format': 'markdown'
    })
    expect(init.body).toBe(JSON.stringify({ url: 'https://example.com/a' }))
  })

  it('falls back to direct fetch when Jina Reader fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
      .mockResolvedValueOnce(
        new Response(
          '<html><head><title>Direct Page</title></head><body><main><p>Direct body.</p></main></body></html>',
          { status: 200, headers: { 'content-type': 'text/html' } }
        )
      )
    vi.stubGlobal('fetch', fetchMock)

    const tool = await webfetchTool.init()
    const result = await tool.execute({ url: 'https://example.com/direct', maxLength: 4096 }, makeCtx())

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.output).toContain('Provider: Direct fetch')
    expect(result.output).toContain('Fallback reason: Jina Reader failed with HTTP 502')
    expect(result.output).toContain('Direct body.')
    expect(result.metadata).toMatchObject({
      provider: 'direct',
      url: 'https://example.com/direct',
      fallbackFromJina: true
    })
  })

  it('asks permission in default mode but not auto-review mode', async () => {
    const fetchMock = vi.fn(async () => new Response('# Example\n\nReadable body.', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const autoCtx = makeCtx()
    const tool = await webfetchTool.init()
    await tool.execute({ url: 'https://example.com/auto', maxLength: 4096 }, autoCtx)
    expect(autoCtx.ask).not.toHaveBeenCalled()

    mocks.getPermissions.mockReturnValue({ permissionMode: 'default', updatedAt: 1 })
    const defaultCtx = makeCtx()
    await tool.execute({ url: 'https://example.com/default', maxLength: 4096 }, defaultCtx)
    expect(defaultCtx.ask).toHaveBeenCalledWith({
      permission: 'webfetch',
      pattern: 'https://example.com/default',
      metadata: expect.objectContaining({
        url: 'https://example.com/default',
        riskCategory: 'network'
      })
    })
  })

  it('rejects URLs without a schema instead of guessing', async () => {
    const tool = await webfetchTool.init()

    await expect(async () =>
      tool.execute({ url: 'example.com/article' } as Parameters<typeof tool.execute>[0], makeCtx())
    ).rejects.toThrow(ToolSchemaValidationError)
  })

  it('direct fetch can read plain text and truncate output', async () => {
    const fetchMock = vi.fn(async () =>
      new Response('abcdefghijklmnopqrstuvwxyz', {
        status: 200,
        headers: { 'content-type': 'text/plain' }
      })
    )

    const page = await callDirectWebFetch(
      { url: 'https://example.com/plain.txt', maxLength: 16 },
      { fetchImpl: fetchMock as unknown as typeof fetch, timeoutMs: 1000 }
    )

    expect(page.markdown).toContain('[truncated]')
    expect(page.truncated).toBe(true)
  })
})
