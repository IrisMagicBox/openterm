import type {
  GlobalMemoryData,
  GlobalMemoryFact,
  GlobalMemoryFactCategory,
  AgentRun,
  Task,
  TaskStep
} from '../shared/types'
import { v4 as uuidv4 } from 'uuid'
import { getAIClient, getCurrentModel } from './ai'
import { globalMemoryDB, taskDB, taskStepDB } from './db'
import { getErrorMessage } from '../shared/errors'
import { logger } from './logger'
import { agentRunStore } from './agent/agent-run-store'

const GLOBAL_MEMORY_MAX_FACTS = 100
const GLOBAL_MEMORY_FACT_CONFIDENCE_THRESHOLD = 0.7
const GLOBAL_MEMORY_INJECTION_FACT_LIMIT = 20
const GLOBAL_MEMORY_INJECTION_MAX_CHARS = 6000
const GLOBAL_MEMORY_UPDATE_STEPS_LIMIT = 24
const GLOBAL_MEMORY_STEP_CONTENT_MAX = 1200

const USER_SECTIONS = ['workContext', 'personalContext', 'topOfMind'] as const
const HISTORY_SECTIONS = ['recentMonths', 'earlierContext', 'longTermBackground'] as const
const FACT_CATEGORIES = new Set<GlobalMemoryFactCategory>([
  'preference',
  'knowledge',
  'context',
  'behavior',
  'goal',
  'correction'
])

export interface GlobalMemoryUpdateProvenance {
  source: string
  sourceTaskId?: string
  sourceRunId?: string
}

const GLOBAL_MEMORY_UPDATE_SYSTEM_PROMPT = `你是 OpenTerm 的长期记忆管理系统。你的任务是根据已完成的任务，更新跨会话的全局用户画像与经验记忆。

你必须只输出 JSON，不要输出 Markdown 或解释。

记忆结构说明：
- user.workContext：用户当前工作、项目、技术栈与基础设施上下文，保持 1-3 句。
- user.personalContext：语言、沟通偏好、稳定兴趣，保持 1-2 句。
- user.topOfMind：近期正在关注的多个主题，保持 3-5 句，及时替换已完成或过期事项。
- history.recentMonths：最近一段时间的活动与技术探索，保持 4-6 句。
- history.earlierContext：较早但仍有价值的模式和背景，保持 3-5 句。
- history.longTermBackground：长期稳定背景与工作方式，保持 2-4 句。
- facts：具体、可复用、高置信度的事实。

事实分类：
- preference：用户偏好的工具、表达方式、工作方式。
- knowledge：用户已掌握或经常处理的技术/领域。
- context：稳定背景、项目、环境、组织信息。
- behavior：重复出现的行为模式或协作方式。
- goal：长期目标、当前目标、项目愿景。
- correction：用户明确纠正过的误解，或 Agent 出错后的正确做法。

重要规则：
- 只记录对未来会话有帮助的信息。
- 不要记录一次性的命令输出、临时文件路径、短期任务进度、会过期的端口/PID。
- 不要记录密钥、token、密码、私有证书内容。
- 主机事实如果只是当前 topic 内临时发现，优先不要写入全局画像；只有跨会话可复用时才写入。
- 新 facts 的 confidence 必须体现把握程度：明确陈述 0.9+，强暗示 0.7-0.8，模糊推断不要写。
- facts 的来源 task/run 会由系统自动记录；不要为了来源追踪把 Task ID 或 Run ID 写进 fact 内容。
- 如果新信息推翻旧事实，把旧 fact id 放到 factsToRemove。

输出 JSON 格式：
{
  "user": {
    "workContext": { "summary": "...", "shouldUpdate": true },
    "personalContext": { "summary": "...", "shouldUpdate": false },
    "topOfMind": { "summary": "...", "shouldUpdate": true }
  },
  "history": {
    "recentMonths": { "summary": "...", "shouldUpdate": true },
    "earlierContext": { "summary": "...", "shouldUpdate": false },
    "longTermBackground": { "summary": "...", "shouldUpdate": false }
  },
  "newFacts": [
    { "content": "...", "category": "preference|knowledge|context|behavior|goal|correction", "confidence": 0.0 }
  ],
  "factsToRemove": ["fact_id"]
}`

