import { z } from 'zod'
import { define, Tool } from './tool-factory'
import { permissionDB } from '../db'
import { getErrorMessage } from '../../shared/errors'
import { shouldAskToolPermission } from '../permissions'

const JINA_READER_URL = 'https://r.jina.ai/'
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_LENGTH = 4096
const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

const parameters = z.object({
  url: z
    .string()
    .min(1)
    .trim()
    .refine((value) => isHttpUrl(value), {
      message:
        'URL must include http:// or https:// and must be an exact URL from the user or websearch results.'
    })
    .describe(
      'Exact http(s) URL to fetch. Use only URLs provided by the user or returned by websearch. Do not add www. or guess missing schemas.'
    ),
  maxLength: z
    .number()
    .int()
    .positive()
    .max(20_000)
    .default(DEFAULT_MAX_LENGTH)
    .describe('Maximum characters of readable page content to return.')
})

export interface WebFetchArgs {
  url: string
  maxLength?: number
}

export interface WebFetchOptions {
  fetchImpl?: typeof fetch
  signal?: AbortSignal
  timeoutMs?: number
}

export interface ReadablePage {
  title?: string
  excerpt?: string
  markdown: string
  contentLength: number
  truncated: boolean
}

interface TimeoutSignal {
  signal: AbortSignal
  dispose(): void
  timedOut(): boolean
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function normalizeUrl(value: string): string {
  return new URL(value.trim()).toString()
}

function createTimeoutSignal(parent: AbortSignal | undefined, timeoutMs: number): TimeoutSignal {
  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const abortFromParent = (): void => controller.abort()

  if (parent?.aborted) {
    controller.abort()
  } else {
    parent?.addEventListener('abort', abortFromParent, { once: true })
  }

  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timeout)
      parent?.removeEventListener('abort', abortFromParent)
    },
    timedOut() {
      return timedOut
    }
  }
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

function firstHtmlMatch(html: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(html)
  return match ? stripHtml(match[1]) : undefined
}

function extractPageTitle(html: string): string | undefined {
  return (
    firstHtmlMatch(html, /<meta\b[^>]*(?:property|name)=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
    firstHtmlMatch(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i) ||
    firstHtmlMatch(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i)
  )
}

function extractPageDescription(html: string): string | undefined {
  return firstHtmlMatch(
    html,
    /<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i
  )
}

function extractTagContent(html: string, tag: string): string | undefined {
  const pattern = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  return pattern.exec(html)?.[1]
}

function htmlToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<\/(?:h[1-6]|p|div|section|article|main|header|footer|blockquote|pre)>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '\n- ')
      .replace(/<\/li>/gi, '')
      .replace(/<[^>]*>/g, ' ')
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,!?;:，。！？；：])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function cleanMarkdown(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

function truncateReadableContent(value: string, maxLength: number): { content: string; truncated: boolean } {
  if (value.length <= maxLength) {
    return { content: value, truncated: false }
  }
  return { content: `${value.slice(0, Math.max(0, maxLength - 20)).trimEnd()}\n\n[truncated]`, truncated: true }
}

export function extractReadablePage(html: string, sourceUrl: string, maxLength = DEFAULT_MAX_LENGTH): ReadablePage {
  const title = extractPageTitle(html) || new URL(sourceUrl).hostname
  const excerpt = extractPageDescription(html)
  const contentHtml =
    extractTagContent(html, 'article') ||
    extractTagContent(html, 'main') ||
    extractTagContent(html, 'body') ||
    html
  const bodyText = htmlToText(contentHtml)
  const sections = [`# ${title}`, excerpt, bodyText].filter((part): part is string => Boolean(part))
  const markdown = cleanMarkdown(sections.join('\n\n'))
  const truncated = truncateReadableContent(markdown, maxLength)

  return {
    title,
    excerpt,
    markdown: truncated.content,
    contentLength: markdown.length,
    truncated: truncated.truncated
  }
}

export async function callJinaReader(
  args: { url: string; maxLength: number },
  options: WebFetchOptions = {}
): Promise<ReadablePage> {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const timeout = createTimeoutSignal(options.signal, timeoutMs)
  const headers: Record<string, string> = {
    Accept: 'text/markdown,text/plain,*/*',
    'Content-Type': 'application/json',
    'User-Agent': 'OpenTerm/1.0 webfetch',
    'X-Return-Format': 'markdown',
    'X-Timeout': String(Math.ceil(timeoutMs / 1000))
  }
  if (process.env.JINA_API_KEY) {
    headers.Authorization = `Bearer ${process.env.JINA_API_KEY}`
  }

  try {
    const response = await fetchImpl(JINA_READER_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url: args.url }),
      signal: timeout.signal
    })

    if (!response.ok) {
      throw new Error(`Jina Reader failed with HTTP ${response.status}`)
    }

    const text = cleanMarkdown(await response.text())
    if (!text) {
      throw new Error('Jina Reader returned empty content')
    }

    const truncated = truncateReadableContent(text, args.maxLength)
    const title = text
      .split(/\n+/)
      .map((line) => line.replace(/^#{1,6}\s*/, '').trim())
      .find(Boolean)

    return {
      title,
      markdown: truncated.content,
      contentLength: text.length,
      truncated: truncated.truncated
    }
  } catch (error) {
    if (timeout.timedOut()) throw new Error(`Jina Reader timed out after ${timeoutMs}ms`)
    if (options.signal?.aborted) throw new Error('Jina Reader request aborted')
    throw error
  } finally {
    timeout.dispose()
  }
}

