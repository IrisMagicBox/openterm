const DUCKDUCKGO_HTML_URL = 'https://html.duckduckgo.com/html/'
const DEFAULT_TIMEOUT_MS = 15_000

export interface DuckDuckGoSearchArgs {
  query: string
  numResults: number
}

export interface DuckDuckGoCallOptions {
  fetchImpl?: typeof fetch
  signal?: AbortSignal
  timeoutMs?: number
}

interface DuckDuckGoResult {
  title: string
  url: string
  snippet?: string
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"'
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (entity, name: string) => NAMED_ENTITIES[name] ?? entity)
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function unwrapDuckDuckGoUrl(value: string): string {
  const decoded = decodeHtmlEntities(value)
  try {
    const url = new URL(decoded, DUCKDUCKGO_HTML_URL)
    if (url.hostname.endsWith('duckduckgo.com') && url.pathname === '/l/') {
      const target = url.searchParams.get('uddg')
      if (target) return target
    }
    return url.toString()
  } catch {
    return decoded
  }
}

function extractSnippet(body: string, start: number, end: number): string | undefined {
  const segment = body.slice(start, end)
  const match =
    /class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div)>/i.exec(segment)
  const snippet = match ? stripHtml(match[1]) : ''
  return snippet || undefined
}

export function parseDuckDuckGoHtml(body: string, numResults: number): DuckDuckGoResult[] {
  const results: DuckDuckGoResult[] = []
  const anchorPattern =
    /<a\b[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  const matches = Array.from(body.matchAll(anchorPattern))

  for (let index = 0; index < matches.length && results.length < numResults; index += 1) {
    const match = matches[index]
    const title = stripHtml(match[2])
    const url = unwrapDuckDuckGoUrl(match[1])
    if (!title || !/^https?:\/\//i.test(url)) continue

    const nextMatchIndex = matches[index + 1]?.index
    const snippetEnd =
      typeof nextMatchIndex === 'number' ? nextMatchIndex : (match.index ?? 0) + match[0].length + 3000
    const snippet = extractSnippet(body, match.index ?? 0, snippetEnd)
    results.push({ title, url, snippet })
  }

  return results
}

function formatDuckDuckGoResults(results: DuckDuckGoResult[]): string | undefined {
  if (results.length === 0) return undefined

  return [
    'Fallback provider: DuckDuckGo HTML Search',
    '',
    ...results.map((result, index) =>
      [
        `${index + 1}. ${result.title}`,
        `URL: ${result.url}`,
        result.snippet ? `Snippet: ${result.snippet}` : undefined
      ]
        .filter(Boolean)
        .join('\n')
    )
  ].join('\n\n')
}

export async function callDuckDuckGoSearch(
  args: DuckDuckGoSearchArgs,
  options: DuckDuckGoCallOptions = {}
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
    const url = new URL(DUCKDUCKGO_HTML_URL)
    url.searchParams.set('q', args.query)

    const response = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'OpenTerm/1.0 websearch fallback'
      },
      signal: controller.signal
    })

    if (!response.ok) {
      throw new Error(`DuckDuckGo fallback failed with HTTP ${response.status}`)
    }

    return formatDuckDuckGoResults(parseDuckDuckGoHtml(await response.text(), args.numResults))
  } catch (error) {
    if (timedOut) throw new Error(`DuckDuckGo fallback timed out after ${timeoutMs}ms`)
    if (options.signal?.aborted) throw new Error('DuckDuckGo fallback aborted')
    throw error
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abortFromParent)
  }
}
