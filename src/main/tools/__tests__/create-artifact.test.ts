import { describe, expect, it, vi } from 'vitest'
import type { Tool } from '../tool-factory'

const mocks = vi.hoisted(() => ({
  createArtifact: vi.fn()
}))

vi.mock('../../db', () => ({
  artifactDB: {
    createArtifact: mocks.createArtifact
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
})
