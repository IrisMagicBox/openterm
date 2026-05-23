import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const sourcePath = fileURLToPath(new URL('../ai.ts', import.meta.url))
const source = readFileSync(sourcePath, 'utf8')

describe('SYSTEM_PROMPT source', () => {
  it('guides the model to show useful process judgments around tool calls', () => {
    expect(source).toContain('可见工作过程')
    expect(source).toContain('让用户看到你如何基于证据推进任务')
    expect(source).toContain('取证目的、已观察到的事实')
    expect(source).toContain('当前判断、证据缺口或下一步决策')
    expect(source).not.toContain('正在做什么/学到了什么/下一步')
  })
})
