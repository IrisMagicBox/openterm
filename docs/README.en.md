# OpenTerm Documentation

OpenTerm is a multi-terminal management Agent for developers. It brings local terminals, remote hosts, file transfer, port forwarding, and an AI Agent into one desktop workspace so command-line work can feel like collaborating with a capable terminal partner.

## The Problem

Developer machines often contain many CLI tools: terminal assistant, terminal assistant, terminal assistant, demo-cli, package managers, cloud CLIs, build tools, deployment scripts, and custom internal commands. The problem is not just running one command. It is:

- switching between many terminal sessions;
- keeping context across local and remote hosts;
- installing, configuring, logging in, debugging, and retrying;
- using separate tools for files and port forwarding;
- asking an AI Agent for advice but still doing all terminal work manually;
- deciding what to do next after a command fails.

OpenTerm brings the Agent into the real terminal workflow. The Agent can run commands in a co-driving terminal, observe output, and continue the next step while you can pause, take over, or operate manually at any time.

## Core Capabilities

### Multi-terminal Management

OpenTerm can manage local and remote terminal sessions together. Sessions can be organized around tasks, switched, restored, renamed, and pinned.

### Agent Co-driving Terminal

The Agent is not just a chat response. It can run commands, react to output, and share the same working surface with you. Think of it as an observable, pausable, and controllable terminal collaborator.

### CLI Tool Orchestration

OpenTerm is useful for driving tools such as terminal assistant, terminal assistant, terminal assistant, demo-cli, package managers, cloud CLIs, build scripts, and project commands. The Agent can help configure, execute, debug, and finish command-line tasks.

### Remote Host Workflow

Connect to remote hosts over SSH and keep terminals, files, port forwards, and task context inside one workspace.

### File Transfer And Browsing

Browse remote files, upload, download, and operate through file panels without constantly switching between a terminal, SFTP client, and file manager.

### Port Forwarding

Manage port forwards for remote service debugging, local previews, and development connectivity.

### Traditional Terminal Experience

OpenTerm can still be used as a regular terminal. You can type commands, inspect output, resize terminals, and manage sessions directly.

## Common Use Cases

- Running frontend, backend, database, logs, and build tasks at the same time.
- Asking the Agent to install a CLI, configure environment variables, or fix dependency issues.
- Connecting to a remote server, inspecting files, and forwarding a service to localhost.
- Letting the Agent watch command output and continue debugging a failure.
- Taking over terminal control whenever you want.
- Keeping multiple hosts, terminals, and task context in one workspace.

## How It Works

1. Add a local or remote host.
2. Create terminal sessions, or let the Agent create terminals for a task.
3. Describe the goal, such as “configure this CLI and get the project running.”
4. The Agent runs commands in the co-driving terminal and observes results.
5. You can pause, take over, inspect files, open port forwards, or switch terminals at any time.

## Safety And Control

OpenTerm is designed to enhance terminal workflows, not to blindly run every command on your behalf. For commands that change system state, access sensitive configuration, affect remote services, or delete data, review the context and goal before execution.

## More

- [中文文档](README.zh-CN.md)
- [Development guide](development.md)
- [Testing guide](testing.md)
- [Feedback guide](feedback.md)
- [Contributing](../CONTRIBUTING.md)
- [Security policy](../SECURITY.md)
- [License](../LICENSE)
