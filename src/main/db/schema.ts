export const BASE_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS hosts (
    id TEXT PRIMARY KEY,
    alias TEXT NOT NULL,
    ip TEXT NOT NULL,
    port INTEGER NOT NULL,
    username TEXT NOT NULL,
    password TEXT,
    keyPath TEXT,
    tags TEXT,
    createdAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS topics (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    hostIds TEXT NOT NULL,
    lastMessageAt INTEGER NOT NULL,
    createdAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    topicId TEXT NOT NULL,
    runId TEXT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    thought TEXT,
    toolCalls TEXT,
    toolCallId TEXT,
    name TEXT,
    metadata TEXT,
    timestamp INTEGER NOT NULL,
    FOREIGN KEY (topicId) REFERENCES topics(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS model_settings (
    id TEXT PRIMARY KEY,
    apiKey TEXT NOT NULL,
    baseURL TEXT NOT NULL,
    model TEXT NOT NULL,
    updatedAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    apiKey TEXT,
    apiHost TEXT,
    apiVersion TEXT,
    enabled INTEGER DEFAULT 1,
    isSystem INTEGER DEFAULT 0,
    config TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS models (
    id TEXT PRIMARY KEY,
    providerId TEXT NOT NULL,
    providerModelId TEXT,
    name TEXT NOT NULL,
    group_name TEXT,
    capabilities TEXT,
    endpointType TEXT,
    pricing TEXT,
    createdAt INTEGER NOT NULL,
    FOREIGN KEY (providerId) REFERENCES providers(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS permissions (
    id TEXT PRIMARY KEY,
    requireConfirmation INTEGER DEFAULT 1,
    autoExecuteSafeOperations INTEGER DEFAULT 1,
    updatedAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    topicId TEXT NOT NULL,
    title TEXT NOT NULL,
    goal TEXT NOT NULL,
    status TEXT NOT NULL,
    summary TEXT,
    selectedProviderId TEXT,
    selectedModelId TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    FOREIGN KEY (topicId) REFERENCES topics(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS task_steps (
    id TEXT PRIMARY KEY,
    taskId TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    hostId TEXT,
    title TEXT,
    content TEXT NOT NULL,
    rawOutput TEXT,
    metadata TEXT,
    startedAt INTEGER,
    endedAt INTEGER,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (hostId) REFERENCES hosts(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    topicId TEXT NOT NULL,
    taskId TEXT NOT NULL,
    parentRunId TEXT,
    parentPartId TEXT,
    agentName TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    goal TEXT NOT NULL,
    providerId TEXT,
    modelId TEXT,
    usage TEXT,
    error TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    completedAt INTEGER,
    FOREIGN KEY (topicId) REFERENCES topics(id) ON DELETE CASCADE,
    FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (parentRunId) REFERENCES agent_runs(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS agent_parts (
    id TEXT PRIMARY KEY,
    runId TEXT NOT NULL,
    messageId TEXT,
    parentPartId TEXT,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    role TEXT,
    toolName TEXT,
    toolCallId TEXT,
    hostId TEXT,
    sessionId TEXT,
    input TEXT,
    output TEXT,
    error TEXT,
    metadata TEXT,
    orderIndex INTEGER NOT NULL,
    startedAt INTEGER,
    endedAt INTEGER,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    FOREIGN KEY (runId) REFERENCES agent_runs(id) ON DELETE CASCADE,
    FOREIGN KEY (messageId) REFERENCES messages(id) ON DELETE SET NULL,
    FOREIGN KEY (parentPartId) REFERENCES agent_parts(id) ON DELETE CASCADE,
    FOREIGN KEY (hostId) REFERENCES hosts(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_agent_runs_topic ON agent_runs(topicId, createdAt);
  CREATE INDEX IF NOT EXISTS idx_agent_runs_task ON agent_runs(taskId, createdAt);
  CREATE INDEX IF NOT EXISTS idx_agent_runs_parent ON agent_runs(parentRunId);
  CREATE INDEX IF NOT EXISTS idx_agent_parts_run ON agent_parts(runId, orderIndex);
  CREATE INDEX IF NOT EXISTS idx_agent_parts_parent ON agent_parts(parentPartId);
  CREATE INDEX IF NOT EXISTS idx_agent_parts_tool_call ON agent_parts(toolCallId);

  CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    taskId TEXT NOT NULL,
    stepId TEXT,
    command TEXT NOT NULL,
    riskLevel TEXT NOT NULL,
    riskCategory TEXT,
    commandPattern TEXT,
    requiresVerification INTEGER DEFAULT 0,
    reason TEXT,
    status TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    respondedAt INTEGER,
    FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (stepId) REFERENCES task_steps(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY,
    taskId TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS terminal_sessions (
    id TEXT PRIMARY KEY,
    topicId TEXT NOT NULL,
    hostId TEXT NOT NULL,
    hostAlias TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    status TEXT NOT NULL DEFAULT 'active',
    shellType TEXT,
    shellIntegrationReady INTEGER DEFAULT 0,
    createdAt INTEGER NOT NULL,
    closedAt INTEGER,
    FOREIGN KEY (topicId) REFERENCES topics(id) ON DELETE CASCADE,
    FOREIGN KEY (hostId) REFERENCES hosts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS terminal_io (
    id TEXT PRIMARY KEY,
    sessionId TEXT NOT NULL,
    topicId TEXT NOT NULL,
    hostId TEXT NOT NULL,
    type TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'agent',
    content TEXT NOT NULL,
    exitCode INTEGER,
    durationMs INTEGER,
    relatedInputId TEXT,
    isStreaming INTEGER DEFAULT 0,
    chunkIndex INTEGER DEFAULT 0,
    isTruncated INTEGER DEFAULT 0,
    cwd TEXT,
    taskId TEXT,
    stepId TEXT,
    timestamp INTEGER NOT NULL,
    FOREIGN KEY (sessionId) REFERENCES terminal_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (topicId) REFERENCES topics(id) ON DELETE CASCADE,
    FOREIGN KEY (hostId) REFERENCES hosts(id) ON DELETE CASCADE,
    FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE SET NULL,
    FOREIGN KEY (stepId) REFERENCES task_steps(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    scope TEXT NOT NULL DEFAULT 'global',
    content TEXT NOT NULL,
    hostId TEXT,
    topicId TEXT,
    sourceTaskId TEXT,
    confidence REAL DEFAULT 0.7,
    importance INTEGER DEFAULT 3,
    lastUsedAt INTEGER,
    disabled INTEGER DEFAULT 0,
    timestamp INTEGER NOT NULL,
    FOREIGN KEY (hostId) REFERENCES hosts(id) ON DELETE SET NULL,
    FOREIGN KEY (topicId) REFERENCES topics(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS command_patterns (
    id TEXT PRIMARY KEY,
    hostId TEXT NOT NULL,
    commandPattern TEXT NOT NULL,
    approvalCount INTEGER DEFAULT 0,
    rejectionCount INTEGER DEFAULT 0,
    trustLevel TEXT DEFAULT 'untrusted',
    lastSeen INTEGER NOT NULL,
    createdAt INTEGER NOT NULL
  );
`
