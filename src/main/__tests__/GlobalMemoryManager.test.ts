import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentRun, GlobalMemoryData, Task } from '../../shared/types'

const mocks = vi.hoisted(() => {
  const completionCreate = vi.fn()
  return {
    completionCreate,
    getAIClient: vi.fn(() => ({
      chat: {
        completions: {
          create: completionCreate
        }
      }
    })),
    getCurrentModel: vi.fn(() => 'mock-model'),
    globalMemoryDB: {
      getMemory: vi.fn(),
      saveMemory: vi.fn(),
      clearMemory: vi.fn()
    },
    taskDB: {
      getTaskById: vi.fn()
    },
    taskStepDB: {
      getTaskSteps: vi.fn()
    },
    agentRunStore: {
      getRunsByTask: vi.fn()
    }
  }
})

vi.mock('../ai', () => ({
  getAIClient: mocks.getAIClient,
  getCurrentModel: mocks.getCurrentModel
}))

vi.mock('../db', () => ({
  globalMemoryDB: mocks.globalMemoryDB,
  taskDB: mocks.taskDB,
  taskStepDB: mocks.taskStepDB
}))

vi.mock('../agent/agent-run-store', () => ({
  agentRunStore: mocks.agentRunStore
}))

import { applyGlobalMemoryUpdate, GlobalMemoryManager } from '../GlobalMemoryManager'

function emptyMemory(now = 1_700_000_000_000): GlobalMemoryData {
  return {
    version: '1.0',
    lastUpdated: now,
    user: {
      workContext: { summary: '' },
      personalContext: { summary: '' },
      topOfMind: { summary: '' }
    },
    history: {
      recentMonths: { summary: '' },
      earlierContext: { summary: '' },
      longTermBackground: { summary: '' }
    },
    facts: []
  }
}

function completedTask(): Task {
  return {
    id: 'task-1',
    topicId: 'topic-1',
    title: 'Upgrade runtime',
    goal: 'Add global memory provenance',
    status: 'completed',
    createdAt: 1,
    updatedAt: 2
  }
}

function agentRun(status: AgentRun['status']): AgentRun {
  return {
    id: `run-${status}`,
    topicId: 'topic-1',
    taskId: 'task-1',
    agentName: 'build',
    mode: 'primary',
    status,
    goal: 'Add global memory provenance',
    createdAt: 1,
    updatedAt: 2,
    ...(status === 'completed' ? { completedAt: 3 } : {})
  }
}

describe('GlobalMemoryManager provenance', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    mocks.globalMemoryDB.getMemory.mockReturnValue(emptyMemory())
    mocks.taskDB.getTaskById.mockReturnValue(completedTask())
    mocks.taskStepDB.getTaskSteps.mockReturnValue([])
    mocks.agentRunStore.getRunsByTask.mockReturnValue([])
  })

  it('records task/run provenance and refreshes updatedAt for repeated facts', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-24T00:00:00Z'))

    const current = emptyMemory()
    current.facts.push({
      id: 'fact_1',
      content: 'OpenTerm is an Electron app.',
      category: 'knowledge',
      confidence: 0.7,
      createdAt: 100,
      updatedAt: 100,
      source: 'manual'
    })

    const updated = applyGlobalMemoryUpdate(
      current,
      {
        newFacts: [
          {
            content: 'OpenTerm is an Electron app.',
            category: 'knowledge',
            confidence: 0.9
          }
        ]
      },
      { source: 'task:task-1', sourceTaskId: 'task-1', sourceRunId: 'run-1' }
    )

    expect(updated.facts).toHaveLength(1)
    expect(updated.facts[0]).toMatchObject({
      id: 'fact_1',
      confidence: 0.9,
      source: 'task:task-1',
      sourceTaskId: 'task-1',
      sourceRunId: 'run-1',
      updatedAt: Date.parse('2026-04-24T00:00:00Z')
    })
  })

  it('does not write global memory when task runs exist but none completed', async () => {
    mocks.agentRunStore.getRunsByTask.mockReturnValue([agentRun('failed')])

    await GlobalMemoryManager.updateFromCompletedTask('task-1')

    expect(mocks.getAIClient).not.toHaveBeenCalled()
    expect(mocks.globalMemoryDB.saveMemory).not.toHaveBeenCalled()
  })

  it('tags model-generated facts with the completed source run', async () => {
    mocks.agentRunStore.getRunsByTask.mockReturnValue([agentRun('failed'), agentRun('completed')])
    mocks.completionCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              newFacts: [
                {
                  content: '用户希望 OpenTerm runtime 升级保持小 PR。',
                  category: 'preference',
                  confidence: 0.9
                }
              ]
            })
          }
        }
      ]
    })

    await GlobalMemoryManager.updateFromCompletedTask('task-1')

    expect(mocks.globalMemoryDB.saveMemory).toHaveBeenCalledOnce()
    const saved = mocks.globalMemoryDB.saveMemory.mock.calls[0][0] as GlobalMemoryData
    expect(saved.facts[0]).toMatchObject({
      source: 'task:task-1',
      sourceTaskId: 'task-1',
      sourceRunId: 'run-completed'
    })
  })
})
