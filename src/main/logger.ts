import { WebContents } from 'electron'

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

interface LogEntry {
  level: LogLevel
  timestamp: number
  category: string
  message: string
  data?: any
}

class Logger {
  private webContents?: WebContents

  setWebContents(webContents: WebContents) {
    this.webContents = webContents
  }

  private log(level: LogLevel, category: string, message: string, data?: any) {
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
  }

  debug(category: string, message: string, data?: any) {
    this.log('DEBUG', category, message, data)
  }

  info(category: string, message: string, data?: any) {
    this.log('INFO', category, message, data)
  }

  warn(category: string, message: string, data?: any) {
    this.log('WARN', category, message, data)
  }

  error(category: string, message: string, data?: any) {
    this.log('ERROR', category, message, data)
  }
}

export const logger = new Logger()
