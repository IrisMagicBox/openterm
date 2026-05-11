import { z } from 'zod'
import { define, Tool } from './tool-factory'
import { modelSettingsDB, permissionDB } from '../db'
import { callDuckDuckGoSearch } from './duckduckgo-search'
import { callMcpExaSearch, McpExaError } from './mcp-exa'
import { getErrorMessage } from '../../shared/errors'
import { shouldAskToolPermission } from '../permissions'

const parameters = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      'Web search query. For current-news or relative-date searches, do not add your own explicit date; the tool will anchor the query to the current local date.'
    ),
  numResults: z.number().int().positive().default(8).describe('Number of search results to return')
})

const STRICT_FRESHNESS_WINDOW_DAYS = 7
const RELATIVE_DATE_QUERY_PATTERN =
  /(今天|今日|现在|当前|最新|最近|此刻|today|now|latest|recent|current)/i
const CURRENT_NEWS_QUERY_PATTERN = /(新闻|要闻|快讯|热点|时事|资讯|news|headlines|current events)/i
const DAY_MS = 24 * 60 * 60 * 1000

interface SearchTimeContext {
  isoDate: string
  localizedDate: string
  localDateTime: string
  timeZone: string
}

interface FreshnessOutput {
  output: string
  stale: boolean
  latestResultDate?: string
}

interface NormalizedSearchQuery {
  query: string
  displayQuery: string
  removedDates: string[]
}

const EXPLICIT_DATE_PATTERNS = [
  /\b20\d{2}[-/.](?:1[0-2]|0?[1-9])[-/.](?:3[01]|[12]\d|0?[1-9])\b/g,
  /\b20\d{2}年\s*(?:1[0-2]|0?[1-9])月\s*(?:3[01]|[12]\d|0?[1-9])日?/g,
  /\b20\d{2}[-/.](?:1[0-2]|0?[1-9])\b/g,
  /\b20\d{2}年\s*(?:1[0-2]|0?[1-9])月/g,
  /\b(?:1[0-2]|0?[1-9])月\s*(?:3[01]|[12]\d|0?[1-9])日/g,
  /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+20\d{2}\b/gi,
  /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+20\d{2}\b/gi
]

function getConfiguredExaApiKey(): string | undefined {
  const settingsKey = modelSettingsDB.getSettings().exaApiKey.trim()
  if (settingsKey) return settingsKey
  const envKey = process.env.EXA_API_KEY?.trim()
  return envKey || undefined
}

function formatWebSearchError(error: unknown): string {
  if (error instanceof McpExaError) {
    if (error.code === 'rate_limit') {
      return [
        'Exa hosted MCP rate limit reached (HTTP 429).',
        'Configure an Exa API key in Settings -> General -> Web Search, or set EXA_API_KEY in the OpenTerm environment, then retry.'
      ].join(' ')
    }
    if (error.code === 'auth') {
      return 'Exa hosted MCP rejected the configured API key. Check the Exa API key in Settings -> General -> Web Search, then retry.'
    }
  }
  return getErrorMessage(error)
}

function shouldTryFallbackSearch(error: unknown): error is McpExaError {
  return error instanceof McpExaError && (error.code === 'rate_limit' || error.code === 'auth')
}

