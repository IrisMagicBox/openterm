# CommandExecutor 功能测试指南

## 测试环境准备

1. 启动应用：

```bash
npm run dev
```

2. 添加一个 SSH 主机（支持 bash 或 zsh）

3. 创建一个新话题并开始对话

## 测试用例

### 1. Shell Integration 注入测试

**步骤：**

1. 在话题中 @主机 并发送消息 "查看当前目录"
2. 观察终端是否弹出
3. 检查终端中是否执行了 Shell Integration 初始化脚本

**验证：**

- 打开终端后，执行 `echo $PROMPT_COMMAND` 应该包含 `__openterm_prompt_end`
- 或者执行 `trap -p DEBUG` 应该看到 `__openterm_prompt_start`

**预期结果：**

- Shell Integration 成功注入
- `terminal_sessions` 表中 `shellIntegrationReady` 字段变为 1

### 2. 命令边界检测测试

**步骤：**

1. 让 Agent 执行命令：`ls -la`
2. 观察命令执行和返回

**验证：**

- 检查 `terminal_io` 表中是否正确记录了 input 和 output
- input 记录的 `source` 应该是 'agent'
- output 记录应该包含完整的命令输出
- output 记录应该有 `exitCode` 字段（通常为 0）

**SQL 验证：**

```sql
SELECT * FROM terminal_io WHERE sessionId = '<session_id>' ORDER BY timestamp DESC LIMIT 5;
```

### 3. Agent 执行锁定测试

**步骤：**

1. 让 Agent 执行一个耗时命令：`sleep 5 && echo done`
2. 在命令执行期间，尝试在终端中手动输入

**验证：**

- 手动输入应该被忽略（或需要点击暂停按钮才能输入）
- 命令状态栏应该显示 "执行中..."
- 5秒后命令完成，状态栏显示 "exit 0 · 5000ms"

### 4. 用户输入记录测试

**步骤：**

1. 点击暂停按钮，接管终端
2. 手动输入命令：`pwd`
3. 按回车执行

**验证：**

- 检查 `terminal_io` 表中是否记录了 source='user' 的 input
- 检查是否记录了对应的 output

**SQL 验证：**

```sql
SELECT * FROM terminal_io WHERE source = 'user' AND sessionId = '<session_id>';
```

### 5. Exit Code 提取测试

**步骤：**

1. 让 Agent 执行成功命令：`echo "success"`
2. 让 Agent 执行失败命令：`ls /nonexistent_directory`

**验证：**

- 成功命令的 output 记录 `exitCode` 应该是 0
- 失败命令的 output 记录 `exitCode` 应该是非零值（如 1 或 2）
- 命令状态栏应该显示不同的颜色（绿色/红色）

**SQL 验证：**

```sql
SELECT content, exitCode, durationMs FROM terminal_io
WHERE type = 'output' AND sessionId = '<session_id>'
ORDER BY timestamp DESC LIMIT 5;
```

### 6. 终端上下文构建测试

**步骤：**

1. 执行几个命令（Agent 和用户混合）
2. 发送新消息给 Agent

**验证：**

- 检查 Agent 收到的 system message 是否包含 "📋 Terminal State Summary"
- 摘要应该包含最近的命令历史和状态

### 7. 串行执行测试

**步骤：**

1. 让 Agent 执行多个命令（同一主机）：
   - "查看磁盘使用情况，然后查看内存使用情况"

**验证：**

- 命令应该串行执行（一个接一个）
- 不应该同时执行多个命令
- 每个命令都有独立的 input/output 记录

### 8. 流式输出测试

**步骤：**

1. 让 Agent 执行持续输出命令：`tail -f /var/log/syslog`
2. 观察几秒钟
3. 点击暂停按钮停止

**验证：**

- 应该看到多个 output 记录（chunkIndex 递增）
- 每个 chunk 有时间间隔（约 5 秒）
- `isStreaming` 字段应该为 1

**SQL 验证：**

```sql
SELECT * FROM terminal_io
WHERE sessionId = '<session_id>' AND isStreaming = 1
ORDER BY chunkIndex;
```

## 调试技巧

### 查看数据库内容

```bash
# 使用 SQLite 命令行
sqlite3 ~/Library/Application\ Support/openterm/openterm.db

# 常用查询
.tables
SELECT * FROM terminal_sessions;
SELECT * FROM terminal_io ORDER BY timestamp DESC LIMIT 20;
```

### 查看主进程日志

在 DevTools 中查看 Console，或添加 `console.log` 到：

- `src/main/terminal.ts` - CommandExecutor
- `src/main/ssh.ts` - SSH 处理

### 检查 IPC 通信

在 DevTools 的 Network 面板中查看 IPC 消息，或添加日志到 preload。

## 常见问题

### Shell Integration 未注入

- 检查远程 shell 是否为 bash 或 zsh
- 检查是否有权限执行 PROMPT_COMMAND
- 查看 `terminal_sessions.shellType` 字段

### 命令边界未检测

- 检查 OSC 标记是否被正确过滤（不应显示在终端中）
- 检查 `handleStreamOutput` 是否正确解析标记
- 查看是否有 `CMD_START` 和 `CMD_END` 标记输出

### Exit Code 为 null

- 检查 Shell Integration 是否成功注入
- 检查命令是否实际完成（不是被中断）
- 查看 `terminal_io` 中是否有对应的 output 记录

## 性能测试

### 大输出测试

```bash
# 生成大输出
cat /dev/urandom | base64 | head -c 100000
```

验证：

- 输出应该被截断（isTruncated = 1）
- 保留头部和尾部内容
- 不崩溃或卡顿

### 并发测试

快速发送多个消息给 Agent，验证：

- 同一主机的命令串行执行
- 不同主机的命令可以并行
- 数据库记录不冲突