export class GlobalMemoryManager {
  static getMemory(): GlobalMemoryData {
    return globalMemoryDB.getMemory()
  }

  static clearMemory(): GlobalMemoryData {
    return globalMemoryDB.clearMemory()
  }

  static formatForPrompt(query = ''): string {
    return formatGlobalMemoryForInjection(globalMemoryDB.getMemory(), query)
  }

  static async updateFromCompletedTask(taskId: string): Promise<void> {
    const task = taskDB.getTaskById(taskId)
    if (!task || task.status !== 'completed') return

    const sourceRun = getCompletedMemorySourceRun(taskId)
    if (sourceRun === null) {
      logger.info('GlobalMemoryManager', `跳过任务 ${taskId} 的全局记忆更新：没有 completed run`)
      return
    }

    const steps = taskStepDB.getTaskSteps(taskId)
    const currentMemory = globalMemoryDB.getMemory()
    const userPrompt = buildUpdatePrompt(currentMemory, task, steps, sourceRun)

    try {
      const aiClient = getAIClient({ topicId: task.topicId })
      const model = getCurrentModel({ topicId: task.topicId })

      const response = await aiClient.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: GLOBAL_MEMORY_UPDATE_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ]
      })

      const raw = response.choices[0]?.message?.content || '{}'
      const updateData = JSON.parse(extractJsonObject(raw))
      const updatedMemory = applyGlobalMemoryUpdate(currentMemory, updateData, {
        source: `task:${task.id}`,
        sourceTaskId: task.id,
        sourceRunId: sourceRun?.id
      })

      globalMemoryDB.saveMemory(updatedMemory)
      logger.info('GlobalMemoryManager', `全局记忆已根据任务 ${taskId} 更新`)
    } catch (err: unknown) {
      logger.error('GlobalMemoryManager', '全局记忆更新失败', {
        taskId,
        message: getErrorMessage(err)
      })
    }
  }
}

export function formatGlobalMemoryForInjection(
  memory: GlobalMemoryData,
  query = '',
  maxChars = GLOBAL_MEMORY_INJECTION_MAX_CHARS
): string {
  const sections: string[] = []
  const userLines: string[] = []
  const historyLines: string[] = []

  if (memory.user.workContext.summary) userLines.push(`- Work: ${memory.user.workContext.summary}`)
  if (memory.user.personalContext.summary) {
    userLines.push(`- Personal: ${memory.user.personalContext.summary}`)
  }
  if (memory.user.topOfMind.summary) {
    userLines.push(`- Current Focus: ${memory.user.topOfMind.summary}`)
  }
  if (userLines.length > 0) sections.push(`User Context:\n${userLines.join('\n')}`)

  if (memory.history.recentMonths.summary) {
    historyLines.push(`- Recent: ${memory.history.recentMonths.summary}`)
  }
  if (memory.history.earlierContext.summary) {
    historyLines.push(`- Earlier: ${memory.history.earlierContext.summary}`)
  }
  if (memory.history.longTermBackground.summary) {
    historyLines.push(`- Background: ${memory.history.longTermBackground.summary}`)
  }
  if (historyLines.length > 0) sections.push(`History:\n${historyLines.join('\n')}`)

  const factLines = rankFacts(memory.facts, query)
    .slice(0, GLOBAL_MEMORY_INJECTION_FACT_LIMIT)
    .map((fact) => {
      const prefix = `- [${fact.category} | ${fact.confidence.toFixed(2)}] ${fact.content}`
      return fact.category === 'correction' && fact.sourceError
        ? `${prefix} (avoid: ${fact.sourceError})`
        : prefix
    })

  if (factLines.length > 0) sections.push(`Facts:\n${factLines.join('\n')}`)
  if (sections.length === 0) return ''

  const content = `<global_memory>\n${sections.join('\n\n')}\n</global_memory>`
  return content.length > maxChars ? `${content.slice(0, maxChars)}\n...[truncated]` : content
}

