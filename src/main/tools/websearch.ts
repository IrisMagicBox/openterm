import { z } from 'zod'
import { define, Tool } from './tool-factory'
import { callMcpExaSearch } from './mcp-exa'
import { getErrorMessage } from '../../shared/errors'

const parameters = z.object({
  query: z.string().min(1).describe('Web search query'),
  numResults: z.number().int().positive().default(8).describe('Number of search results to return'),
  livecrawl: z
    .enum(['fallback', 'preferred'])
    .default('fallback')
    .describe('Live crawl mode for Exa search results'),
  type: z.enum(['auto', 'fast', 'deep']).default('auto').describe('Search type'),
  contextMaxCharacters: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Maximum characters for the LLM-optimized context string')
})

export default define('websearch', {
  description:
    'Search the web using Exa AI hosted MCP. Use this for current information, third-party docs, release notes, recent events, or facts beyond the model cutoff. No API key is required.',
  parameters,
  async execute(args: z.infer<typeof parameters>, ctx: Tool.Context): Promise<Tool.ExecuteResult> {
    await ctx.ask({
      permission: 'websearch',
      pattern: args.query,
      metadata: {
        query: args.query,
        numResults: args.numResults,
        livecrawl: args.livecrawl,
        type: args.type,
        contextMaxCharacters: args.contextMaxCharacters
      }
    })

    try {
      const output = await callMcpExaSearch(
        {
          query: args.query,
          numResults: args.numResults,
          livecrawl: args.livecrawl,
          type: args.type,
          contextMaxCharacters: args.contextMaxCharacters
        },
        { signal: ctx.abort }
      )

      return {
        title: `Web search: ${args.query}`,
        output: output ?? 'No search results found. Please try a different query.',
        metadata: {
          provider: 'exa',
          query: args.query,
          numResults: args.numResults,
          livecrawl: args.livecrawl,
          type: args.type,
          contextMaxCharacters: args.contextMaxCharacters
        }
      }
    } catch (error) {
      return {
        title: `Web search: ${args.query}`,
        output: `Error: Web search failed: ${getErrorMessage(error)}`,
        metadata: {
          provider: 'exa',
          query: args.query,
          error: true
        }
      }
    }
  }
})
