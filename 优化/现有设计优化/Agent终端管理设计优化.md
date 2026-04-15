# Draft: OpenTerm 现有架构深度总结

## 项目定位

- **openterm**: 终端管理 Agent
- 核心能力: 管理多个终端，下发命令、获取结果，根据用户自然语言执行下一步操作

## 场景梳理

### 场景1: 完全操作本机的多终端

- 终端1: 打开 a 目录，使用 terminal-assistant 探索
- 终端2: 打开 b 目录，使用 claude code 探索
- 终端3: 监测当前资源利用率

### 场景2: 多远程 host 操作

- 同一个 host 操作多个终端
- 不同终端干不同的事情
- 示例（推理场景）:
  - 终端1: 持续查看 nvidia-smi 监测
  - 终端2: 推理模型
  - 终端3: 本机 localhost 请求 chat 接口测试对话

## 研究发现

### OpenTerm 现有架构（来自代码库分析）

**已实现的强大基础：**

1. **多终端支持**：Agent 可通过 `manage_terminal` 工具创建/管理多终端
2. **会话持久化**：终端会话存储在 SQLite，包含完整 I/O 历史
3. **会话恢复**：`session-recovery.ts` 处理会话重连
4. **Agent 暂停/恢复**：用户可以暂停 Agent 会话并接管（Ctrl+C 透传）
5. **终端锁定**：Agent 执行期间防止用户干扰

**核心组件：**

- `CommandExecutor` (`/src/main/terminal.ts`): 中央终端管理，会话锁定机制
- `AgentService` (`/src/main/agent.ts`): 高级终端管理，会话注册表
- `AgentRunner` (`/src/main/AgentRunner.ts`): ReAct-Verify 模式，工具调用
- `session-scheduler.ts`: 并行执行调度

**技术栈：**

- Electron + React + TypeScript
- xterm.js (终端渲染)
- node-pty (本地 PTY)
- ssh2 (SSH 连接)
- better-sqlite3 (数据存储)

### 终端管理最佳实践（来自研究）

**推荐方案：**

1. **tmux 集成**：`libtmux` (Python) 或 `gotmux` (Go) 提供对象化 API
2. **SSH 连接池**：单 TCP 连接多 Channel 复用
3. **PTY 流式捕获**：实时输出 + 环形缓冲区
4. **状态机模式**：ACTIVE → IDLE → WAITING → ERROR → DONE
5. **模式检测**：正则匹配提示符、错误、完成标记

**参考实现：**

- **TAME**: PTY-backed 会话，VT100 模拟，异步 I/O
- **term-cli**: Agent-人类协作，单文件 Python，会话锁定/解锁
- **terminal assistant**: Generator-based 流式循环，子 Agent 隔离

## 现有架构深度分析

### 核心架构模式：单 AgentRunner + 工具系统

**1. AgentRunner - 中央协调器**

```
AgentRunner (主 Agent)
├── ReAct-Verify 模式执行循环
├── 工具调用 (ToolRegistry)
├── 上下文组装 (ContextAssembler)
├── 并行调度 (executeGrouped - 同主机串行，不同主机并行)
├── 会话管理 (DoomLoopDetector, Auto-compaction)
└── 事件发布 (EventBus)
```

**2. SubAgent 模式 - 通过 `task` 工具实现**

```typescript
// src/main/agent/task-tool.ts
// 已实现的 SubAgent 能力：
- 生成独立 session ID: `sub_${agentName}_${uuid}`
- 隔离上下文执行
- Token 消耗汇总到父会话
- 支持两种子 Agent:
  * explore: 只读调查（了解主机状态、搜索信息）
  * verify: 快速验证（确认命令结果或服务状态）
```

**关键发现**：

- ✅ **已有 SubAgent**：通过 `task` 工具可以 spawn 子 Agent
- ✅ **职责分离**：explore/verify 子 Agent 与主 build Agent 分离
- ✅ **资源追踪**：子 Agent Token 消耗汇总到父会话
- ❌ **非终端级别**：SubAgent 不是"每个终端一个 Agent"，而是"每个任务一个 Agent"

