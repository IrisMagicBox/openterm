# OpenTerm 简化优化方案

## 核心思想

**给 Agent 一张白纸，让它自由记录**

就像一个人拿着笔记本，随时记录：

- 这个主机是干什么的
- 这个终端用来干什么
- 现在在做什么
- 有什么需要注意的

**不预设字段，不强制结构，纯文本自由记录**

---

## 极简数据库设计

### 只新增 2 个字段

**hosts 表**：

```sql
ALTER TABLE hosts ADD COLUMN agentNotes TEXT;  -- Agent 自由记录的主机备注
```

**terminal_sessions 表**：

```sql
ALTER TABLE terminal_sessions ADD COLUMN agentNotes TEXT;  -- Agent 自由记录的终端备注
```

**就这么简单！**

---

## Agent 如何使用

### 示例 1：记录主机信息

Agent 看到新主机，自动记录：

```
【主机备注】
- 用途：AI训练服务器
- 配置：8卡A100，Ubuntu 22.04
- 注意：GPU 0 温度容易过高
- 常用目录：/home/ubuntu/projects
```

### 示例 2：记录终端信息

Agent 创建终端后，自动记录：

```
【终端备注】
- 用途：GPU监控
- 当前：运行 nvidia-smi 监控（已30分钟）
- 状态：GPU利用率 85%，温度正常
- 最后更新：2024-01-15 14:30
```

### 示例 3：更新终端状态

Agent 定期检查，更新备注：

```
【终端备注】
- 用途：模型训练
- 当前：python train.py --epochs 100
- 进度：Epoch 45/100，Loss 0.023
- 已运行：45分钟，预计剩余1小时
- 最后更新：2024-01-15 15:00
```

---

## 新增工具

### 1. read_notes - 读取备注

```typescript
const readNotesTool = define('read_notes', {
  description: '读取主机或终端的 Agent 备注',
  parameters: z.object({
    target: z.enum(['host', 'terminal']),
    targetId: z.string()
  }),
  async execute(args, ctx) {
    if (args.target === 'host') {
      const host = hostDB.getHostById(args.targetId)
      return { output: host.agentNotes || '暂无备注' }
    } else {
      const session = terminalSessionDB.getSession(args.targetId)
      return { output: session.agentNotes || '暂无备注' }
    }
  }
})
```

### 2. write_notes - 写入备注

```typescript
const writeNotesTool = define('write_notes', {
  description: '写入或更新主机或终端的 Agent 备注',
  parameters: z.object({
    target: z.enum(['host', 'terminal']),
    targetId: z.string(),
    notes: z.string().describe('备注内容，自由格式文本'),
    append: z.boolean().optional().describe('是否追加，默认 false（覆盖）')
  }),
  async execute(args, ctx) {
    const timestamp = new Date().toLocaleString()
    const noteWithTime = `[${timestamp}]\n${args.notes}`

    if (args.target === 'host') {
      const host = hostDB.getHostById(args.targetId)
      const newNotes = args.append
        ? `${host.agentNotes || ''}\n\n---\n${noteWithTime}`
        : noteWithTime
      hostDB.updateHost(args.targetId, { agentNotes: newNotes })
    } else {
      const session = terminalSessionDB.getSession(args.targetId)
      const newNotes = args.append
        ? `${session.agentNotes || ''}\n\n---\n${noteWithTime}`
        : noteWithTime
      terminalSessionDB.updateSession(args.targetId, { agentNotes: newNotes })
    }

    return { output: '备注已更新' }
  }
})
```

---

## Agent 上下文增强

在 ContextAssembler 中注入备注：

```typescript
buildContext() {
  const messages = []

  // 1. System Prompt
  messages.push({ role: 'system', content: SYSTEM_PROMPT })

  // 2. 【新增】Agent 备注
  const notesContext = this.buildNotesContext()
  if (notesContext) {
    messages.push({ role: 'system', content: notesContext })
  }

  // 3. 终端上下文（原有）
  // ...

  return messages
}

async buildNotesContext(): Promise<string> {
  const context = ['### Agent 备注：']

  // 获取当前话题的所有主机和终端
  const topic = topicDB.getTopicById(this.topicId)

  for (const hostId of topic.hostIds) {
    const host = hostDB.getHostById(hostId)
    if (host?.agentNotes) {
      context.push(`\n[主机: ${host.alias}]\n${host.agentNotes}`)
    }
  }

  const sessions = terminalSessionDB.getSessionsByTopic(this.topicId)
  for (const session of sessions) {
    if (session.agentNotes) {
      context.push(`\n[终端: ${session.name}]\n${session.agentNotes}`)
    }
  }

  return context.join('\n')
}
```

