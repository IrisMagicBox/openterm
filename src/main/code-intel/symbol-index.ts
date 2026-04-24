import fs from 'fs'
import path from 'path'

export type CodeIntelAction = 'symbols' | 'definition' | 'references' | 'diagnostics'

export interface WorkspaceSymbol {
  name: string
  kind: string
  filePath: string
  line: number
  column: number
  signature: string
}

export interface CodeReference {
  filePath: string
  line: number
  column: number
  preview: string
}

export interface CodeIntelOptions {
  rootPath: string
  query?: string
  maxResults?: number
}

const DEFAULT_MAX_RESULTS = 80
const MAX_FILES = 2500
const MAX_FILE_BYTES = 1_000_000
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.turbo',
  'target'
])
const SUPPORTED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.cs'
])

const SYMBOL_PATTERNS: Array<{ kind: string; regex: RegExp }> = [
  { kind: 'class', regex: /^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/ },
  { kind: 'interface', regex: /^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/ },
  { kind: 'type', regex: /^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/ },
  {
    kind: 'function',
    regex: /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/
  },
  {
    kind: 'function',
    regex: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/
  },
  { kind: 'method', regex: /^\s*(?:public\s+|private\s+|protected\s+)?([A-Za-z_$][\w$]*)\s*\(/ },
  { kind: 'function', regex: /^\s*def\s+([A-Za-z_][\w]*)\s*\(/ },
  { kind: 'class', regex: /^\s*class\s+([A-Za-z_][\w]*)\s*[:(]/ },
  { kind: 'function', regex: /^\s*func\s+(?:\([^)]+\)\s*)?([A-Za-z_][\w]*)\s*\(/ },
  { kind: 'function', regex: /^\s*fn\s+([A-Za-z_][\w]*)\s*\(/ }
]

export function collectWorkspaceSymbols(options: CodeIntelOptions): WorkspaceSymbol[] {
  const rootPath = resolveRoot(options.rootPath)
  const query = normalizeQuery(options.query)
  const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS
  const symbols: WorkspaceSymbol[] = []

  for (const filePath of walkFiles(rootPath)) {
    const text = safeReadText(filePath)
    if (text === undefined) continue

    const lines = text.split(/\r?\n/)
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index]
      const symbol = extractSymbol(line)
      if (!symbol) continue
      if (query && !symbol.name.toLowerCase().includes(query)) continue

      symbols.push({
        ...symbol,
        filePath,
        line: index + 1,
        column: Math.max(1, line.indexOf(symbol.name) + 1),
        signature: line.trim()
      })

      if (symbols.length >= maxResults) return symbols
    }
  }

  return symbols
}

export function findDefinitions(options: CodeIntelOptions): WorkspaceSymbol[] {
  const query = normalizeQuery(options.query)
  if (!query) return []
  return collectWorkspaceSymbols(options).filter((symbol) => symbol.name.toLowerCase() === query)
}

export function findReferences(options: CodeIntelOptions): CodeReference[] {
  const rootPath = resolveRoot(options.rootPath)
  const query = options.query?.trim()
  if (!query) return []

  const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS
  const references: CodeReference[] = []
  for (const filePath of walkFiles(rootPath)) {
    const text = safeReadText(filePath)
    if (text === undefined) continue

    const lines = text.split(/\r?\n/)
    for (let index = 0; index < lines.length; index++) {
      const column = lines[index].indexOf(query)
      if (column === -1) continue
      references.push({
        filePath,
        line: index + 1,
        column: column + 1,
        preview: lines[index].trim()
      })
      if (references.length >= maxResults) return references
    }
  }

  return references
}

function extractSymbol(line: string): Pick<WorkspaceSymbol, 'name' | 'kind'> | undefined {
  for (const pattern of SYMBOL_PATTERNS) {
    const match = line.match(pattern.regex)
    if (match?.[1]) return { name: match[1], kind: pattern.kind }
  }
  return undefined
}

function* walkFiles(rootPath: string): Generator<string> {
  const stack = [rootPath]
  let visited = 0

  while (stack.length > 0 && visited < MAX_FILES) {
    const current = stack.pop()
    if (!current) continue

    let stat: fs.Stats
    try {
      stat = fs.statSync(current)
    } catch {
      continue
    }

    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(path.basename(current))) continue
      for (const entry of fs.readdirSync(current)) {
        stack.push(path.join(current, entry))
      }
      continue
    }

    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) continue
    if (!SUPPORTED_EXTENSIONS.has(path.extname(current))) continue
    visited++
    yield current
  }
}

function resolveRoot(rootPath: string): string {
  const resolved = path.resolve(rootPath)
  const stat = fs.statSync(resolved)
  return stat.isDirectory() ? resolved : path.dirname(resolved)
}

function safeReadText(filePath: string): string | undefined {
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return undefined
  }
}

function normalizeQuery(query: string | undefined): string {
  return query?.trim().toLowerCase() ?? ''
}