**3. 终端管理架构**

```
AgentService
├── topicSessions: Map<topicId, Map<hostId, AgentSession[]>>
├── createTerminal() - 创建新终端
├── closeTerminal() - 关闭终端
├── ensureSession() - 获取或创建会话
└── 会话注册表管理

CommandExecutor
├── sessions: Map<sessionId, Session>
├── executeAgentCommand() - Agent 执行命令
├── handleUserInput() - 用户输入处理
├── 会话锁定机制 (isLocked, lockedBy)
└── OSC 信号追踪 (命令开始/结束/退出码)
```

**4. 存储架构**

```
SQLite (better-sqlite3)
├── topics - 对话主题
├── messages - 对话消息
├── terminal_sessions - 终端会话元数据
├── terminal_io - 完整命令 I/O 历史 ⭐
├── tasks - 任务追踪
├── task_steps - 任务步骤
└── memories - 长期记忆
```

### 当前能力矩阵

| 能力            | 实现状态 | 说明                                     |
| --------------- | -------- | ---------------------------------------- |
| 多终端管理      | ✅       | `manage_terminal` 工具                   |
| 会话持久化      | ✅       | `terminal_io` 表存储完整历史             |
| 会话恢复        | ✅       | `session-recovery.ts`                    |
| Agent 暂停/恢复 | ✅       | `paused` 状态 + Ctrl+C 透传              |
| 终端锁定        | ✅       | Agent 执行期间锁定                       |
| 并行执行        | ✅       | `executeGrouped` 同主机串行/不同主机并行 |
| SubAgent        | ✅       | `task` 工具 spawn explore/verify         |
| 事件总线        | ✅       | `event-bus.ts`                           |
| 记忆系统        | ✅       | `MemoryManager`                          |

## 核心问题清单

### 1. 架构设计问题 ✅

- [x] **已解决**: OpenTerm 已有成熟架构
- [x] **决策**: 使用 Agent + 复杂任务 SubAgent 架构
  - 主 Agent 管理所有终端
  - SubAgent 仅用于 explore/verify 复杂任务
  - 不采用"每个终端一个 Agent"（过于复杂）
- [ ] 终端分组/标签设计
- [ ] 跨终端协调增强

### 2. 存储与记忆问题

- [x] **已解决**: SQLite 已存储 terminal_io 完整历史
- [x] **决策**: 历史不渲染，模型通过上下文知晓
- [ ] **待设计**: 会话级别记忆存储结构
- [ ] 自然语言意图如何映射到终端操作？
- [ ] 项目上下文如何关联到终端会话？

### 3. 状态管理问题

- [x] **已解决**: 状态机 + 事件总线已存在
- [ ] **待设计**: 长时间运行任务监控机制
- [ ] **待设计**: 避免 Agent 忘记终端状态的方案

### 4. 交互设计问题 ✅

- [x] **决策**: UI 交互设计
  - 鼠标点击终端 → 自动添加 `@terminal-xxx` 到对话框
  - 模糊指令时，模型询问"在哪个终端执行？"
- [ ] 自然语言到终端命令的转换策略？

## 设计方案

### 1. 存储结构设计

#### 1.1 新增表：`terminal_snapshots`（终端状态快照）

