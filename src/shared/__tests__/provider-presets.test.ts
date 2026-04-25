import { describe, expect, it } from 'vitest'
import {
  SYSTEM_MODELS,
  getModelApiId,
  getSystemModels,
  inferModelCapabilities,
  inferModelRuntimeCapabilities
} from '../provider-presets'

describe('provider presets', () => {
  it('keeps preset model ids provider-scoped while preserving API model ids', () => {
    const openaiModel = getSystemModels('openai').find(
      (model) => model.providerModelId === 'gpt-4o'
    )
    const openrouterModel = getSystemModels('openrouter').find(
      (model) => model.providerModelId === 'openai/gpt-4o-mini'
    )

    expect(openaiModel?.id).toBe('openai:gpt-4o')
    expect(getModelApiId(openaiModel!)).toBe('gpt-4o')
    expect(openrouterModel?.id).toBe('openrouter:openai/gpt-4o-mini')
    expect(getModelApiId(openrouterModel!)).toBe('openai/gpt-4o-mini')
  })

  it('does not ship duplicate internal model ids', () => {
    const ids = SYSTEM_MODELS.map((model) => model.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('does not ship preset models for CoresHub', () => {
    expect(getSystemModels('coreshub')).toEqual([])
  })

  it('infers agent-relevant capabilities from common model names', () => {
    expect(inferModelCapabilities('text-embedding-3-large')).toEqual(['embedding'])
    expect(inferModelCapabilities('jina-reranker-v2-base-multilingual')).toEqual(['rerank'])
    expect(inferModelCapabilities('claude-sonnet-4-20250514')).toContain('tool-use')
    expect(inferModelCapabilities('o3')).toContain('reasoning')
  })

  it('infers structured runtime capabilities for provider adapters', () => {
    const gpt5 = inferModelRuntimeCapabilities('gpt-5.2', 'openai')
    expect(gpt5).toMatchObject({
      toolCalling: true,
      reasoning: true,
      temperature: false,
      contextWindow: 200_000
    })
    expect(inferModelRuntimeCapabilities('openai/gpt-5.2', 'openrouter').temperature).toBe(false)

    const embedding = inferModelRuntimeCapabilities('text-embedding-3-large', 'openai')
    expect(embedding.toolCalling).toBe(false)
    expect(embedding.streaming).toBe(false)

    const claude = inferModelRuntimeCapabilities('claude-sonnet-4-20250514', 'anthropic')
    expect(claude.promptCaching).toBe(true)
    expect(claude.parallelToolCalls).toBe(false)
  })
})
