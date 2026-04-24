import { describe, it, expect, beforeEach } from 'vitest'
import { getAgentConfig, BUILT_IN_AGENTS } from '../agent-config'
import { ToolRegistry } from '../../tools/tool-registry'
import { define } from '../../tools/tool-factory'
import { z } from 'zod'

describe('agent-config', () => {
  describe('getAgentConfig', () => {
    it('returns build config for "build"', () => {
      const config = getAgentConfig('build')
      expect(config.name).toBe('build')
      expect(config.mode).toBe('primary')
      expect(config.allowedTools).toEqual([])
      expect(config.maxSteps).toBe(10)
      expect(config.temperature).toBe(0.1)
    })

    it('returns explore config for "explore"', () => {
      const config = getAgentConfig('explore')
      expect(config.name).toBe('explore')
      expect(config.mode).toBe('subagent')
      expect(config.allowedTools).toContain('execute_command')
      expect(config.allowedTools).toContain('read_file')
      expect(config.allowedTools).not.toContain('write_file')
      expect(config.allowedTools).not.toContain('manage_terminal')
      expect(config.maxSteps).toBe(5)
    })

    it('returns verify config for "verify"', () => {
      const config = getAgentConfig('verify')
      expect(config.name).toBe('verify')
      expect(config.mode).toBe('subagent')
      expect(config.allowedTools).toContain('execute_command')
      expect(config.allowedTools).toContain('read_file')
      expect(config.allowedTools).not.toContain('write_file')
      expect(config.maxSteps).toBe(3)
      expect(config.temperature).toBe(0)
    })

    it('falls back to build for unknown agent', () => {
      const config = getAgentConfig('nonexistent')
      expect(config.name).toBe('build')
      expect(config.mode).toBe('primary')
    })
  })

  describe('BUILT_IN_AGENTS', () => {
    it('contains primary, subagent, and hidden agents', () => {
      expect(Object.keys(BUILT_IN_AGENTS)).toEqual([
        'build',
        'explore',
        'verify',
        'plan',
        'compaction',
        'summary',
        'title',
        'question'
      ])
    })

    it('explore does not allow write_file or manage_terminal', () => {
      const config = BUILT_IN_AGENTS.explore
      expect(config.allowedTools).not.toContain('write_file')
      expect(config.allowedTools).not.toContain('manage_terminal')
    })

    it('verify has maxSteps=3', () => {
      expect(BUILT_IN_AGENTS.verify.maxSteps).toBe(3)
    })

    it('build has empty allowedTools (all tools)', () => {
      expect(BUILT_IN_AGENTS.build.allowedTools).toEqual([])
    })

    it('compaction is hidden and denies tools', () => {
      expect(BUILT_IN_AGENTS.compaction.mode).toBe('hidden')
      expect(BUILT_IN_AGENTS.compaction.permissions).toEqual([{ tool: '*', allowed: false }])
    })

    it('explore has permission rules with maxAutoApproveRisk', () => {
      const explore = BUILT_IN_AGENTS.explore
      const cmdRule = explore.permissions.find((p) => p.tool === 'execute_command')
      expect(cmdRule).toBeDefined()
      expect(cmdRule?.maxAutoApproveRisk).toBe('low')
    })

    it('verify has permission rules with maxAutoApproveRisk', () => {
      const verify = BUILT_IN_AGENTS.verify
      const cmdRule = verify.permissions.find((p) => p.tool === 'execute_command')
      expect(cmdRule).toBeDefined()
      expect(cmdRule?.maxAutoApproveRisk).toBe('low')
    })

    it('plan is read-only and rejects write-like command approvals with feedback', () => {
      const plan = BUILT_IN_AGENTS.plan
      const cmdRule = plan.permissions.find((p) => p.tool === 'execute_command')

      expect(plan.mode).toBe('subagent')
      expect(plan.allowedTools).toContain('execute_command')
      expect(plan.allowedTools).toContain('read_file')
      expect(plan.allowedTools).toContain('lsp')
      expect(plan.allowedTools).not.toContain('write_file')
      expect(cmdRule).toMatchObject({
        maxAutoApproveRisk: 'low',
        rejectBehavior: 'reject_with_feedback'
      })
    })

    it('summary, title, and question are hidden no-tool agents', () => {
      for (const name of ['summary', 'title', 'question'] as const) {
        expect(BUILT_IN_AGENTS[name].mode).toBe('hidden')
        expect(BUILT_IN_AGENTS[name].allowedTools).toEqual([])
        expect(BUILT_IN_AGENTS[name].permissions).toEqual([{ tool: '*', allowed: false }])
      }
    })
  })
})

function makeMockTool(id: string): ReturnType<typeof define> {
  return define(id, {
    description: `Mock ${id}`,
    parameters: z.object({}),
    execute: async () => ({ output: `mock ${id}` })
  })
}

describe('ToolRegistry.getFilteredDefinitions', () => {
  let registry: ToolRegistry

  beforeEach(async () => {
    registry = new ToolRegistry()
    registry.register(makeMockTool('execute_command'))
    registry.register(makeMockTool('read_file'))
    registry.register(makeMockTool('lsp'))
    registry.register(makeMockTool('write_file'))
    registry.register(makeMockTool('list_hosts'))
    registry.register(makeMockTool('list_terminals'))
    registry.register(makeMockTool('manage_terminal'))
    registry.register(makeMockTool('manage_host'))
    registry.register(makeMockTool('search_memory'))
    registry.register(makeMockTool('search_topics'))
    await registry.initializeTools()
  })

  it('returns all tools for build agent (empty allowedTools)', () => {
    const allDefinitions = registry.getDefinitions()
    const filteredDefinitions = registry.getFilteredDefinitions('build')
    expect(filteredDefinitions).toHaveLength(allDefinitions.length)
  })

  it('returns only allowed tools for explore agent', async () => {
    const config = getAgentConfig('explore')
    const filteredDefinitions = registry.getFilteredDefinitions('explore')
    const toolNames = filteredDefinitions.map((d) => d.function.name)
    expect(toolNames).toEqual(expect.arrayContaining(config.allowedTools))
    expect(toolNames).not.toContain('write_file')
    expect(toolNames).not.toContain('manage_terminal')
    expect(toolNames).toHaveLength(config.allowedTools.length)
  })

  it('returns only allowed tools for verify agent', async () => {
    const config = getAgentConfig('verify')
    const filteredDefinitions = registry.getFilteredDefinitions('verify')
    const toolNames = filteredDefinitions.map((d) => d.function.name)
    expect(toolNames).toEqual(config.allowedTools)
    expect(toolNames).toHaveLength(config.allowedTools.length)
  })
})
