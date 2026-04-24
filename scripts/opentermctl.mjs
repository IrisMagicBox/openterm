#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const cliEntry = path.resolve(dirname, '..', 'src', 'cli', 'index.ts')
const result = spawnSync(electron, ['-r', 'tsx/cjs', cliEntry, ...process.argv.slice(2)], {
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1'
  },
  stdio: 'inherit'
})

if (result.error) {
  console.error(`opentermctl launcher failed: ${result.error.message}`)
  process.exit(1)
}

if (result.signal) {
  console.error(`opentermctl stopped by signal: ${result.signal}`)
  process.exit(1)
}

process.exit(result.status ?? 0)