```sql
CREATE TABLE terminal_snapshots (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL,
  topicId TEXT NOT NULL,
  hostId TEXT NOT NULL,

  -- 终端状态
  status TEXT NOT NULL, -- 'idle' | 'running' | 'waiting_input' | 'error' | 'completed'
  currentDirectory TEXT, -- 当前工作目录
  lastCommand TEXT, -- 最后执行的命令
  lastCommandExitCode INTEGER, -- 最后命令退出码
  lastCommandDurationMs INTEGER, -- 最后命令执行时长

  -- 运行中任务信息（用于长时间运行任务）
  runningProcessName TEXT, -- 正在运行的进程名（如 'nvidia-smi', 'python train.py'）
  runningProcessPid INTEGER, -- 进程 PID
  runningProcessStartTime INTEGER, -- 进程启动时间
  runningProcessOutputSummary TEXT, -- 进程输出摘要（最近 N 行）

  -- 终端元数据
  terminalName TEXT, -- 终端名称
  terminalPurpose TEXT, -- 终端用途标签（如 '#terminal-assistant', '#monitor', '#training'）
  terminalTags TEXT, -- JSON 数组标签

  -- 统计信息
  commandCount INTEGER DEFAULT 0, -- 该终端执行命令数
  totalExecutionTimeMs INTEGER DEFAULT 0, -- 总执行时间

  -- 时间戳
  timestamp INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,

  FOREIGN KEY (sessionId) REFERENCES terminal_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (topicId) REFERENCES topics(id) ON DELETE CASCADE,
  FOREIGN KEY (hostId) REFERENCES hosts(id) ON DELETE SET NULL
);

-- 索引
CREATE INDEX idx_terminal_snapshots_session ON terminal_snapshots(sessionId);
CREATE INDEX idx_terminal_snapshots_topic ON terminal_snapshots(topicId);
CREATE INDEX idx_terminal_snapshots_status ON terminal_snapshots(status);
```

#### 1.2 新增表：`session_memories`（会话级别记忆）

```sql
CREATE TABLE session_memories (
  id TEXT PRIMARY KEY,
  topicId TEXT NOT NULL,
  sessionId TEXT NOT NULL,
  hostId TEXT NOT NULL,

  -- 记忆类型
  type TEXT NOT NULL, -- 'terminal_state' | 'command_pattern' | 'execution_context' | 'user_intent'

  -- 记忆内容
  content TEXT NOT NULL, -- 自然语言描述
  structuredData TEXT, -- JSON 结构化数据

  -- 关联信息
  relatedCommand TEXT, -- 关联的命令
  relatedOutput TEXT, -- 关联的输出摘要
  relatedTerminalName TEXT, -- 关联的终端名称

  -- 重要性
  importance INTEGER DEFAULT 3, -- 1-5，越高越重要

  -- 时间戳
  timestamp INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,

  FOREIGN KEY (sessionId) REFERENCES terminal_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (topicId) REFERENCES topics(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_session_memories_topic ON session_memories(topicId);
CREATE INDEX idx_session_memories_session ON session_memories(sessionId);
CREATE INDEX idx_session_memories_type ON session_memories(type);
```

#### 1.3 新增表：`terminal_groups`（终端分组）

```sql
CREATE TABLE terminal_groups (
  id TEXT PRIMARY KEY,
  topicId TEXT NOT NULL,
  name TEXT NOT NULL, -- 组名（如 "模型训练场景"）
  description TEXT, -- 描述

  -- 组内终端
  sessionIds TEXT NOT NULL, -- JSON 数组 [sessionId1, sessionId2, ...]

  -- 场景模板
  isTemplate INTEGER DEFAULT 0, -- 是否为可复用模板
  templateName TEXT, -- 模板名称

  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,

  FOREIGN KEY (topicId) REFERENCES topics(id) ON DELETE CASCADE
);
```

#### 1.4 扩展现有表

**`terminal_sessions` 表新增字段：**

```sql
-- 终端元数据
ALTER TABLE terminal_sessions ADD COLUMN purpose TEXT; -- 用途标签
ALTER TABLE terminal_sessions ADD COLUMN tags TEXT; -- JSON 数组

-- 状态追踪
ALTER TABLE terminal_sessions ADD COLUMN lastActivityAt INTEGER; -- 最后活动时间
ALTER TABLE terminal_sessions ADD COLUMN commandHistory TEXT; -- 最近命令历史（JSON 数组）
ALTER TABLE terminal_sessions ADD COLUMN isMonitored INTEGER DEFAULT 0; -- 是否被监控
```

