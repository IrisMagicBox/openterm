/**
 * Main process constants for OpenTerm
 * Hardcoded values extracted from main process files
 */

// Window dimensions (from index.ts)
export const WINDOW_DEFAULT_WIDTH = 1100
export const WINDOW_DEFAULT_HEIGHT = 750

// Provider connection timeout (from index.ts)
export const PROVIDER_CONNECTION_TIMEOUT_MS = 20000

// Terminal buffer sizes (from ssh.ts)
export const TERMINAL_BUFFER_SIZE = 2000
export const SSH_RAW_BUFFER_MAX = 10000
export const SSH_RAW_BUFFER_TRIM = 5000

// Terminal output and streaming (from terminal.ts)
export const MAX_OUTPUT_SIZE = 50000
export const STREAMING_CHUNK_SIZE = 10000
export const STREAMING_FLUSH_INTERVAL_MS = 5000
export const COMMAND_TIMEOUT_MS = 60000
export const RAW_BUFFER_MAX = 1000
export const RAW_BUFFER_TRIM = 500
export const TRUNCATION_HEAD_SIZE = 30000
export const TRUNCATION_TAIL_SIZE = 20000

// Local terminal (from local-terminal.ts)
export const LOCAL_BUFFER_MAX = 50000
export const LOCAL_BUFFER_TRIM = 30000
export const DEFAULT_TERMINAL_COLS = 80
export const DEFAULT_TERMINAL_ROWS = 24

// Agent runner (from AgentRunner.ts)
export const MAX_AGENT_TURNS = 100
export const AGENT_TEMPERATURE = 0.1
export const TASK_SUMMARY_MAX_LENGTH = 500

// Memory manager (from MemoryManager.ts)
export const DISTILLATION_THRESHOLD = 500
export const DISTILLATION_MAX_LENGTH = 5000
export const REFLECTION_STEPS_LIMIT = 20
export const REFLECTION_STEP_CONTENT_MAX = 500

// Database / Trust system (from db.ts)
export const TRUST_APPROVAL_THRESHOLD = 3
export const TRUST_FAMILIAR_THRESHOLD = 2
export const TRUST_REJECTION_THRESHOLD = 1
export const MEMORY_SEARCH_DEFAULT_LIMIT = 5
export const MEMORY_SEARCH_QUERY_LIMIT = 10
export const MEMORY_SEARCH_SQL_LIMIT = 20
export const TERMINAL_IO_SESSION_LIMIT = 100
export const TERMINAL_IO_TOPIC_LIMIT = 200
export const RECENT_INPUTS_LIMIT = 20

// Tool output truncation (from truncation.ts)
export const TRUNCATION_MAX_LINES = 2000
export const TRUNCATION_MAX_BYTES = 51200 // 50KB
export const TRUNCATION_DIR_NAME = 'truncation'

// Context window / token budget (from token-counter.ts)
// Default context window for common models (e.g., GPT-4o, Claude Sonnet)
export const CONTEXT_WINDOW_TOKENS = 128_000
// Tokens reserved for model output generation
export const CONTEXT_RESERVE_TOKENS = 4_096
// When pruning, protect the most recent N tokens of tool outputs
export const CONTEXT_PRUNE_PROTECT_TOKENS = 40_000
// Only prune if we can recover at least this many tokens
export const CONTEXT_PRUNE_MINIMUM_TOKENS = 20_000
// Auto-compact: trigger when context usage reaches this fraction of usable budget
export const AUTO_COMPACT_THRESHOLD = 0.9
