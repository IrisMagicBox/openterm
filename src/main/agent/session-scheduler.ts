/**
 * SessionScheduler — Groups tool calls by host for optimal execution.
 * Same-host = sequential (SSH sessions are stateful).
 * Different-host = parallel. No hostId = parallel with everything.
 */

import type { ChatCompletionMessageFunctionToolCall } from 'openai/resources/chat/completions/completions'
import type { ToolResult } from '../../shared/types'

export interface ToolExecutionGroup {
  hostId: string | null
  calls: ChatCompletionMessageFunctionToolCall[]
}

function extractHostId(toolCall: ChatCompletionMessageFunctionToolCall): string | null {
  try {
    const args = JSON.parse(toolCall.function.arguments)
    return args.hostId ?? null
  } catch {
    return null
  }
}

export function groupByHost(
  toolCalls: ChatCompletionMessageFunctionToolCall[]
): ToolExecutionGroup[] {
  const hostGroups = new Map<string, ChatCompletionMessageFunctionToolCall[]>()
  const nonHostCalls: ToolExecutionGroup[] = []

  for (const tc of toolCalls) {
    const hostId = extractHostId(tc)
    if (hostId === null) {
      nonHostCalls.push({ hostId: null, calls: [tc] })
    } else {
      if (!hostGroups.has(hostId)) hostGroups.set(hostId, [])
      hostGroups.get(hostId)!.push(tc)
    }
  }

  const hostCallGroups = Array.from(hostGroups.entries()).map(([hostId, calls]) => ({
    hostId,
    calls
  }))

  return [...hostCallGroups, ...nonHostCalls]
}

async function executeGroupSequentially(
  group: ToolExecutionGroup,
  executor: (toolCall: ChatCompletionMessageFunctionToolCall) => Promise<ToolResult>,
  signal?: AbortSignal
): Promise<ToolResult[]> {
  const results: ToolResult[] = []
  for (const tc of group.calls) {
    if (signal?.aborted) break
    results.push(await executor(tc))
  }
  return results
}

export async function executeGrouped(
  toolCalls: ChatCompletionMessageFunctionToolCall[],
  executor: (toolCall: ChatCompletionMessageFunctionToolCall) => Promise<ToolResult>,
  signal?: AbortSignal
): Promise<Map<string, ToolResult>> {
  if (toolCalls.length === 0) return new Map()

  if (signal?.aborted) return new Map()

  if (toolCalls.length === 1) {
    const result = await executor(toolCalls[0])
    return new Map([[toolCalls[0].id, result]])
  }

  const groups = groupByHost(toolCalls)
  const resultMap = new Map<string, ToolResult>()

  await Promise.all(
    groups.map(async (group) => {
      const results = await executeGroupSequentially(group, executor, signal)
      for (const result of results) {
        if (result) resultMap.set(result.toolCallId, result)
      }
    })
  )

  return resultMap
}
