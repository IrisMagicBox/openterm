# OpenTerm CLI Controls

`opentermctl` is the local control surface for human terminal work and agent self-feedback loops.

```bash
npm run cli -- <command> [options]
```

The launcher runs TypeScript through Electron's Node mode so native modules use the same ABI as the desktop app.

## Runtime Model

Commands are live-first. When the desktop app is running, commands use the local control socket and execute against the same main-process services as the UI. When the app is not running, read-only commands fall back to `openterm.db`; runtime commands such as terminal input, SFTP, port forwarding, approvals, and run cancellation require the app.

Common options:

- `--json`: machine-readable output.
- `--db <path>`: read a specific database.
- `--live-only`: fail instead of DB fallback.
- `--timeout-ms <ms>`: override command/watch timeout.

## Command Surface

- `app status|ping`
- `hosts list|show|create|delete`
- `topics list|show|create|rename|delete|model|hosts`
- `chat send|history|watch`
- `runs list|show|parts|cancel|resume|watch`
- `approvals list|show|approve|reject`
- `tasks list|show|steps`
- `artifacts list|show|export`
- `terminal list|count|output|open|input|resize|attach|close|rename|pin|pause|execute`
- `files local|sftp|transfer`
- `pf list|create|close`
- `settings providers|models|permissions|model-settings`
- `memory list|create|update|delete|global`
- `history search`
- `sessions recoverable|watch`
- `debug logs --follow`
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
npm run cli -- runs cancel latest
npm run cli -- approvals list --status pending
npm run cli -- approvals approve latest --always-allow
npm run cli -- terminal open --topic latest --host local --name work
npm run cli -- terminal input latest $'pwd\n'
npm run cli -- terminal execute latest "npm test"
npm run cli -- terminal output latest --topic latest --tail 40
npm run cli -- files local ls .
npm run cli -- files sftp connect <host-id>
npm run cli -- pf create --host <host-id> --local-port 15432 --remote-host 127.0.0.1 --remote-port 5432
npm run cli -- settings providers list --json
npm run cli -- settings permissions set --require-confirmation true
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
