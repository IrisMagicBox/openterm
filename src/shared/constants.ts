/**
 * Shared constants for OpenTerm
 * Cross-boundary constants accessible by both main and renderer processes
 */

// Default AI model settings (from db.ts)
export const DEFAULT_MODEL = 'gpt-4o-mini'
export const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

// SSH default port (used in both main and renderer)
export const DEFAULT_SSH_PORT = 22

// Internal topic used to persist standalone workspace terminals.
export const WORKSPACE_TERMINALS_TOPIC_ID = '__workspace_terminals__'
