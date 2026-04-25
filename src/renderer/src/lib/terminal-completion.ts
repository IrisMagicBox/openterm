export type TerminalCompletionSource = 'history' | 'common' | 'model'
export type TerminalCompletionMode = 'append' | 'replace'
export type TerminalCompletionConfidence = 'low' | 'medium' | 'high'

export interface TerminalCompletionResult {
  input: string
  value: string
  suffix: string
  insertText: string
  source: TerminalCompletionSource
  mode: TerminalCompletionMode
  confidence: TerminalCompletionConfidence
  displayLabel: string
  alternatives: Array<{
    value: string
    source: TerminalCompletionSource
    mode: TerminalCompletionMode
    confidence: TerminalCompletionConfidence
    displayLabel: string
  }>
}

const COMMON_COMPLETIONS = [
  'cd',
  'clear',
  'cp',
  'cat',
  'curl',
  'docker',
  'docker build',
  'docker compose',
  'docker compose logs',
  'docker compose ps',
  'docker compose up',
  'docker exec -it',
  'docker image ls',
  'docker images',
  'docker logs',
  'docker ps',
  'docker ps -a',
  'docker pull',
  'docker rm',
  'docker rmi',
  'docker run',
  'docker stop',
  'find',
  'git',
  'git add',
  'git checkout',
  'git commit',
  'git diff',
  'git log',
  'git pull',
  'git push',
  'git status',
  'grep',
  'kubectl get pod',
  'kubectl get pods',
  'kubectl get svc',
  'kubectl get deploy',
  'kubectl describe pod',
  'kubectl logs',
  'kubectl apply -f',
  'kubectl delete pod',
  'kubectl',
  'less',
  'ls',
  'mkdir',
  'mv',
  'node',
  'npm',
  'npm install',
  'npm run',
  'npm test',
  'npx',
  'pnpm',
  'pnpm install',
  'pnpm test',
  'pwd',
  'python',
  'python3',
  'rg',
  'rm',
  'scp',
  'ssh',
  'tail',
  'touch',
  'yarn'
]

interface CompletionCandidate {
  value: string
  source: Exclude<TerminalCompletionSource, 'model'>
}

interface ScoredCompletionCandidate extends CompletionCandidate {
  mode: TerminalCompletionMode
  score: number
  index: number
  confidence: TerminalCompletionConfidence
}

function normalizeLookup(value: string): string {
  return value.trimStart().toLowerCase()
}

function uniqueCandidates(candidates: CompletionCandidate[]): CompletionCandidate[] {
  const seen = new Set<string>()
  const unique: CompletionCandidate[] = []

  for (const candidate of candidates) {
    const value = candidate.value.trim()
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push({ ...candidate, value })
  }

  return unique
}

function damerauLevenshtein(a: string, b: string): number {
  const rows = a.length + 1
  const cols = b.length + 1
  const matrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0))

  for (let i = 0; i < rows; i++) matrix[i][0] = i
  for (let j = 0; j < cols; j++) matrix[0][j] = j

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )

      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1)
      }
    }
  }

  return matrix[a.length][b.length]
}

function isSubsequence(needle: string, haystack: string): boolean {
  let index = 0
  for (const char of haystack) {
    if (char === needle[index]) index += 1
    if (index === needle.length) return true
  }
  return false
}

function scoreToken(inputToken: string, candidateToken: string): number | null {
  if (!inputToken) return null
  if (candidateToken.startsWith(inputToken)) {
    return 1.2 + inputToken.length / Math.max(candidateToken.length, 1)
  }
  if (inputToken.length < 3) return null

  const distance = damerauLevenshtein(inputToken, candidateToken)
  const maxDistance =
    inputToken.length <= 4 ? 1 : inputToken.length <= 8 ? 2 : Math.ceil(inputToken.length * 0.28)
  if (distance <= maxDistance) {
    return 1 - distance / Math.max(inputToken.length, candidateToken.length, 1)
  }

  if (inputToken.length >= 4 && isSubsequence(inputToken, candidateToken)) {
    return 0.55
  }

  return null
}

