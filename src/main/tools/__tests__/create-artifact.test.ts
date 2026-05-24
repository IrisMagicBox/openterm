import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Tool } from '../tool-factory'

const mocks = vi.hoisted(() => ({
  createArtifact: vi.fn(),
  getParts: vi.fn()
}))

vi.mock('../../db', () => ({
  artifactDB: {
    createArtifact: mocks.createArtifact
  }
}))

vi.mock('../../agent/agent-run-store', () => ({
  agentRunStore: {
    getParts: mocks.getParts
  }
}))

import createArtifactTool from '../create-artifact'

function makeContext(): Tool.Context {
  return {
    topicId: 'topic-1',
    taskId: 'task-1',
    stepId: 'step-1',
    runId: 'run-1',
    partId: 'part-1',
    webContents: {} as never,
    agentService: {} as never,
    ensureSession: vi.fn(),
    requestAuthorization: vi.fn(),
    notifyStep: vi.fn(),
    metadata: vi.fn(),
    ask: vi.fn(),
    abort: new AbortController().signal,
    messages: [],
    agent: 'build',
    updatePartMetadata: vi.fn()
  }
}

describe('create_artifact tool', () => {
  beforeEach(() => {
    mocks.createArtifact.mockReset()
    mocks.getParts.mockReset()
  })

  it('creates an artifact bound to the active run context', async () => {
    mocks.createArtifact.mockReturnValueOnce({
      id: 'artifact-1',
      taskId: 'task-1',
      type: 'report',
      title: 'Investigation report',
      content: 'Findings',
      metadata: {
        runId: 'run-1',
        partId: 'part-1',
        stepId: 'step-1',
        agent: 'build'
      },
      createdAt: 1,
      updatedAt: 1
    })
    const ctx = makeContext()
    const tool = await createArtifactTool.init()

    const result = await tool.execute(
      {
        type: 'report',
        title: ' Investigation report ',
        content: 'Findings',
        metadata: { source: 'unit-test' }
      },
      ctx
    )

    expect(mocks.createArtifact).toHaveBeenCalledWith({
      taskId: 'task-1',
      type: 'report',
      title: 'Investigation report',
      content: 'Findings',
      metadata: {
        source: 'unit-test',
        runId: 'run-1',
        partId: 'part-1',
        stepId: 'step-1',
        agent: 'build'
      }
    })
    expect(ctx.updatePartMetadata).toHaveBeenCalledWith({
      artifactId: 'artifact-1',
      artifactType: 'report',
      artifactTitle: 'Investigation report',
      contentLength: 8
    })
    expect(JSON.parse(result.output)).toEqual({
      artifactId: 'artifact-1',
      taskId: 'task-1',
      type: 'report',
      title: 'Investigation report',
      contentLength: 8
    })
    expect(result.metadata).toMatchObject({
      artifactId: 'artifact-1',
      artifactType: 'report',
      artifactTitle: 'Investigation report',
      source: 'unit-test',
      runId: 'run-1',
      partId: 'part-1'
    })
  })

  it('can save the latest assistant output without repeating it in tool arguments', async () => {
    mocks.getParts.mockReturnValueOnce([
      {
        id: 'assistant-1',
        runId: 'run-1',
        type: 'text',
        role: 'assistant',
        status: 'completed',
        output: '# Full report\n\nFindings',
        orderIndex: 1,
        createdAt: 1,
        updatedAt: 1
      },
      {
        id: 'part-1',
        runId: 'run-1',
        type: 'tool',
        role: 'tool',
        toolName: 'create_artifact',
        toolCallId: 'call-1',
        status: 'running',
        orderIndex: 2,
        createdAt: 2,
        updatedAt: 2
      }
    ])
    mocks.createArtifact.mockReturnValueOnce({
      id: 'artifact-1',
      taskId: 'task-1',
      type: 'report',
      title: 'Investigation report',
      content: '# Full report\n\nFindings',
      metadata: {
        runId: 'run-1',
        partId: 'part-1',
        stepId: 'step-1',
        agent: 'build',
        source: 'latest_assistant_output'
      },
      createdAt: 1,
      updatedAt: 1
    })
    const ctx = makeContext()
    const tool = await createArtifactTool.init()

    const result = await tool.execute(
      {
        type: 'report',
        title: 'Investigation report',
        source: 'latest_assistant_output'
      },
      ctx
    )

    expect(mocks.createArtifact).toHaveBeenCalledWith({
      taskId: 'task-1',
      type: 'report',
      title: 'Investigation report',
      content: '# Full report\n\nFindings',
      metadata: {
        runId: 'run-1',
        partId: 'part-1',
        stepId: 'step-1',
        agent: 'build',
        source: 'latest_assistant_output'
      }
    })
    expect(JSON.parse(result.output)).toMatchObject({
      artifactId: 'artifact-1',
      contentLength: 23
    })
  })
})
