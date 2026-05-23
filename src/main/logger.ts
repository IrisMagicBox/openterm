import { WebContents } from 'electron'

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

interface LogEntry {
  level: LogLevel
  timestamp: number
  category: string
  message: string
  data?: unknown
}

type LogListener = (entry: LogEntry) => void

function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>()

  try {
    return JSON.stringify(value, (_, item) => {
      if (typeof item === 'bigint') return item.toString()
      if (typeof item !== 'object' || item === null) return item
      if (seen.has(item)) return '[Circular]'
      seen.add(item)
      return item
    })
  } catch (error) {
    return `[Unserializable: ${error instanceof Error ? error.message : String(error)}]`
  }
}

class Logger {
  private webContents?: WebContents
  private listeners = new Set<LogListener>()

  setWebContents(webContents: WebContents): void {
    this.webContents = webContents
  }

  private log(level: LogLevel, category: string, message: string, data?: unknown): void {
    const entry: LogEntry = {
      level,
      timestamp: Date.now(),
      category,
      message,
      data
    }

    const timeStr = new Date(entry.timestamp).toLocaleTimeString()
    const dataStr = data !== undefined ? ` | ${safeStringify(data)}` : ''
    console.log(`[${timeStr}] [${level}] [${category}] ${message}${dataStr}`)

    if (this.webContents && !this.webContents.isDestroyed()) {
      try {
        this.webContents.send('debug:log', entry)
      } catch {
        // Renderer diagnostics must never destabilize the main process.
      }
    }

    for (const listener of this.listeners) {
      try {
        listener(entry)
      } catch {
        // Logging listeners are best-effort observers.
      }
    }
  }

  onLog(listener: LogListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  debug(category: string, message: string, data?: unknown): void {
    this.log('DEBUG', category, message, data)
  }

  info(category: string, message: string, data?: unknown): void {
    this.log('INFO', category, message, data)
  }

  warn(category: string, message: string, data?: unknown): void {
    this.log('WARN', category, message, data)
  }

  error(category: string, message: string, data?: unknown): void {
    this.log('ERROR', category, message, data)
  }
}

export const logger = new Logger()
