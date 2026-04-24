export type AgentMode = 'primary' | 'subagent' | 'hidden'
export type PermissionRuleAction = 'allow' | 'deny' | 'ask'
export type PermissionRuleScope = 'once' | 'always'
export type PermissionRejectBehavior = 'throw' | 'reject_with_feedback'

export interface PermissionRule {
  /** Tool name pattern (exact match or '*' for all) */
  tool: string
  /** @deprecated Use action for new rulesets. Kept for legacy compatibility. */
  allowed?: boolean
  /** Permission decision for this tool/pattern. Defaults to legacy allowed semantics. */
  action?: PermissionRuleAction
  /** Whether an allow decision is one-shot or can be persisted by callers. */
  scope?: PermissionRuleScope
  /** How denial should be surfaced to the model/runtime. */
  rejectBehavior?: PermissionRejectBehavior
  /** Optional feedback returned when rejectBehavior is reject_with_feedback. */
  rejectFeedback?: string
  /** Optional max risk level that this agent can auto-approve ('low'|'medium'|'high'|'critical') */
  maxAutoApproveRisk?: 'low' | 'medium' | 'high' | 'critical'
}

export interface AgentConfig {
  /** Unique agent identifier */
  name: string
  /** Human-readable description */
  description: string
  /** Agent mode: primary (user-facing), subagent (spawned by primary), hidden (internal like compaction) */
  mode: AgentMode
  /** System prompt override (if empty, uses default from ai.ts) */
  systemPrompt?: string
  /** Allowed tool names. If empty, all tools are allowed */
  allowedTools: string[]
  /** Permission rules for fine-grained control */
  permissions: PermissionRule[]
  /** Max agent turns override */
  maxSteps?: number
  /** Temperature override */
  temperature?: number
}

const EXPLORE_SYSTEM_PROMPT = `你是 OpenTerm 探索代理，一个只读的远程主机调查助手。

你的目标是快速收集信息并汇报，不进行任何修改操作。

### 工作流程：
1. **理解任务**：分析主代理委派的调查目标。
2. **收集信息**：使用只读命令（如 ls, cat, status, ps, netstat 等）获取所需信息。
3. **整理汇报**：将发现整理为清晰、结构化的报告返回给主代理。

### 规则：
- **始终使用中文回复**。
- **禁止修改操作**：不要执行任何会改变系统状态的命令（如 install, rm, write, restart 等）。
- **简洁高效**：只收集与任务相关的信息，避免不必要的探索。
- **证据优先**：所有结论必须基于实际命令输出，不要推测。
- **最多 5 步**：在有限步数内完成调查，如需更深入探索，请在报告中说明。

---
[环境上下文随每轮自动注入]`

const VERIFY_SYSTEM_PROMPT = `你是 OpenTerm 验证代理，一个快速验证助手。

你的目标是验证特定操作的结果是否符合预期。

### 工作流程：
1. **理解验证目标**：分析主代理需要验证的内容。
2. **执行验证**：运行最少的只读命令来确认状态。
3. **报告结果**：明确说明验证通过或失败，附上证据。

### 规则：
- **始终使用中文回复**。
- **精准验证**：只验证被要求的内容，不做额外探索。
- **证据驱动**：验证结果必须附带具体命令输出作为证据。
- **最多 3 步**：用最少的步骤完成验证。
- **二值判定**：明确回答"验证通过"或"验证失败"，不要含糊其辞。

---
[环境上下文随每轮自动注入]`

const PLAN_SYSTEM_PROMPT = `你是 OpenTerm 规划代理，一个只读的任务拆解与风险评估助手。

你的目标是把用户目标转成可执行计划，而不是直接修改系统。

### 规则：
- **始终使用中文回复**。
- **只读优先**：可以读取文件、搜索上下文、执行低风险只读命令来理解现状。
- **禁止变更**：不要写文件、安装包、修改权限、启动/停止服务或执行破坏性命令。
- **输出计划**：说明目标、假设、步骤、风险、验证方式和建议的 PR/提交拆分。
- **遇到不确定**：明确列出需要用户确认的点，不要擅自推进高风险操作。

---
[环境上下文随每轮自动注入]`

const SUMMARY_SYSTEM_PROMPT = `你是 OpenTerm 摘要代理。请把输入内容压缩为结构清晰、事实准确、便于后续继续工作的中文摘要。`

const TITLE_SYSTEM_PROMPT = `你是 OpenTerm 标题代理。请为当前话题生成一个简短、具体、中文优先的标题，不要输出解释。`

