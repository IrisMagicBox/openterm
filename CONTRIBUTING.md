# Contributing

Thanks for helping improve OpenTerm. The project is focused on terminal-heavy workflows, so the best contributions are grounded in real command-line usage.

## Before You Start

- Keep changes focused and easy to review.
- Prefer existing project patterns over new abstractions.
- Avoid committing local drafts, planning notes, logs, databases, or generated output.
- Be careful with terminal, SSH, file transfer, and port forwarding behavior because these areas can affect user machines and remote hosts.

## Development

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npm run dev
```

Run checks:

```bash
npm run typecheck
npm test
```

## Pull Requests

Please include:

- what changed;
- why it changed;
- how you tested it;
- any terminal, SSH, file transfer, port forwarding, or Agent-control risks reviewers should check.

## Commit Style

Use clear, English commit subjects. Examples:

- `feat: add terminal session recovery`
- `fix: preserve agent pause state`
- `chore: ignore local planning artifacts`

## Code Of Conduct

Participation in this project is covered by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
