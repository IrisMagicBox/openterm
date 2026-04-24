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
    summary: 'Create, rename, delete, model-select, and bind hosts for topics.'
  },
  {
    id: 'opentermctl_hosts',
    category: 'host',
    mode: 'write',
    requiresAppRuntime: true,
    summary: 'List, inspect, create, and delete local or SSH host records.'
  },
  {
    id: 'opentermctl_chat',
    category: 'agent',
    mode: 'orchestration',
    requiresAppRuntime: false,
    summary: 'Send messages, read chat history, and watch run events from the CLI.'
  },
  {
    id: 'opentermctl_runs',
    category: 'agent',
    mode: 'orchestration',
    requiresAppRuntime: false,
    summary: 'List, inspect, cancel, resume, and watch agent runs.'
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
    summary: 'Inspect tasks and task steps from the OpenTerm database.'
  },
  {
    id: 'opentermctl_artifacts',
    category: 'agent',
    mode: 'read',
    requiresAppRuntime: false,
    summary: 'List, show, and export agent artifacts.'
  },
  {
    id: 'opentermctl_terminal',
    category: 'terminal',
    mode: 'interactive',
    requiresAppRuntime: true,
    summary: 'Open, input, resize, close, rename, pin, pause, execute, and observe terminals.'
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
    summary: 'Search command history, list recoverable sessions, and stream live debug logs.'
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