**`terminal_io` 表新增字段：**

```sql
-- 命令元数据
ALTER TABLE terminal_io ADD COLUMN commandType TEXT; -- 'short' | 'long_running' | 'interactive'
ALTER TABLE terminal_io ADD COLUMN estimatedDuration TEXT; -- 'instant' | 'short' | 'long' | 'infinite'
```

### 2. 会话级别记忆方案

#### 2.1 记忆类型设计

| 类型                | 说明         | 示例                                              |
| ------------------- | ------------ | ------------------------------------------------- |
| `terminal_state`    | 终端当前状态 | "终端1正在运行 nvidia-smi 监控，已运行 5 分钟"    |
| `command_pattern`   | 命令执行模式 | "用户习惯在 /home/user/project 目录使用 terminal-assistant" |
| `execution_context` | 执行上下文   | "训练任务在终端2运行，预计需要 2 小时"            |
| `user_intent`       | 用户意图     | "用户想要监控 GPU 状态并同时运行训练"             |

#### 2.2 记忆生成时机

```typescript
// 1. 命令执行完成后
- 生成 terminal_state 记忆
- 更新 command_pattern 记忆

// 2. 长时间运行任务启动时
- 生成 execution_context 记忆
- 标记任务为监控状态

// 3. 用户明确指令时
- 生成 user_intent 记忆

// 4. 定期（每 5 分钟）
- 扫描所有终端状态
- 更新 runningProcessOutputSummary
- 生成状态快照
```

#### 2.3 记忆使用方式

