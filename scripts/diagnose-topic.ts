#!/usr/bin/env tsx
/**
 * Topic 诊断脚本
 *
 * 使用方法:
 *   npx tsx scripts/diagnose-topic.ts <topicId>
 *
 * 功能:
 *   - 查询指定 topic 的所有 Agent 活动
 *   - 分析工具调用和命令执行
 *   - 识别错误和失败
 *   - 生成执行摘要
 */

import { db } from '../src/main/db'

interface DiagnosisResult {
  topic: any
  messages: any[]
  tasks: TaskAnalysis[]
  errors: ErrorInfo[]
  summary: Summary
}

interface TaskAnalysis {
  task: any
  steps: any[]
  commands: CommandInfo[]
  toolCalls: ToolCallInfo[]
  status: 'running' | 'completed' | 'failed'
}

interface CommandInfo {
  stepId: string
  command: string
  hostId: string
  status: string
  output: string
  error?: string
}

interface ToolCallInfo {
  stepId: string
  tool: string
  params: any
  status: string
  result?: any
  error?: string
}

interface ErrorInfo {
  type: 'command' | 'tool' | 'system'
  timestamp: number
  message: string
  context: string
}

interface Summary {
  totalTasks: number
  completedTasks: number
  failedTasks: number
  totalCommands: number
  failedCommands: number
  totalToolCalls: number
  failedToolCalls: number
  duration: number
}

function parseArgs(): { topicId: string; since?: number } {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error('Usage: npx tsx scripts/diagnose-topic.ts <topicId>')
    process.exit(1)
  }
  return {
    topicId: args[0],
    since: args[1] ? parseInt(args[1]) : undefined
  }
}

async function diagnoseTopic(topicId: string, since?: number): Promise<DiagnosisResult> {
  const topic = db.topics.getTopicById(topicId)
  if (!topic) {
    throw new Error(`Topic ${topicId} not found`)
  }

  // Get all messages for this topic
  const messages = db.messages.getMessages(topicId)
  const filteredMessages = since ? messages.filter((m) => m.timestamp > since) : messages

  // Get all tasks for this topic
  const tasks = db.tasks.getTasks(topicId)
  const filteredTasks = since ? tasks.filter((t) => t.createdAt > since) : tasks

  const taskAnalyses: TaskAnalysis[] = []
  const errors: ErrorInfo[] = []

  for (const task of filteredTasks) {
    const steps = db.taskSteps.getTaskSteps(task.id)
    const commands: CommandInfo[] = []
    const toolCalls: ToolCallInfo[] = []

    for (const step of steps) {
      // Analyze command steps
      if (step.type === 'command' && step.content) {
        try {
          const content = JSON.parse(step.content)
          commands.push({
            stepId: step.id,
            command: content.command || content,
            hostId: step.hostId || 'unknown',
            status: step.status,
            output: step.rawOutput || '',
            error: step.status === 'failed' ? step.rawOutput : undefined
          })

          if (step.status === 'failed') {
            errors.push({
              type: 'command',
              timestamp: step.updatedAt || step.createdAt,
              message: `Command failed: ${content.command || content}`,
              context: step.rawOutput || ''
            })
          }
        } catch (e) {
          // Raw content, not JSON
          commands.push({
            stepId: step.id,
            command: step.content,
            hostId: step.hostId || 'unknown',
            status: step.status,
            output: step.rawOutput || ''
          })
        }
      }

      // Analyze tool calls from messages
      const stepMessages = filteredMessages.filter(
        (m) => m.stepId === step.id || m.taskId === task.id
      )

      for (const msg of stepMessages) {
        if (msg.toolCalls) {
          for (const toolCall of msg.toolCalls) {
            toolCalls.push({
              stepId: step.id,
              tool: toolCall.function?.name || 'unknown',
              params: JSON.parse(toolCall.function?.arguments || '{}'),
              status: step.status,
              result: msg.content,
              error: step.status === 'failed' ? step.rawOutput : undefined
            })

            if (step.status === 'failed') {
              errors.push({
                type: 'tool',
                timestamp: msg.timestamp,
                message: `Tool ${toolCall.function?.name} failed`,
                context: step.rawOutput || ''
              })
            }
          }
        }
      }
    }

    taskAnalyses.push({
      task,
      steps,
      commands,
      toolCalls,
      status: task.status
    })
  }

  // Generate summary
  const summary: Summary = {
    totalTasks: taskAnalyses.length,
    completedTasks: taskAnalyses.filter((t) => t.status === 'completed').length,
    failedTasks: taskAnalyses.filter((t) => t.status === 'failed').length,
    totalCommands: taskAnalyses.reduce((sum, t) => sum + t.commands.length, 0),
    failedCommands: taskAnalyses.reduce(
      (sum, t) => sum + t.commands.filter((c) => c.status === 'failed').length,
      0
    ),
    totalToolCalls: taskAnalyses.reduce((sum, t) => sum + t.toolCalls.length, 0),
    failedToolCalls: taskAnalyses.reduce(
      (sum, t) => sum + t.toolCalls.filter((tc) => tc.status === 'failed').length,
      0
    ),
    duration:
      filteredTasks.length > 0 ? Date.now() - Math.min(...filteredTasks.map((t) => t.createdAt)) : 0
  }

  return {
    topic,
    messages: filteredMessages,
    tasks: taskAnalyses,
    errors,
    summary
  }
}

