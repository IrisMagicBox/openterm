# Security Policy

OpenTerm interacts with local terminals, SSH sessions, file transfer, port forwarding, and AI-assisted command execution. Please treat security reports seriously and avoid public disclosure until a fix is available.

## Reporting A Vulnerability

Do not open a public issue for security vulnerabilities.

Please report privately with:

- a clear description of the issue;
- steps to reproduce;
- affected platform and commit or version;
- whether local terminal, SSH, file transfer, port forwarding, or Agent execution is involved;
- any logs or screenshots with credentials and secrets removed.

## Scope

Security-sensitive areas include:

- unintended command execution;
- privilege or permission bypass;
- exposure of API keys, tokens, SSH credentials, or terminal output;
- unsafe file upload, download, or path handling;
- port forwarding behavior that exposes services unexpectedly;
- Agent behavior that hides, misrepresents, or continues unsafe terminal actions.

## Safe Handling

When testing or reporting issues, avoid destructive commands, avoid touching third-party systems without permission, and remove secrets from logs before sharing them.
