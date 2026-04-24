# Development Guide

This guide covers the common commands for working on OpenTerm locally.

## Install

```bash
npm install
```

## Run The App

```bash
npm run dev
```

## Check The Code

Run type checks:

```bash
npm run typecheck
```

Run tests:

```bash
npm test
```

Run lint:

```bash
npm run lint
```

Format files:

```bash
npm run format
```

## Build

Build the app:

```bash
npm run build
```

Create platform packages:

```bash
npm run build:mac
npm run build:win
npm run build:linux
```

## Contribution Flow

1. Create a focused branch.
2. Keep changes scoped to one feature or fix.
3. Add or update tests when behavior changes.
4. Run `npm run typecheck` and `npm test`.
5. Open a pull request with a clear description of the change and any remaining risks.

For manual terminal and Agent workflow checks, see [testing.md](testing.md).

For more details, see [CONTRIBUTING.md](../CONTRIBUTING.md).
