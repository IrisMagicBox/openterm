import { db } from '../src/main/db'

// Get latest topic
const topics = db.topics.getTopics()
const latestTopic = topics[topics.length - 1]

if (!latestTopic) {
  console.log('No topics found')
  process.exit(0)
}

console.log('='.repeat(80))
console.log('最新 Topic:', latestTopic.title)
console.log('Topic ID:', latestTopic.id)
console.log('创建时间:', new Date(latestTopic.createdAt).toLocaleString())
console.log('='.repeat(80))
console.log()

// Get messages
const messages = db.messages.getMessages(latestTopic.id)
console.log('💬 消息记录 (最近 10 条):')
console.log('-'.repeat(80))
messages.slice(-10).forEach((msg, i) => {
  const role = msg.role === 'user' ? '👤 User' : msg.role === 'assistant' ? '🤖 Agent' : '🔧 Tool'
  const content = msg.content?.slice(0, 100) || '[无内容]'
  console.log(`${i + 1}. ${role} [${new Date(msg.timestamp).toLocaleTimeString()}]`)
  console.log(`   ${content}${msg.content?.length > 100 ? '...' : ''}`)
  if (msg.toolCalls && msg.toolCalls.length > 0) {
    msg.toolCalls.forEach(tc => {
      console.log(`   🔧 Tool: ${tc.function?.name}`)
    })
  }
  console.log()
})

// Get tasks
const tasks = db.tasks.getTasks(latestTopic.id)
console.log()
console.log('📋 任务列表:')
console.log('-'.repeat(80))
tasks.forEach((task, i) => {
  console.log(`${i + 1}. ${task.title}`)
  console.log(`   状态: ${task.status}`)
  console.log(`   创建时间: ${new Date(task.createdAt).toLocaleString()}`)
  
  // Get steps
  const steps = db.taskSteps.getTaskSteps(task.id)
  if (steps.length > 0) {
    console.log(`   步骤 (${steps.length}):`)
    steps.slice(-5).forEach(step => {
      const icon = step.status === 'completed' ? '✅' : step.status === 'failed' ? '❌' : '⏳'
      console.log(`     ${icon} [${step.type}] ${step.title}`)
      if (step.status === 'failed' && step.rawOutput) {
        console.log(`        错误: ${step.rawOutput.slice(0, 100)}`)
      }
    })
  }
  console.log()
})

// Summary
console.log('📊 统计摘要:')
console.log('-'.repeat(80))
console.log(`总消息数: ${messages.length}`)
console.log(`总任务数: ${tasks.length}`)
console.log(`完成的任务: ${tasks.filter(t => t.status === 'completed').length}`)
console.log(`失败的任务: ${tasks.filter(t => t.status === 'failed').length}`)
console.log(`运行中的任务: ${tasks.filter(t => t.status === 'running').length}`)