function buildFallbackSearchQuery(query: string, context: SearchTimeContext): string {
  const normalized = normalizeCurrentNewsQuery(query, context)
  return queryNeedsStrictFreshness(query)
    ? `${normalized.query} ${context.isoDate} ${context.localizedDate}`
    : query
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatIsoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`
}

function toDayNumber(isoDate: string): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) return undefined

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined
  }

  return Math.floor(date.getTime() / DAY_MS)
}

export function getSearchTimeContext(now = new Date()): SearchTimeContext {
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const day = now.getDate()
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'
  const localDateTime = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short'
  }).format(now)

  return {
    isoDate: formatIsoDate(year, month, day),
    localizedDate: `${year}年${month}月${day}日`,
    localDateTime,
    timeZone
  }
}

export function queryNeedsStrictFreshness(query: string): boolean {
  return RELATIVE_DATE_QUERY_PATTERN.test(query) && CURRENT_NEWS_QUERY_PATTERN.test(query)
}

function cleanupQuery(value: string): string {
  return value
    .replace(/[，,、;；]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeCurrentNewsQuery(
  query: string,
  context: SearchTimeContext
): NormalizedSearchQuery {
  if (!queryNeedsStrictFreshness(query)) {
    return { query, displayQuery: query, removedDates: [] }
  }

  const removedDates: string[] = []
  let normalized = query
  for (const pattern of EXPLICIT_DATE_PATTERNS) {
    normalized = normalized.replace(pattern, (match) => {
      removedDates.push(match)
      return ' '
    })
  }

  const cleaned = cleanupQuery(normalized) || query
  return {
    query: cleaned,
    displayQuery: `${cleaned} ${context.localizedDate}`,
    removedDates
  }
}

export function buildFreshnessSearchQuery(query: string, context: SearchTimeContext): string {
  const normalized = normalizeCurrentNewsQuery(query, context)
  const datedQuery = queryNeedsStrictFreshness(query)
    ? `${normalized.query} ${context.isoDate} ${context.localizedDate}`
    : query

  return [
    datedQuery,
    '',
    `Current date context: ${context.isoDate} (${context.localizedDate}); local time: ${context.localDateTime}; timezone: ${context.timeZone}.`,
    `Interpret relative words such as latest, recent, today, now, 当前, 最新, 最近, 今天, 现在 against this date. For current-news queries, search for reports published on or very near ${context.isoDate} / ${context.localizedDate}. Do not return historical result pages unless the query explicitly asks for a historical period.`
  ].join('\n')
}

function collectIsoDate(dates: Set<string>, year: number, month: number, day: number): void {
  const isoDate = formatIsoDate(year, month, day)
  if (toDayNumber(isoDate) !== undefined) {
    dates.add(isoDate)
  }
}

export function extractLatestResultDate(text: string): string | undefined {
  const dates = new Set<string>()

  for (const match of text.matchAll(/\b(20\d{2})-(0[1-9]|1[0-2])-([0-2]\d|3[01])(?:T|\b)/g)) {
    collectIsoDate(dates, Number(match[1]), Number(match[2]), Number(match[3]))
  }

  for (const match of text.matchAll(/\b(20\d{2})年\s*(1[0-2]|0?[1-9])月\s*([0-2]?\d|3[01])日/g)) {
    collectIsoDate(dates, Number(match[1]), Number(match[2]), Number(match[3]))
  }

  return Array.from(dates).sort().at(-1)
}

export function buildSearchOutput(
  query: string,
  rawOutput: string | undefined,
  context: SearchTimeContext
): FreshnessOutput {
  const reference = `Search reference time: ${context.localDateTime} (${context.timeZone}). Treat this as authoritative for relative terms such as "today", "latest", "now", "当前", "最新", "现在".`
  const fallback = rawOutput ?? 'No search results found. Please try a different query.'

  if (rawOutput && queryNeedsStrictFreshness(query)) {
    const latestResultDate = extractLatestResultDate(rawOutput)
    const currentDay = toDayNumber(context.isoDate)
    const latestDay = latestResultDate ? toDayNumber(latestResultDate) : undefined

    if (
      currentDay !== undefined &&
      latestDay !== undefined &&
      currentDay - latestDay > STRICT_FRESHNESS_WINDOW_DAYS
    ) {
      return {
        stale: true,
        latestResultDate,
        output: [
          reference,
          `Freshness guard: This is a current-news query for ${context.isoDate} (${context.localizedDate}), but the newest date found in the returned search results is ${latestResultDate}, more than ${STRICT_FRESHNESS_WINDOW_DAYS} days older. The stale matches were omitted so they are not reported as today's news. Tell the user no sufficiently current results were found, or run a more specific search for ${context.isoDate} / ${context.localizedDate}.`
        ].join('\n\n')
      }
    }
  }

  return {
    stale: false,
    latestResultDate: rawOutput ? extractLatestResultDate(rawOutput) : undefined,
    output: [reference, fallback].join('\n\n')
  }
}