export function applyGlobalMemoryUpdate(
  currentMemory: GlobalMemoryData,
  updateData: unknown,
  provenanceInput: string | GlobalMemoryUpdateProvenance
): GlobalMemoryData {
  const update = asRecord(updateData)
  const provenance = normalizeProvenance(provenanceInput)
  const now = Date.now()
  const next: GlobalMemoryData = {
    version: '1.0',
    lastUpdated: currentMemory.lastUpdated,
    user: {
      workContext: { ...currentMemory.user.workContext },
      personalContext: { ...currentMemory.user.personalContext },
      topOfMind: { ...currentMemory.user.topOfMind }
    },
    history: {
      recentMonths: { ...currentMemory.history.recentMonths },
      earlierContext: { ...currentMemory.history.earlierContext },
      longTermBackground: { ...currentMemory.history.longTermBackground }
    },
    facts: currentMemory.facts.map((fact) => ({
      ...fact,
      updatedAt: fact.updatedAt ?? fact.createdAt ?? now
    }))
  }

  const userUpdate = asRecord(update.user)
  for (const section of USER_SECTIONS) {
    const sectionUpdate = asRecord(userUpdate[section])
    if (sectionUpdate.shouldUpdate === true && typeof sectionUpdate.summary === 'string') {
      const summary = sectionUpdate.summary.trim()
      if (summary) next.user[section] = { summary, updatedAt: now }
    }
  }

  const historyUpdate = asRecord(update.history)
  for (const section of HISTORY_SECTIONS) {
    const sectionUpdate = asRecord(historyUpdate[section])
    if (sectionUpdate.shouldUpdate === true && typeof sectionUpdate.summary === 'string') {
      const summary = sectionUpdate.summary.trim()
      if (summary) next.history[section] = { summary, updatedAt: now }
    }
  }

  const factsToRemove = Array.isArray(update.factsToRemove)
    ? new Set(update.factsToRemove.filter((id): id is string => typeof id === 'string'))
    : new Set<string>()
  if (factsToRemove.size > 0) {
    next.facts = next.facts.filter((fact) => !factsToRemove.has(fact.id))
  }

  const newFacts = Array.isArray(update.newFacts) ? update.newFacts : []
  for (const item of newFacts) {
    const fact = asRecord(item)
    const content = typeof fact.content === 'string' ? fact.content.trim() : ''
    const confidence = clampConfidence(fact.confidence ?? 0.5)
    if (!content || confidence < GLOBAL_MEMORY_FACT_CONFIDENCE_THRESHOLD) continue

    const key = factContentKey(content)
    const sourceError =
      typeof fact.sourceError === 'string' && fact.sourceError.trim()
        ? fact.sourceError.trim()
        : undefined

    const existingIndex = next.facts.findIndex(
      (existingFact) => factContentKey(existingFact.content) === key
    )
    if (existingIndex !== -1) {
      const existing = next.facts[existingIndex]
      next.facts[existingIndex] = {
        ...existing,
        confidence: Math.max(existing.confidence, confidence),
        updatedAt: now,
        source: provenance.source,
        sourceTaskId: provenance.sourceTaskId ?? existing.sourceTaskId,
        sourceRunId: provenance.sourceRunId ?? existing.sourceRunId,
        sourceError: sourceError ?? existing.sourceError
      }
      continue
    }

    next.facts.push({
      id: `fact_${uuidv4().replace(/-/g, '').slice(0, 8)}`,
      content,
      category: normalizeCategory(fact.category),
      confidence,
      createdAt: now,
      updatedAt: now,
      source: provenance.source,
      sourceTaskId: provenance.sourceTaskId,
      sourceRunId: provenance.sourceRunId,
      sourceError
    })
  }

  if (next.facts.length > GLOBAL_MEMORY_MAX_FACTS) {
    next.facts = [...next.facts]
      .sort((a, b) => b.confidence - a.confidence || b.updatedAt - a.updatedAt)
      .slice(0, GLOBAL_MEMORY_MAX_FACTS)
  }

  return next
}

