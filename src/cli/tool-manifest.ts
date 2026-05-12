export interface CliToolManifestItem {
  id: string
  category:
    | 'agent'
    | 'app'
    | 'diagnostics'
    | 'filesystem'
    | 'host'
    | 'memory'
    | 'notes'
    | 'settings'
    | 'terminal'
    | 'topic'
    | 'web'
  mode: 'read' | 'write' | 'interactive' | 'orchestration'
  requiresAppRuntime: boolean
  summary: string
}

export const CLI_TOOL_MANIFEST: CliToolManifestItem[] = [
  {
    id: 'opentermctl_app',
    category: 'app',
    mode: 'read',
    requiresAppRuntime: false,
    summary: 'Check OpenTerm app status, control socket availability, and protocol version.'
  },
  {
    id: 'opentermctl_topics',
    category: 'topic',
    mode: 'write',
    requiresAppRuntime: true,
    summary:
      'Live-required topic mutations plus DB-safe topic list/show inspection through opentermctl topics.'
  },
  {
    id: 'opentermctl_hosts',
    category: 'host',
    mode: 'write',
    requiresAppRuntime: true,
    summary: 'Live-first host listing/inspection and live-required local or SSH host mutations.'
  },
  {
    id: 'opentermctl_chat',
    category: 'agent',
    mode: 'orchestration',
    requiresAppRuntime: false,
    summary:
      'Send messages through the live Agent runtime when available; inspect history and watch run parts from the DB.'
  },
  {
    id: 'opentermctl_runs',
    category: 'agent',
    mode: 'orchestration',
    requiresAppRuntime: false,
    summary:
      'DB-safe run list/show/parts/watch plus live-required cancel and resume controls.'
  },
  {
    id: 'opentermctl_approvals',
    category: 'agent',
    mode: 'interactive',
    requiresAppRuntime: true,
    summary: 'List, approve, and reject pending agent approval requests.'
  },
  {
    id: 'opentermctl_tasks',
    category: 'agent',
    mode: 'read',
    requiresAppRuntime: false,
    summary:
      'Inspect legacy tasks and TaskStep compatibility data from the database; prefer runs parts for new runtime timelines.'
  },
  {
    id: 'opentermctl_artifacts',
    category: 'agent',
    mode: 'read',
    requiresAppRuntime: false,
    summary:
      'List, show, and export agent-created artifacts from the database or exported files.'
  },
  {
    id: 'opentermctl_terminal',
    category: 'terminal',
    mode: 'interactive',
    requiresAppRuntime: true,
    summary:
      'Live-first terminal reads with DB fallback, plus live-required open/input/resize/close/execute controls.'
  },
  {
    id: 'opentermctl_files',
    category: 'filesystem',
    mode: 'write',
    requiresAppRuntime: true,
    summary: 'Operate local files and live SFTP sessions, including host-to-host transfers.'
  },
  {
    id: 'opentermctl_settings',
    category: 'settings',
    mode: 'write',
    requiresAppRuntime: true,
    summary: 'Manage providers, models, model settings, and permission settings.'
  },
  {
    id: 'opentermctl_memory',
    category: 'memory',
    mode: 'write',
    requiresAppRuntime: true,
    summary: 'Manage scoped memories and global memory facts.'
  },
  {
    id: 'opentermctl_history_sessions_debug',
    category: 'diagnostics',
    mode: 'read',
    requiresAppRuntime: false,
    summary:
      'Search DB command history, inspect live-first recoverable sessions, and stream live-required debug logs.'
  },
  {
    id: 'execute_command',
    category: 'terminal',
    mode: 'interactive',
    requiresAppRuntime: true,
    summary: 'Run a bounded command in an agent terminal session.'
  },
  {
    id: 'manage_terminal',
    category: 'terminal',
    mode: 'interactive',
    requiresAppRuntime: true,
    summary: 'Create, close, and control terminal sessions.'
  },
  {
    id: 'observe_terminal',
    category: 'terminal',
    mode: 'read',
    requiresAppRuntime: true,
    summary: 'Read the visible state of a terminal session.'
  },
  {
    id: 'send_terminal_keys',
    category: 'terminal',
    mode: 'interactive',
    requiresAppRuntime: true,
    summary: 'Send keystrokes into an existing terminal session.'
  },
  {
    id: 'wait_terminal_activity',
    category: 'terminal',
    mode: 'read',
    requiresAppRuntime: true,
    summary: 'Wait for terminal output or idle transitions.'
  },
  {
    id: 'wait_terminal_text',
    category: 'terminal',
    mode: 'read',
    requiresAppRuntime: true,
    summary: 'Wait until terminal output contains target text.'
  },
  {
    id: 'list_terminals',
    category: 'terminal',
    mode: 'read',
    requiresAppRuntime: true,
    summary: 'List terminal sessions known to the current topic.'
  },
  {
    id: 'get_deleted_terminals',
    category: 'terminal',
    mode: 'read',
    requiresAppRuntime: false,
    summary: 'Inspect soft-deleted terminal sessions from the database.'
  },
  {
    id: 'search_terminal_history',
    category: 'terminal',
    mode: 'read',
    requiresAppRuntime: false,
    summary: 'Search recorded terminal input and output.'
  },
  {
    id: 'list_hosts',
    category: 'host',
    mode: 'read',
    requiresAppRuntime: false,
    summary: 'List configured local and SSH hosts.'
  },
  {
    id: 'manage_host',
    category: 'host',
    mode: 'write',
    requiresAppRuntime: false,
    summary: 'Create, update, or remove host records.'
  },
  {
    id: 'manage_port_forward',
    category: 'host',
    mode: 'interactive',
    requiresAppRuntime: true,
    summary: 'Open and close SSH port forwards.'
  },
  {
    id: 'read_file',
    category: 'filesystem',
    mode: 'read',
    requiresAppRuntime: false,
    summary: 'Read a file from local or remote filesystem context.'
  },
  {
    id: 'write_file',
    category: 'filesystem',
    mode: 'write',
    requiresAppRuntime: false,
    summary: 'Write file contents through the tool permission layer.'
  },
  {
    id: 'edit',
    category: 'filesystem',
    mode: 'write',
    requiresAppRuntime: false,
    summary: 'Apply targeted text edits to a file.'
  },
  {
    id: 'grep',
    category: 'filesystem',
    mode: 'read',
    requiresAppRuntime: false,
    summary: 'Search file contents with ripgrep-style filters.'
  },
  {
    id: 'glob',
    category: 'filesystem',
    mode: 'read',
    requiresAppRuntime: false,
    summary: 'Find files by glob pattern.'
  },
  {
    id: 'ls',
    category: 'filesystem',
    mode: 'read',
    requiresAppRuntime: false,
    summary: 'List directory entries.'
  },
  {
    id: 'lsp',
    category: 'filesystem',
    mode: 'read',
    requiresAppRuntime: false,
    summary: 'Query language-server style code intelligence.'
  },
  {
    id: 'search_memory',
    category: 'memory',
    mode: 'read',
    requiresAppRuntime: false,
    summary: 'Search topic and host memory.'
  },
  {
    id: 'search_topics',
    category: 'diagnostics',
    mode: 'read',
    requiresAppRuntime: false,
    summary: 'Search saved topics and conversation records.'
  },
  {
    id: 'websearch',
    category: 'web',
    mode: 'read',
    requiresAppRuntime: false,
    summary: 'Search the web through Exa hosted MCP without requiring an API key.'
  },
  {
    id: 'read_notes',
    category: 'notes',
    mode: 'read',
    requiresAppRuntime: false,
    summary: 'Read agent notes for a topic or host.'
  },
  {
    id: 'write_notes',
    category: 'notes',
    mode: 'write',
    requiresAppRuntime: false,
    summary: 'Persist agent notes for future runs.'
  },
  {
    id: 'task',
    category: 'agent',
    mode: 'orchestration',
    requiresAppRuntime: true,
    summary: 'Delegate work to a child agent run.'
  }
]
