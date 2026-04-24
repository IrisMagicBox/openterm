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
    const dataStr = data ? ` | ${JSON.stringify(data)}` : ''
    console.log(`[${timeStr}] [${level}] [${category}] ${message}${dataStr}`)

    if (this.webContents) {
      this.webContents.send('debug:log', entry)
    }

    for (const listener of this.listeners) {
      listener(entry)
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