```typescript
// Agent 上下文组装时注入
class ContextAssembler {
  assemble() {
    // 1. 系统提示
    // 2. 终端上下文（当前实现）
    // 3. 【新增】会话级别记忆
    const sessionMemories = memoryDB.getSessionMemories(topicId)
    // 4. 历史消息
    // 5. 当前消息
  }
}

// 记忆注入格式
const memoryContext = `
### 会话记忆 (Session Memories):
[终端1 - #monitor]: 正在运行 nvidia-smi 监控，已持续 15 分钟，GPU 利用率 85%
[终端2 - #training]: Python 训练脚本运行中，进度 45%，预计剩余 1.5 小时
[终端3 - #terminal-assistant]: 空闲状态，当前目录 /home/user/project-a

### 用户习惯:
- 偏好使用 terminal-assistant 探索代码项目
- 习惯在训练时开启 GPU 监控
`
```

### 3. 避免 Agent 忘记终端状态的机制

#### 3.1 主动状态推送

```typescript
// 在 Agent 每次思考前，主动推送终端状态
class TerminalStateMonitor {
  // 每 30 秒或在 Agent 思考前
  async pushTerminalState(topicId: string) {
    const snapshots = await this.getLatestSnapshots(topicId)

    // 生成状态摘要
    const stateSummary = snapshots.map((s) => ({
      terminalName: s.terminalName,
      status: s.status,
      runningProcess: s.runningProcessName,
      duration: Date.now() - s.runningProcessStartTime,
      lastOutput: s.runningProcessOutputSummary?.slice(0, 200)
    }))

    // 注入到 Agent 上下文
    return stateSummary
  }
}
```

#### 3.2 长时间运行任务监控

```typescript
// 专门监控长时间运行任务
class LongRunningTaskMonitor {
  private monitoredTasks: Map<string, MonitoredTask> = new Map()

  // 启动监控
  startMonitoring(sessionId: string, processName: string) {
    const task: MonitoredTask = {
      sessionId,
      processName,
      startTime: Date.now(),
      lastCheckTime: Date.now(),
      checkInterval: 30000, // 30 秒检查一次
      outputBuffer: []
    }

    this.monitoredTasks.set(sessionId, task)
    this.scheduleCheck(task)
  }

  // 定期检查
  async checkTask(task: MonitoredTask) {
    // 1. 读取终端最新输出
    const latestOutput = await this.readTerminalOutput(task.sessionId)

    // 2. 更新输出缓冲区
    task.outputBuffer.push(latestOutput)
    if (task.outputBuffer.length > 10) {
      task.outputBuffer.shift() // 保持最近 10 条
    }

    // 3. 生成摘要
    const summary = await this.summarizeOutput(task.outputBuffer)

    // 4. 更新数据库
    await terminalSnapshotDB.updateOutputSummary(task.sessionId, summary)

    // 5. 检查任务是否完成
    const isCompleted = await this.checkIfCompleted(task)
    if (isCompleted) {
      this.stopMonitoring(task.sessionId)
    } else {
      this.scheduleCheck(task)
    }
  }
}
```

#### 3.3 智能提醒机制

```typescript
// 当 Agent 可能忘记时主动提醒
class AgentReminder {
  // 在 Agent 执行工具前检查
  async beforeToolExecution(toolName: string, args: any, context: AgentContext) {
    if (toolName === 'execute_command') {
      const terminalName = args.terminalName
      const sessionId = await this.resolveTerminal(context.topicId, terminalName)

      // 检查该终端是否有正在运行的任务
      const snapshot = await terminalSnapshotDB.getLatest(sessionId)

      if (snapshot?.status === 'running') {
        return {
          shouldWarn: true,
          message: `⚠️ 注意：终端 "${terminalName}" 正在运行 "${snapshot.runningProcessName}"（已运行 ${this.formatDuration(snapshot.runningProcessStartTime)}）。确定要执行新命令吗？`
        }
      }
    }

    return { shouldWarn: false }
  }
}
```

### 4. UI 交互实现

#### 4.1 点击终端自动艾特

```typescript
// 前端实现
const TerminalView: React.FC = () => {
  const handleTerminalClick = (terminal: TerminalSession) => {
    // 1. 聚焦到输入框
    inputRef.current?.focus();

    // 2. 插入 @terminal-name 到输入框
    const mention = `@${terminal.name} `;
    insertTextToInput(mention);

    // 3. 高亮该终端（视觉反馈）
    setActiveTerminal(terminal.id);
  };

  return (
    <div onClick={() => handleTerminalClick(terminal)}>
      {/* 终端内容 */}
    </div>
  );
};
```

#### 4.2 模糊指令处理

```typescript
// Agent 工具增强
const executeCommandTool = {
  parameters: z.object({
    hostId: z.string(),
    command: z.string(),
    terminalName: z.string().optional(),
    needConfirmation: z.boolean().optional() // 【新增】是否需要确认
  }),

  async execute(args, ctx) {
    // 如果没有指定终端名称
    if (!args.terminalName) {
      // 1. 获取该 topic 下所有终端
      const terminals = await ctx.agentService.getSessions(ctx.topicId)

      // 2. 如果只有一个终端，直接使用
      if (terminals.length === 1) {
        args.terminalName = terminals[0].name
      } else {
        // 3. 多个终端，返回询问
        return {
          output: JSON.stringify({
            needUserInput: true,
            message: '检测到多个终端，请指定要在哪个终端执行：',
            options: terminals.map((t) => ({
              name: t.name,
              status: t.status,
              purpose: t.purpose,
              currentDirectory: t.currentDirectory
            }))
          })
        }
      }
    }

    // 继续执行...
  }
}
```

### 5. 数据流架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         数据流架构                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  用户输入 → AgentRunner                                         │
│              │                                                   │
│              ▼                                                   │
│     ┌─────────────────┐                                          │
│     │ ContextAssembler│                                          │
│     │                 │                                          │
│     │ 1. System Prompt│                                          │
│     │ 2. TerminalCtx  │◄── terminal_snapshots (实时状态)        │
│     │ 3. SessionMem   │◄── session_memories (历史记忆)          │
│     │ 4. History      │                                          │
│     │ 5. Current Msg  │                                          │
│     └────────┬────────┘                                          │
│              │                                                   │
│              ▼                                                   │
│     LLM 推理 → Tool Calls                                       │
│              │                                                   │
│              ▼                                                   │
│     ┌─────────────────┐                                          │
│     │  executeGrouped │                                          │
│     │  (并行调度)      │                                          │
│     └────────┬────────┘                                          │
│              │                                                   │
│     ┌────────┴────────┐                                          │
│     ▼                 ▼                                          │
│ Terminal 1         Terminal 2        Terminal 3                 │
│     │                 │                 │                        │
│     ▼                 ▼                 ▼                        │
│  执行命令          执行命令          执行命令                    │
│     │                 │                 │                        │
│     ▼                 ▼                 ▼                        │
│  更新 snapshot    更新 snapshot    更新 snapshot                │
│     │                 │                 │                        │
│     ▼                 ▼                 ▼                        │
│  生成 memory      生成 memory      生成 memory                  │
│     │                 │                 │                        │
│     └─────────────────┴─────────────────┘                        │
│                       │                                          │
│                       ▼                                          │
│              返回结果给 Agent                                    │
│                       │                                          │
│                       ▼                                          │
│              继续下一轮 / 完成                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6. 关键时序

```
时间线 ─────────────────────────────────────────────────────────►

用户: "在 a 目录用 terminal-assistant 探索，在 b 目录用 claude code 探索，同时监测资源"
  │
  ▼
Agent: 解析意图 → 识别 3 个任务
  │
  ├──► 创建终端1 (a目录, #terminal-assistant)
  │      ├── 执行: cd /a && terminal-assistant
  │      ├── 生成 snapshot: status='running', purpose='#terminal-assistant'
  │      └── 生成 memory: "终端1启动 terminal-assistant，目录 /a"
  │
  ├──► 创建终端2 (b目录, #claude)
  │      ├── 执行: cd /b && claude code
  │      ├── 生成 snapshot
  │      └── 生成 memory
  │
  └──► 创建终端3 (监测, #monitor)
         ├── 执行: watch -n 5 nvidia-smi
         ├── 生成 snapshot: isMonitored=1
         └── 启动 LongRunningTaskMonitor
                ├── 每 30 秒读取输出
                ├── 更新 snapshot.outputSummary
                └── 生成 memory: "GPU 利用率 85%，温度 70°C"
  │
  ▼
Agent: 返回 "已创建 3 个终端，分别用于..."
  │
  ▼
[5 分钟后]
  │
LongRunningTaskMonitor: 更新终端3 snapshot
  │
  ▼
用户: 点击终端3 → 对话框自动添加 "@terminal-3 "
  │
  ▼
用户: "@terminal-3 停止监控"
  │
  ▼
Agent: 执行 Ctrl+C → 更新 snapshot: status='idle'
  │
  ▼
用户: "训练模型"
  │
  ▼
Agent: 【记忆提示】"终端2 (#claude) 当前在 /b 目录，是否在此执行？"
  │   或自动选择终端2（基于 purpose 匹配）
  │
  ▼
Agent: 在终端2执行训练命令
  │
  ▼
LongRunningTaskMonitor: 检测到长时间运行任务，开始监控
```

## 待确认问题

### 1. 终端命名策略

- **自动命名**: `终端-1`, `终端-2`（简单）
- **用途命名**: `#terminal-assistant`, `#monitor`（语义化）
- **混合命名**: `终端-1 (#terminal-assistant)`（两者结合）

### 2. 模糊匹配策略

用户说"探索项目"：

- **保守**: 总是询问"使用哪个终端？"
- **智能**: 根据 purpose 自动匹配（如 `#terminal-assistant` 终端）
- **混合**: 如果有明确匹配的终端则自动，否则询问

### 3. 监控任务检测

如何自动识别长时间运行任务：

- **白名单**: 预定义命令（nvidia-smi, python, train 等）
- **启发式**: 执行时间超过阈值（如 10 秒）自动标记
- **显式标记**: 用户或 Agent 显式标记"这是一个长时间任务"

请帮我确认这三个问题，然后我可以生成完整的工作计划。