export default define('websearch', {
  description:
    'Search the web using Exa AI hosted MCP. Use this for current information, third-party docs, release notes, recent events, or facts beyond the model cutoff. Relative-date searches are anchored to the current local date. Anonymous search works by default; a configured Exa API key is used when available to avoid hosted MCP rate limits.',
  parameters,
  async execute(args: z.infer<typeof parameters>, ctx: Tool.Context): Promise<Tool.ExecuteResult> {
    const timeContext = getSearchTimeContext()
    const normalizedQuery = normalizeCurrentNewsQuery(args.query, timeContext)
    const effectiveQuery = buildFreshnessSearchQuery(args.query, timeContext)

    const permissionMetadata = {
      query: normalizedQuery.displayQuery,
      originalQuery: args.query,
      normalizedQuery: normalizedQuery.query,
      removedDates: normalizedQuery.removedDates,
      numResults: args.numResults,
      searchDate: timeContext.isoDate,
      searchTimeZone: timeContext.timeZone,
      riskCategory: 'network'
    }

    if (
      shouldAskToolPermission(permissionDB.getPermissions(), {
        permission: 'websearch',
        riskLevel: 'medium',
        riskCategory: 'network'
      })
    ) {
      await ctx.ask({
        permission: 'websearch',
        pattern: normalizedQuery.displayQuery,
        metadata: permissionMetadata
      })
    }

    try {
      const output = await callMcpExaSearch(
        {
          query: effectiveQuery,
          numResults: args.numResults
        },
        { apiKey: getConfiguredExaApiKey(), signal: ctx.abort }
      )
      const searchOutput = buildSearchOutput(normalizedQuery.query, output, timeContext)

      return {
        title: `Web search: ${normalizedQuery.displayQuery}`,
        output: searchOutput.output,
        metadata: {
          provider: 'exa',
          query: normalizedQuery.displayQuery,
          originalQuery: args.query,
          normalizedQuery: normalizedQuery.query,
          displayQuery: normalizedQuery.displayQuery,
          removedDates: normalizedQuery.removedDates,
          effectiveQuery,
          searchDate: timeContext.isoDate,
          searchTimeZone: timeContext.timeZone,
          latestResultDate: searchOutput.latestResultDate,
          staleCurrentNewsResults: searchOutput.stale,
          numResults: args.numResults
        }
      }
    } catch (error) {
      if (shouldTryFallbackSearch(error)) {
        const fallbackQuery = buildFallbackSearchQuery(args.query, timeContext)
        try {
          const fallbackOutput = await callDuckDuckGoSearch(
            {
              query: fallbackQuery,
              numResults: args.numResults
            },
            { signal: ctx.abort }
          )
          const fallbackNotice = `Notice: Exa hosted MCP could not complete this search (${error.code}). Falling back to DuckDuckGo HTML Search.`
          const searchOutput = buildSearchOutput(
            normalizedQuery.query,
            fallbackOutput
              ? [fallbackNotice, fallbackOutput].join('\n\n')
              : `${fallbackNotice}\n\nNo search results found. Please try a different query.`,
            timeContext
          )

          return {
            title: `Web search: ${normalizedQuery.displayQuery}`,
            output: searchOutput.output,
            metadata: {
              provider: 'duckduckgo',
              fallbackFrom: 'exa',
              fallbackReason: error.code,
              query: normalizedQuery.displayQuery,
              originalQuery: args.query,
              normalizedQuery: normalizedQuery.query,
              displayQuery: normalizedQuery.displayQuery,
              removedDates: normalizedQuery.removedDates,
              effectiveQuery,
              fallbackQuery,
              searchDate: timeContext.isoDate,
              searchTimeZone: timeContext.timeZone,
              latestResultDate: searchOutput.latestResultDate,
              staleCurrentNewsResults: searchOutput.stale,
              numResults: args.numResults
            }
          }
        } catch (fallbackError) {
          return {
            title: `Web search: ${normalizedQuery.displayQuery}`,
            output: `Error: Web search failed: ${formatWebSearchError(error)} Fallback search also failed: ${getErrorMessage(fallbackError)}`,
            metadata: {
              provider: 'exa',
              fallbackProvider: 'duckduckgo',
              query: normalizedQuery.displayQuery,
              originalQuery: args.query,
              normalizedQuery: normalizedQuery.query,
              displayQuery: normalizedQuery.displayQuery,
              removedDates: normalizedQuery.removedDates,
              effectiveQuery,
              fallbackQuery,
              searchDate: timeContext.isoDate,
              searchTimeZone: timeContext.timeZone,
              errorCode: error.code,
              fallbackError: getErrorMessage(fallbackError),
              error: true
            }
          }
        }
      }

      return {
        title: `Web search: ${normalizedQuery.displayQuery}`,
        output: `Error: Web search failed: ${formatWebSearchError(error)}`,
        metadata: {
          provider: 'exa',
          query: normalizedQuery.displayQuery,
          originalQuery: args.query,
          normalizedQuery: normalizedQuery.query,
          displayQuery: normalizedQuery.displayQuery,
          removedDates: normalizedQuery.removedDates,
          effectiveQuery,
          searchDate: timeContext.isoDate,
          searchTimeZone: timeContext.timeZone,
          errorCode: error instanceof McpExaError ? error.code : undefined,
          error: true
        }
      }
    }
  }
})
