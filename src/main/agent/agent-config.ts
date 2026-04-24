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
      'list_hosts',
      'list_terminals',
      'search_memory',
      'search_topics'
    ],
    permissions: [
      { tool: 'execute_command', allowed: true, maxAutoApproveRisk: 'low' },
      { tool: 'read_file', allowed: true },
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
    allowedTools: ['execute_command', 'read_file', 'list_hosts', 'list_terminals'],
    permissions: [
      { tool: 'execute_command', allowed: true, maxAutoApproveRisk: 'low' },
      { tool: 'read_file', allowed: true },
      { tool: 'list_hosts', allowed: true },
      { tool: 'list_terminals', allowed: true }
    ],
    maxSteps: 3,
    temperature: 0
  },
  compaction: {
    name: 'compaction',
    description: 'Hidden agent for summarizing old context during compaction',
    mode: 'hidden',
    allowedTools: [],
    permissions: [{ tool: '*', allowed: false }],
    maxSteps: 1,
    temperature: 0
  }
}

export function getAgentConfig(name: string): AgentConfig {
  return BUILT_IN_AGENTS[name] ?? BUILT_IN_AGENTS.build
}
