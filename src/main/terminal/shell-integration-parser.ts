const OSC_START = '\x1b]6973;OPENTERM_CMD_START\x07'
const OSC_END_PREFIX = '\x1b]6973;OPENTERM_CMD_END;'

export interface ShellIntegrationParseResult {
  rawBuffer: string
  cleanData: string
  shellIntegrationReady: boolean
  isCommandEnd: boolean
  exitCode?: number
  cwd?: string
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function makeOscStartRegex(): RegExp {
  return new RegExp(escapeRegExp(OSC_START), 'g')
}

function makeOscEndRegex(): RegExp {
  return new RegExp(`${escapeRegExp(OSC_END_PREFIX)}(-?\\d+);([^\\x07]*)\\x07`, 'g')
}

export function stripAnsi(text: string): string {
  let result = ''
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 27 && text[i + 1] === '[') {
      i += 2
      while (i < text.length && !/[a-zA-Z]/.test(text[i])) {
        i++
      }
      continue
    }
    result += text[i]
  }
  return result
}

export class ShellIntegrationParser {
  parse(rawBuffer: string, rawChunk: string): ShellIntegrationParseResult {
    let nextRawBuffer = rawBuffer + rawChunk
    let shellIntegrationReady = false
    let isCommandEnd = false
    let exitCode: number | undefined
    let cwd: string | undefined

    if (nextRawBuffer.includes(OSC_START)) {
      shellIntegrationReady = true
      nextRawBuffer = nextRawBuffer.replace(makeOscStartRegex(), '')
    }

    const endRegex = makeOscEndRegex()
    let endMatch: RegExpExecArray | null
    while ((endMatch = endRegex.exec(nextRawBuffer)) !== null) {
      exitCode = parseInt(endMatch[1], 10)
      cwd = endMatch[2]
      isCommandEnd = true
    }

    if (isCommandEnd) {
      nextRawBuffer = nextRawBuffer.replace(makeOscEndRegex(), '')
    }

    const cleanData = rawChunk.replace(makeOscStartRegex(), '').replace(makeOscEndRegex(), '')

    return {
      rawBuffer: nextRawBuffer,
      cleanData,
      shellIntegrationReady,
      isCommandEnd,
      exitCode,
      cwd
    }
  }
}
