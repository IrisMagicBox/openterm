import { getDatabase, initializeSchema } from './connection'
import { parseJSON } from './mappers'

import { HostRepository } from './repositories/host-repository'
import { TopicRepository } from './repositories/topic-repository'
import { MessageRepository } from './repositories/message-repository'
import { TaskRepository } from './repositories/task-repository'
import { TaskStepRepository } from './repositories/task-step-repository'
import { AgentRunRepository } from './repositories/agent-run-repository'
import { AgentPartRepository } from './repositories/agent-part-repository'
import { ApprovalRepository } from './repositories/approval-repository'
import { ArtifactRepository } from './repositories/artifact-repository'
import { MemoryRepository } from './repositories/memory-repository'
import { GlobalMemoryRepository } from './repositories/global-memory-repository'
import { ModelSettingsRepository } from './repositories/model-settings-repository'
import { PermissionRepository } from './repositories/permission-repository'
import { ProviderRepository } from './repositories/provider-repository'
import { ModelRepository } from './repositories/model-repository'
import { CommandPatternRepository } from './repositories/command-pattern-repository'
import { TerminalSessionRepository } from './repositories/terminal-session-repository'
import { TerminalIORepository } from './repositories/terminal-io-repository'

class AppDatabase {
  readonly hosts: HostRepository
  readonly topics: TopicRepository
  readonly messages: MessageRepository
  readonly tasks: TaskRepository
  readonly taskSteps: TaskStepRepository
  readonly agentRuns: AgentRunRepository
  readonly agentParts: AgentPartRepository
  readonly approvals: ApprovalRepository
  readonly artifacts: ArtifactRepository
  readonly memories: MemoryRepository
  readonly globalMemory: GlobalMemoryRepository
  readonly modelSettings: ModelSettingsRepository
  readonly permissions: PermissionRepository
  readonly providers: ProviderRepository
  readonly models: ModelRepository
  readonly commandPatterns: CommandPatternRepository
  readonly terminalSessions: TerminalSessionRepository
  readonly terminalIO: TerminalIORepository

  constructor() {
    const db = getDatabase()
    initializeSchema(db)

    this.hosts = new HostRepository(db)
    this.topics = new TopicRepository(db)
    this.messages = new MessageRepository(db)
    this.tasks = new TaskRepository(db)
    this.taskSteps = new TaskStepRepository(db)
    this.agentRuns = new AgentRunRepository(db)
    this.agentParts = new AgentPartRepository(db)
    this.approvals = new ApprovalRepository(db)
    this.artifacts = new ArtifactRepository(db)
    this.memories = new MemoryRepository(db)
    this.globalMemory = new GlobalMemoryRepository(db)
    this.modelSettings = new ModelSettingsRepository(db)
    this.permissions = new PermissionRepository(db)
    this.providers = new ProviderRepository(db)
    this.models = new ModelRepository(db)
    this.commandPatterns = new CommandPatternRepository(db)
    this.terminalSessions = new TerminalSessionRepository(db)
    this.terminalIO = new TerminalIORepository(db)
  }
}

const db = new AppDatabase()

export const initializeDB = (): void => {
  // No-op: schema is initialized in AppDatabase constructor.
  // Kept for backward compatibility — old db.ts required explicit initializeDB() call.
}

export { parseJSON }

export const hostDB = db.hosts
export const topicDB = db.topics
export const messageDB = db.messages
export const taskDB = db.tasks
export const taskStepDB = db.taskSteps
export const agentRunDB = db.agentRuns
export const agentPartDB = db.agentParts
export const approvalDB = db.approvals
export const artifactDB = db.artifacts
export const memoryDB = db.memories
export const globalMemoryDB = db.globalMemory
export const modelSettingsDB = db.modelSettings
export const permissionDB = db.permissions
export const providerDB = db.providers
export const modelDB = db.models
export const commandPatternDB = db.commandPatterns
export const terminalSessionDB = db.terminalSessions
export const terminalIODB = db.terminalIO

export { db }
export * from './conversation-diagnostics'