export async function callDirectWebFetch(
  args: { url: string; maxLength: number },
  options: WebFetchOptions = {}
): Promise<ReadablePage> {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const timeout = createTimeoutSignal(options.signal, timeoutMs)

  try {
    const response = await fetchImpl(args.url, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.5',
        'User-Agent': DESKTOP_USER_AGENT
      },
      signal: timeout.signal
    })

    if (!response.ok) {
      throw new Error(`Direct fetch failed with HTTP ${response.status}`)
    }

    const contentType = response.headers.get('content-type') || ''
    const text = await response.text()
    if (!text.trim()) {
      throw new Error('Direct fetch returned empty content')
    }

    if (/html|xml/i.test(contentType) || /<html|<body|<article|<main/i.test(text)) {
      return extractReadablePage(text, args.url, args.maxLength)
    }

    const cleaned = cleanMarkdown(text)
    const truncated = truncateReadableContent(cleaned, args.maxLength)
    return {
      markdown: truncated.content,
      contentLength: cleaned.length,
      truncated: truncated.truncated
    }
  } catch (error) {
    if (timeout.timedOut()) throw new Error(`Direct fetch timed out after ${timeoutMs}ms`)
    if (options.signal?.aborted) throw new Error('Direct fetch request aborted')
    throw error
  } finally {
    timeout.dispose()
  }
}

function formatWebFetchOutput(args: {
  url: string
  provider: string
  page: ReadablePage
  fallbackReason?: string
}): string {
  return [
    `Source URL: ${args.url}`,
    `Provider: ${args.provider}`,
    args.fallbackReason ? `Fallback reason: ${args.fallbackReason}` : undefined,
    args.page.truncated ? `Content truncated to fit tool output. Original characters: ${args.page.contentLength}.` : undefined,
    '',
    args.page.markdown || 'No readable content could be extracted from this page.'
  ]
    .filter((line) => line !== undefined)
    .join('\n')
}

export default define('webfetch', {
  description:
    'Fetch and extract readable page content from an exact URL. Use this after websearch returns a relevant URL, or when the user provides a URL. Do not use execute_command/curl for normal page reading.',
  parameters,
  formatValidationError: () =>
    'The webfetch tool requires an exact URL with http:// or https://. Use a URL from the user or from websearch results; do not add www. or guess a missing schema.',
  async execute(args: z.infer<typeof parameters>, ctx: Tool.Context): Promise<Tool.ExecuteResult> {
    const url = normalizeUrl(args.url)
    const permissionMetadata = {
      url,
      maxLength: args.maxLength,
      riskCategory: 'network'
    }

    if (
      shouldAskToolPermission(permissionDB.getPermissions(), {
        permission: 'webfetch',
        riskLevel: 'medium',
        riskCategory: 'network'
      })
    ) {
      await ctx.ask({
        permission: 'webfetch',
        pattern: url,
        metadata: permissionMetadata
      })
    }

    try {
      const page = await callJinaReader(
        { url, maxLength: args.maxLength },
        { signal: ctx.abort, timeoutMs: DEFAULT_TIMEOUT_MS }
      )
      return {
        title: `Web fetch: ${url}`,
        output: formatWebFetchOutput({ url, provider: 'Jina Reader', page }),
        metadata: {
          provider: 'jina',
          url,
          title: page.title,
          excerpt: page.excerpt,
          contentLength: page.contentLength,
          contentTruncated: page.truncated,
          maxLength: args.maxLength
        }
      }
    } catch (jinaError) {
      try {
        const page = await callDirectWebFetch(
          { url, maxLength: args.maxLength },
          { signal: ctx.abort, timeoutMs: DEFAULT_TIMEOUT_MS }
        )
        return {
          title: `Web fetch: ${url}`,
          output: formatWebFetchOutput({
            url,
            provider: 'Direct fetch',
            page,
            fallbackReason: getErrorMessage(jinaError)
          }),
          metadata: {
            provider: 'direct',
            url,
            title: page.title,
            excerpt: page.excerpt,
            contentLength: page.contentLength,
            contentTruncated: page.truncated,
            maxLength: args.maxLength,
            fallbackFromJina: true,
            fallbackReason: getErrorMessage(jinaError)
          }
        }
      } catch (directError) {
        return {
          title: `Web fetch: ${url}`,
          output: [
            `Error: Web fetch failed for ${url}.`,
            `Jina Reader: ${getErrorMessage(jinaError)}`,
            `Direct fetch: ${getErrorMessage(directError)}`
          ].join('\n'),
          metadata: {
            provider: 'jina+direct',
            url,
            maxLength: args.maxLength,
            error: true,
            jinaError: getErrorMessage(jinaError),
            directError: getErrorMessage(directError)
          }
        }
      }
    }
  }
})
