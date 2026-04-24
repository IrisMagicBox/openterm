import { z } from 'zod'
import { define, Tool } from './tool-factory'
import {
  collectWorkspaceSymbols,
  findDefinitions,
  findReferences,
  type CodeIntelAction
} from '../code-intel/symbol-index'

const parameters = z.object({
  action: z
    .enum(['symbols', 'definition', 'references', 'diagnostics'])
    .default('symbols')
    .describe('只读代码智能动作。当前本地降级实现支持 symbols/definition/references。'),
  rootPath: z.string().describe('本地项目根目录或文件路径。暂不支持远程主机 LSP。'),
  query: z.string().optional().describe('symbol 名称或引用文本。definition/references 必填。'),
  maxResults: z.number().min(1).max(200).default(80).describe('最大结果数。')
})

export default define('lsp', {
  description:
    '只读本地代码智能工具。当前使用轻量索引降级支持 symbols、definition、references；diagnostics 在没有 LSP server 时返回 degraded，不会阻塞任务。',
  parameters,
  async execute(args: z.infer<typeof parameters>): Promise<Tool.ExecuteResult> {
    const action = args.action as CodeIntelAction
    const input = {
      rootPath: args.rootPath,
      query: args.query,
      maxResults: args.maxResults
    }

    if (action === 'diagnostics') {
      return {
        output: JSON.stringify(
          {
            action,
            degraded: true,
            diagnostics: [],
            message:
              'No local LSP server is running yet. Diagnostics are unavailable, but this does not block the agent task.'
          },
          null,
          2
        ),
        metadata: { action, degraded: true, resultCount: 0 }
      }
    }

    const results =
      action === 'references'
        ? findReferences(input)
        : action === 'definition'
          ? findDefinitions(input)
          : collectWorkspaceSymbols(input)

    return {
      output: JSON.stringify({ action, degraded: false, results }, null, 2),
      metadata: { action, degraded: false, resultCount: results.length }
    }
  }
})