---

## 注入 Agent 的上下文示例

```markdown
### Agent 备注：

[主机: AI训练服务器]

- 用途：AI训练服务器
- 配置：8卡A100，Ubuntu 22.04，CUDA 12.1
- 注意：GPU 0 温度容易过高，需关注
- 常用目录：/home/ubuntu/projects

[终端: 终端-1]

- 用途：GPU监控
- 当前：运行 nvidia-smi（已30分钟）
- 状态：GPU利用率 85%，温度 70°C，正常
- 最后更新：2024-01-15 14:30

[终端: 终端-2]

- 用途：模型训练
- 当前：python train.py --epochs 100
- 进度：Epoch 45/100，Loss 0.023
- 已运行：45分钟，预计剩余1小时
- 最后更新：2024-01-15 15:00
```

---

## Agent 使用流程

### 1. 发现新主机时

```
Agent: 检测到新主机 "AI训练服务器"
Agent: 执行命令获取系统信息
Agent: write_notes(host, "- 用途：AI训练服务器\n- 配置：8卡A100...")
```

### 2. 创建终端时

```
Agent: 为用户创建终端用于 GPU 监控
Agent: write_notes(terminal, "- 用途：GPU监控\n- 当前：准备运行 nvidia-smi")
Agent: 执行命令：watch -n 5 nvidia-smi
Agent: write_notes(terminal, "- 当前：运行 nvidia-smi（已开始）")
```

### 3. 定期检查时（可选）

```
Agent: read_notes(terminal) → 查看当前备注
Agent: 执行命令获取最新状态
Agent: write_notes(terminal, "更新状态...")
```

### 4. 用户询问时

```
用户：那个训练任务怎么样了？
Agent: read_notes(terminal-2) → 获取进度信息
Agent: 回复用户："训练任务当前 Epoch 45/100，预计剩余1小时"
```

---

## 优势

| 优势       | 说明                             |
| ---------- | -------------------------------- |
| **极简**   | 只新增 2 个字段                  |
| **灵活**   | Agent 自由决定记录什么、怎么记录 |
| **无约束** | 不预设结构，适应各种场景         |
| **可扩展** | Agent 可以随时改变记录格式       |
| **易维护** | 没有复杂的表结构和同步逻辑       |

---

## 与之前复杂方案的对比

| 方面     | 复杂方案                  | 简化方案             |
| -------- | ------------------------- | -------------------- |
| 新增表   | 2 个表 + 多个字段         | 0 个表               |
| 新增字段 | 20+ 个字段                | 2 个字段             |
| 监控组件 | InspectionMonitor（复杂） | 无（Agent 自主决定） |
| 数据同步 | 定时任务同步              | 实时写入             |
| 灵活性   | 低（预设字段）            | 高（自由文本）       |
| 实现难度 | 高                        | 低                   |

---

## 实施步骤

1. **数据库迁移**（5分钟）
   - hosts 表加 agentNotes 字段
   - terminal_sessions 表加 agentNotes 字段

2. **新增工具**（30分钟）
   - read_notes 工具
   - write_notes 工具

3. **上下文增强**（30分钟）
   - ContextAssembler 注入备注

4. **System Prompt 更新**（10分钟）
   - 告诉 Agent 可以使用备注功能
   - 指导 Agent 如何记录和维护备注

**总计：约 1.5 小时工作量**

---

## System Prompt 指导

```markdown
## 备注功能

你可以使用 read_notes 和 write_notes 工具来记录主机和终端的信息。

### 什么时候记录：

- 发现新主机时，记录主机配置和用途
- 创建终端时，记录终端用途
- 执行长时间任务时，记录任务进度
- 发现重要信息时（如错误、警告）

### 记录格式建议：

- 用途：这个主机/终端用来干什么
- 当前：现在正在做什么
- 进度：任务进度（如果有）
- 注意：需要关注的事项
- 最后更新：时间戳

### 什么时候读取：

- 回复用户前，查看相关备注
- 执行命令前，了解当前状态
- 定期检查任务进度

### 示例：

创建监控终端后，记录：
"""

- 用途：GPU监控
- 当前：运行 nvidia-smi
- 状态：GPU 0 利用率 85%，温度 70°C
- 最后更新：2024-01-15 14:30
  """
```

---

_简化方案完成，极简但有效！_
