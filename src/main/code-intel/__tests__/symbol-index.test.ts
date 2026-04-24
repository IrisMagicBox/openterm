import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { collectWorkspaceSymbols, findDefinitions, findReferences } from '../symbol-index'

let rootPath = ''

beforeEach(() => {
  rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'openterm-code-intel-'))
  fs.mkdirSync(path.join(rootPath, 'src'))
  fs.writeFileSync(
    path.join(rootPath, 'src', 'sample.ts'),
    [
      'export interface AgentRuntimePlan {',
      '  name: string',
      '}',
      'export class AgentRuntime {',
      '  run(): void {}',
      '}',
      'export function buildPlan(): AgentRuntimePlan {',
      '  return { name: "plan" }',
      '}',
      'const helper = () => buildPlan()'
    ].join('\n')
  )
})

afterEach(() => {
  fs.rmSync(rootPath, { recursive: true, force: true })
})

describe('symbol-index', () => {
  it('collects workspace symbols with file locations', () => {
    const symbols = collectWorkspaceSymbols({ rootPath, query: 'agentruntime' })

    expect(symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'AgentRuntimePlan', kind: 'interface', line: 1 }),
        expect.objectContaining({ name: 'AgentRuntime', kind: 'class', line: 4 })
      ])
    )
  })

  it('finds definitions and references without requiring an LSP server', () => {
    expect(findDefinitions({ rootPath, query: 'buildPlan' })).toEqual([
      expect.objectContaining({ name: 'buildPlan', line: 7 })
    ])

    const references = findReferences({ rootPath, query: 'buildPlan' })
    expect(references.map((ref) => ref.line)).toEqual([7, 10])
  })
})
