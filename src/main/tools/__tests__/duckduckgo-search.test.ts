import { describe, expect, it, vi } from 'vitest'
import { callDuckDuckGoSearch, parseDuckDuckGoHtml } from '../duckduckgo-search'

const html = `
  <div class="result">
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fnews%3Fa%3D1%26b%3D2">Example &amp; News</a>
    <a class="result__snippet" href="#">Published 2026-05-06 with useful details.</a>
  </div>
`

describe('duckduckgo-search fallback', () => {
  it('parses DuckDuckGo HTML result titles, URLs, and snippets', () => {
    expect(parseDuckDuckGoHtml(html, 5)).toEqual([
      {
        title: 'Example & News',
        url: 'https://example.com/news?a=1&b=2',
        snippet: 'Published 2026-05-06 with useful details.'
      }
    ])
  })

  it('fetches and formats search results', async () => {
    const fetchMock = vi.fn(async () => new Response(html, { status: 200 }))

    const output = await callDuckDuckGoSearch(
      { query: 'today news', numResults: 3 },
      { fetchImpl: fetchMock as unknown as typeof fetch, timeoutMs: 1000 }
    )

    expect(output).toContain('Provider: DuckDuckGo HTML Search')
    expect(output).toContain('Example & News')
    expect(output).toContain('https://example.com/news?a=1&b=2')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('https://html.duckduckgo.com/html/?q=today+news')
    expect(init.method).toBe('GET')
  })
})