const QUESTION_SYSTEM_PROMPT = `你是 OpenTerm 提问代理。请把需要用户决策的点整理成一个清晰问题，并给出 2-3 个互斥选项。`

export const BUILT_IN_AGENTS: Record<string, AgentConfig> = {
  build: {
    name: 'build',
    description: 'Primary agent for executing multi-step tasks on remote hosts',
    mode: 'primary',
    allowedTools: [], // All tools allowed
    permissions: [{ tool: '*', allowed: true }],
    maxSteps: 10,
    temperature: 0.1
  },
  explore: {
    name: 'explore',
    description: 'Read-only agent for investigating host state without making changes',
    mode: 'subagent',
    systemPrompt: EXPLORE_SYSTEM_PROMPT,
    allowedTools: [
      'execute_command',
      'read_file',
      'lsp',
      'list_hosts',
      'list_terminals',
      'search_memory',
      'search_topics'
    ],
    permissions: [
      { tool: 'execute_command', allowed: true, maxAutoApproveRisk: 'low' },
      { tool: 'read_file', allowed: true },
      { tool: 'lsp', allowed: true },
      { tool: 'list_hosts', allowed: true },
      { tool: 'list_terminals', allowed: true },
      { tool: 'search_memory', allowed: true },
      { tool: 'search_topics', allowed: true }
    ],
    maxSteps: 5,
    temperature: 0.3
  },
  verify: {
    name: 'verify',
    description: 'Verification agent that checks command results and validates state',
    mode: 'subagent',
    systemPrompt: VERIFY_SYSTEM_PROMPT,
    allowedTools: ['execute_command', 'read_file', 'lsp', 'list_hosts', 'list_terminals'],
    permissions: [
      { tool: 'execute_command', allowed: true, maxAutoApproveRisk: 'low' },
      { tool: 'read_file', allowed: true },
      { tool: 'lsp', allowed: true },
      { tool: 'list_hosts', allowed: true },
      { tool: 'list_terminals', allowed: true }
    ],
    maxSteps: 3,
    temperature: 0
  },
  plan: {
    name: 'plan',
    description: 'Read-only planning agent that decomposes tasks before execution',
    mode: 'subagent',
    systemPrompt: PLAN_SYSTEM_PROMPT,
    allowedTools: [
      'execute_command',
      'read_file',
      'lsp',
      'grep',
      'glob',
      'ls',
      'list_hosts',
      'list_terminals',
      'search_memory',
      'search_topics'
    ],
    permissions: [
      {
        tool: 'execute_command',
        allowed: true,
        maxAutoApproveRisk: 'low',
        rejectBehavior: 'reject_with_feedback',
        rejectFeedback:
          'plan agent 是只读规划模式：请改用只读检查命令，或停止并请求 build agent 执行变更。'
      },
      { tool: 'read_file', allowed: true },
      { tool: 'lsp', allowed: true },
      { tool: 'grep', allowed: true },
      { tool: 'glob', allowed: true },
      { tool: 'ls', allowed: true },
      { tool: 'list_hosts', allowed: true },
      { tool: 'list_terminals', allowed: true },
      { tool: 'search_memory', allowed: true },
      { tool: 'search_topics', allowed: true }
    ],
    maxSteps: 5,
    temperature: 0.1
  },
  compaction: {
    name: 'compaction',
    description: 'Hidden agent for summarizing old context during compaction',
    mode: 'hidden',
    allowedTools: [],
    permissions: [{ tool: '*', allowed: false }],
    maxSteps: 1,
    temperature: 0
  },
  summary: {
    name: 'summary',
    description: 'Hidden agent for concise summaries',
    mode: 'hidden',
    systemPrompt: SUMMARY_SYSTEM_PROMPT,
    allowedTools: [],
    permissions: [{ tool: '*', allowed: false }],
    maxSteps: 1,
    temperature: 0
  },
  title: {
    name: 'title',
    description: 'Hidden agent for topic titles',
    mode: 'hidden',
    systemPrompt: TITLE_SYSTEM_PROMPT,
    allowedTools: [],
    permissions: [{ tool: '*', allowed: false }],
    maxSteps: 1,
    temperature: 0
  },
  question: {
    name: 'question',
    description: 'Hidden agent for user-facing decision questions',
    mode: 'hidden',
    systemPrompt: QUESTION_SYSTEM_PROMPT,
    allowedTools: [],
    permissions: [{ tool: '*', allowed: false }],
    maxSteps: 1,
    temperature: 0
  }
}

export function getAgentConfig(name: string): AgentConfig {
  return BUILT_IN_AGENTS[name] ?? BUILT_IN_AGENTS.build
}