function buildUpdatePrompt(
  memory: GlobalMemoryData,
  task: Task,
  steps: TaskStep[],
  sourceRun?: AgentRun
): string {
  const stepSummary = steps
    .slice(-GLOBAL_MEMORY_UPDATE_STEPS_LIMIT)
    .map((step) => {
      const title = step.title ? `${step.title}: ` : ''
      const host = step.hostId ? ` host=${step.hostId}` : ''
      const content = step.content.replace(/\s+/g, ' ').slice(0, GLOBAL_MEMORY_STEP_CONTENT_MAX)
      return `- [${step.type}/${step.status}${host}] ${title}${content}`
    })
    .join('\n')

  return `当前全局记忆：
<current_memory>
${JSON.stringify(memory, null, 2)}
</current_memory>

已完成任务：
<completed_task>
目标: ${task.goal}
结果摘要: ${task.summary || '无'}
Topic ID: ${task.topicId}
Task ID: ${task.id}
Run ID: ${sourceRun?.id ?? 'legacy/no-agent-run'}
Run 状态: ${sourceRun?.status ?? 'legacy'}
近期步骤:
${stepSummary || '无'}
</completed_task>

请基于这个任务更新全局长期记忆。`
}

function getCompletedMemorySourceRun(taskId: string): AgentRun | undefined | null {
  const runs = agentRunStore.getRunsByTask(taskId)
  if (runs.length === 0) return undefined

  const completedRuns = runs
    .filter((run) => run.status === 'completed')
    .sort(
      (a, b) =>
        (b.completedAt ?? b.updatedAt ?? b.createdAt) -
        (a.completedAt ?? a.updatedAt ?? a.createdAt)
    )

  return completedRuns[0] ?? null
}

function normalizeProvenance(
  provenance: string | GlobalMemoryUpdateProvenance
): GlobalMemoryUpdateProvenance {
  if (typeof provenance === 'string') return { source: provenance }
  return {
    source: provenance.source.trim() || 'unknown',
    sourceTaskId: provenance.sourceTaskId?.trim() || undefined,
    sourceRunId: provenance.sourceRunId?.trim() || undefined
  }
}

function extractJsonObject(raw: string): string {
  let text = raw.trim()
  if (text.startsWith('```')) {
    text = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()
  }

  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) {
    return text.slice(first, last + 1)
  }

  return text
}

function rankFacts(facts: GlobalMemoryFact[], query: string): GlobalMemoryFact[] {
  const queryTerms = tokenize(query)
  return [...facts]
    .filter((fact) => fact.content.trim())
    .sort((a, b) => scoreFact(b, queryTerms) - scoreFact(a, queryTerms))
}

function scoreFact(fact: GlobalMemoryFact, queryTerms: Set<string>): number {
  const contentTerms = tokenize(fact.content)
  let overlap = 0
  for (const term of queryTerms) {
    if (contentTerms.has(term)) overlap += 1
  }

  const categoryBoost =
    fact.category === 'correction' ? 0.4 : fact.category === 'preference' ? 0.25 : 0
  return overlap * 2 + fact.confidence + categoryBoost + Math.min(0.2, fact.updatedAt / 10 ** 15)
}

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[\s,.;:!?()[\]{}"'`，。！？、；：（）【】《》]+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= 2)
  )
}

function normalizeCategory(value: unknown): GlobalMemoryFactCategory {
  if (typeof value === 'string' && FACT_CATEGORIES.has(value as GlobalMemoryFactCategory)) {
    return value as GlobalMemoryFactCategory
  }
  return 'context'
}

function factContentKey(content: string): string {
  return content.trim().toLowerCase()
}

function clampConfidence(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return 0.5
  return Math.max(0, Math.min(1, parsed))
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}