function scoreCompletionCandidate(
  input: string,
  candidate: CompletionCandidate,
  index: number
): ScoredCompletionCandidate | null {
  const lookup = normalizeLookup(input)
  const candidateLookup = normalizeLookup(candidate.value)

  if (candidateLookup.startsWith(lookup) && candidateLookup.length > lookup.length) {
    return {
      ...candidate,
      mode: 'append',
      score: 1000 + (candidate.source === 'history' ? 20 : 0) - candidateLookup.length * 0.01,
      index,
      confidence: 'high'
    }
  }

  const inputTokens = lookup.split(/\s+/).filter(Boolean)
  const candidateTokens = candidateLookup.split(/\s+/).filter(Boolean)
  if (inputTokens.length === 0 || inputTokens.length > candidateTokens.length) return null
  if (inputTokens[0].length < 3) return null

  let total = 0
  for (let i = 0; i < inputTokens.length; i++) {
    const tokenScore = scoreToken(inputTokens[i], candidateTokens[i])
    if (tokenScore === null) return null
    total += tokenScore
  }

  const average = total / inputTokens.length
  if (average < 0.82) return null

  const extraTokens = candidateTokens.length - inputTokens.length
  const usefulTemplateBonus = Math.min(extraTokens, 2) * 2.5
  const historyBonus = candidate.source === 'history' ? 8 : 0
  const lengthPenalty = Math.abs(candidateLookup.length - lookup.length) * 0.04
  const confidence: TerminalCompletionConfidence =
    candidate.source === 'history' || average >= 0.9 ? 'high' : 'medium'

  return {
    ...candidate,
    mode: 'replace',
    score: 700 + average * 100 + usefulTemplateBonus + historyBonus - lengthPenalty,
    index,
    confidence
  }
}

function displayLabel(source: TerminalCompletionSource, mode: TerminalCompletionMode): string {
  if (source === 'model') return mode === 'replace' ? 'AI 修正' : 'AI'
  if (mode === 'replace') return '修正'
  return source === 'history' ? '历史' : '命令'
}

export function updateTerminalInputBuffer(current: string, data: string): string {
  let next = current

  for (const char of data) {
    if (char === '\r' || char === '\n' || char === '\x03' || char === '\x15') {
      next = ''
      continue
    }

    if (char === '\x7f' || char === '\b') {
      next = next.slice(0, -1)
      continue
    }

    const code = char.charCodeAt(0)
    if (code >= 32 && code !== 127) {
      next += char
    }
  }

  return next
}

export function buildTerminalCompletion(
  input: string,
  historyCommands: string[],
  limit = 6
): TerminalCompletionResult | null {
  const trimmedLeftInput = input.trimStart()
  if (trimmedLeftInput.length === 0 || trimmedLeftInput.length > 200) return null

  const leadingWhitespace = input.length - trimmedLeftInput.length
  const prefix = input.slice(0, leadingWhitespace)
  const includesPathSegment = trimmedLeftInput.includes('/')
  const candidates = uniqueCandidates([
    ...historyCommands.map((value) => ({ value, source: 'history' as const })),
    ...(includesPathSegment
      ? []
      : COMMON_COMPLETIONS.map((value) => ({ value, source: 'common' as const })))
  ])
    .map((candidate, index) => scoreCompletionCandidate(input, candidate, index))
    .filter((candidate): candidate is ScoredCompletionCandidate => Boolean(candidate))
    .sort((a, b) => b.score - a.score || a.index - b.index)

  if (candidates.length === 0) return null

  const alternatives = candidates.slice(0, Math.max(1, limit))
  const [best] = alternatives
  const value = `${prefix}${best.value.trimStart()}`
  const suffix = value.slice(input.length)
  if (!suffix && best.mode === 'append') return null

  return {
    input,
    value,
    suffix,
    insertText: best.mode === 'replace' ? `\x15${value}` : suffix,
    source: best.source,
    mode: best.mode,
    confidence: best.confidence,
    displayLabel: displayLabel(best.source, best.mode),
    alternatives: alternatives.map(({ value, source, mode, confidence }) => ({
      value,
      source,
      mode,
      confidence,
      displayLabel: displayLabel(source, mode)
    }))
  }
}

export function buildTerminalModelCompletion(
  input: string,
  command: string,
  confidence: TerminalCompletionConfidence = 'high'
): TerminalCompletionResult | null {
  if (confidence === 'low') return null
  const trimmedLeftInput = input.trimStart()
  const trimmedCommand = command
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
  if (!trimmedLeftInput || !trimmedCommand) return null

  const leadingWhitespace = input.length - trimmedLeftInput.length
  const prefix = input.slice(0, leadingWhitespace)
  const value = `${prefix}${trimmedCommand}`
  if (value.trim() === input.trim()) return null

  const mode: TerminalCompletionMode = value.startsWith(input) ? 'append' : 'replace'
  const suffix = mode === 'append' ? value.slice(input.length) : ''
  if (mode === 'append' && !suffix) return null

  return {
    input,
    value,
    suffix,
    insertText: mode === 'replace' ? `\x15${value}` : suffix,
    source: 'model',
    mode,
    confidence,
    displayLabel: displayLabel('model', mode),
    alternatives: [
      {
        value: trimmedCommand,
        source: 'model',
        mode,
        confidence,
        displayLabel: displayLabel('model', mode)
      }
    ]
  }
}
