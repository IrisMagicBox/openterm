# OpenTerm CLI Controls

`opentermctl` is the local control surface for human terminal work and agent self-feedback loops.

```bash
npm run cli -- <command> [options]
```

The launcher runs TypeScript through Electron's Node mode so native modules use the same ABI as the desktop app.

## Runtime Model

`opentermctl` has three runtime modes:

- Live app control: requires the desktop app and its local control socket. Mutations such as terminal input, SFTP, port forwarding, approvals, settings writes, memory writes, and run cancellation use the same main-process services as the UI.
- Live-first reads: ask the running app first, then fall back to `openterm.db` when the app is unavailable. Use `--live-only` when a stale DB snapshot would be misleading.
- Database inspection: reads `openterm.db` directly. Conversation diagnostics, topic summaries, run parts, artifacts, task compatibility views, and chat history are snapshot views.

`tasks steps` is a legacy TaskStep compatibility view. New runtime timelines live under `runs parts`.

Common options:

- `--json`: machine-readable output.
- `--db <path>`: read a specific database.
- `--live-only`: for live-first reads, fail instead of DB fallback.
- `--timeout-ms <ms>`: override command/watch timeout.

## Command Surface

Live app control:

- `app ping`
- `hosts create|delete`
- `topics create|rename|delete|model|hosts add|remove|set`
- `chat send`
- `runs cancel|resume`
- `approvals approve|reject`
- `terminal open|input|resize|attach|close|rename|pin|pause|execute`
- `files sftp|transfer`
- `pf list|create|close`
- `settings providers save|delete|test|fetch-models`
- `settings models save|delete`
- `settings permissions set`
- `settings model-settings save`
- `memory create|update|delete|global import|clear|fact`
- `debug logs --follow`

Live-first reads:

- `hosts list|show`
- `topics hosts list`
- `terminal list|count|output`
- `history search`
- `sessions recoverable|watch`

Database inspection:

- `topics list|show`
- `chat history|watch`
- `runs list|show|parts|watch`
- `approvals list|show`
- `tasks list|show|steps` (`steps` is legacy; prefer `runs parts`)
- `artifacts list|show|export`
- `settings providers|models list|show`
- `settings permissions get`
- `settings model-settings get`
- `memory list|global get`

Diagnostics and local utilities:

- `app status`
- `files local`
- `diagnose`, `doctor`, `run`, `tools list`

## Examples

```bash
npm run cli -- app status --json
npm run cli -- hosts list
npm run cli -- topics create "线上排障" --host local
npm run cli -- topics hosts add latest local
npm run cli -- chat send --new-topic --watch "检查当前项目状态"
npm run cli -- chat watch latest
npm run cli -- runs list --topic latest
npm run cli -- runs parts latest
npm run cli -- artifacts list
npm run cli -- runs cancel latest
npm run cli -- approvals list --status pending
npm run cli -- approvals approve latest --always-allow
npm run cli -- terminal open --topic latest --host local --name work
npm run cli -- terminal input latest $'pwd\n'
npm run cli -- terminal list --live-only
npm run cli -- terminal execute latest "npm test"
npm run cli -- terminal output latest --topic latest --tail 40
npm run cli -- files local ls .
npm run cli -- files sftp connect <host-id>
npm run cli -- pf create --host <host-id> --local-port 15432 --remote-host 127.0.0.1 --remote-port 5432
npm run cli -- settings providers list --json
npm run cli -- settings permissions set --mode auto_review
npm run cli -- memory list --topic latest
npm run cli -- memory global fact create --content "Prefer concise CLI diagnostics"
npm run cli -- history search "npm test"
npm run cli -- sessions recoverable
npm run cli -- debug logs --follow
npm run cli -- doctor --lint
```

Watch commands emit NDJSON: every line is a standalone JSON object, suitable for agents and scripts.

Database path resolution:

1. `--db <path>`
2. `OPENTERM_DB`
3. non-empty `./openterm.db`
4. platform application data path