function printReport(result: DiagnosisResult): void {
  console.log('='.repeat(80))
  console.log(`Topic 诊断报告: ${result.topic.title}`)
  console.log(`Topic ID: ${result.topic.id}`)
  console.log(`创建时间: ${new Date(result.topic.createdAt).toLocaleString()}`)
  console.log('='.repeat(80))
  console.log()

  // Summary
  console.log('📊 执行摘要')
  console.log('-'.repeat(80))
  console.log(`总任务数: ${result.summary.totalTasks}`)
  console.log(`  ✅ 成功: ${result.summary.completedTasks}`)
  console.log(`  ❌ 失败: ${result.summary.failedTasks}`)
  console.log(
    `  ⏳ 运行中: ${result.summary.totalTasks - result.summary.completedTasks - result.summary.failedTasks}`
  )
  console.log()
  console.log(`命令执行: ${result.summary.totalCommands} 次`)
  console.log(`  ❌ 失败: ${result.summary.failedCommands} 次`)
  console.log()
  console.log(`工具调用: ${result.summary.totalToolCalls} 次`)
  console.log(`  ❌ 失败: ${result.summary.failedToolCalls} 次`)
  console.log()
  console.log(`持续时间: ${Math.round(result.summary.duration / 1000)} 秒`)
  console.log()

  // Recent activity
  console.log('📝 最近活动')
  console.log('-'.repeat(80))
  for (const task of result.tasks.slice(-3)) {
    console.log(`\n任务: ${task.task.title}`)
    console.log(`  状态: ${task.status}`)
    console.log(`  步骤: ${task.steps.length}`)

    for (const cmd of task.commands.slice(-3)) {
      console.log(
        `  💻 [${cmd.status}] ${cmd.command.slice(0, 60)}${cmd.command.length > 60 ? '...' : ''}`
      )
      if (cmd.error) {
        console.log(`     ❌ Error: ${cmd.error.slice(0, 100)}`)
      }
    }

    for (const tool of task.toolCalls.slice(-3)) {
      console.log(`  🔧 [${tool.status}] ${tool.tool}`)
      if (tool.error) {
        console.log(`     ❌ Error: ${tool.error.slice(0, 100)}`)
      }
    }
  }
  console.log()

  // Errors
  if (result.errors.length > 0) {
    console.log('❌ 错误列表')
    console.log('-'.repeat(80))
    for (const error of result.errors.slice(-10)) {
      console.log(
        `\n[${new Date(error.timestamp).toLocaleTimeString()}] ${error.type.toUpperCase()}`
      )
      console.log(`  ${error.message}`)
      if (error.context) {
        console.log(`  Context: ${error.context.slice(0, 200)}`)
      }
    }
  } else {
    console.log('✅ 未发现错误')
  }
  console.log()

  // Messages
  console.log('💬 最近消息')
  console.log('-'.repeat(80))
  for (const msg of result.messages.slice(-5)) {
    const role = msg.role === 'user' ? '👤' : msg.role === 'assistant' ? '🤖' : '🔧'
    const content = msg.content?.slice(0, 80) || '[无内容]'
    console.log(
      `${role} [${new Date(msg.timestamp).toLocaleTimeString()}] ${content}${msg.content?.length > 80 ? '...' : ''}`
    )
  }
  console.log()
}

async function main() {
  const { topicId, since } = parseArgs()

  console.log(`🔍 正在诊断 topic: ${topicId}...`)
  if (since) {
    console.log(`   只显示 ${new Date(since).toLocaleString()} 之后的数据`)
  }
  console.log()

  try {
    const result = await diagnoseTopic(topicId, since)
    printReport(result)
  } catch (error) {
    console.error('诊断失败:', error)
    process.exit(1)
  }
}

main()
