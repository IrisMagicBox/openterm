import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { TRUNCATION_MAX_LINES, TRUNCATION_MAX_BYTES, TRUNCATION_DIR_NAME } from '../constants'

export interface TruncationResult {
  content: string
  truncated: boolean
  outputPath?: string
  originalLines?: number
  originalBytes?: number
}

export function truncateOutput(text: string, topicId: string, stepId?: string): TruncationResult {
  const lines = text.split('\n')
  const totalBytes = Buffer.byteLength(text, 'utf-8')

  // If under both limits, pass through unchanged
  if (lines.length <= TRUNCATION_MAX_LINES && totalBytes <= TRUNCATION_MAX_BYTES) {
    return { content: text, truncated: false }
  }

  // Save full output to disk
  const truncationDir = path.join(app.getPath('userData'), TRUNCATION_DIR_NAME, topicId)
  fs.mkdirSync(truncationDir, { recursive: true })

  const filename = stepId ? `${stepId}.txt` : `${Date.now()}.txt`
  const outputPath = path.join(truncationDir, filename)
  fs.writeFileSync(outputPath, text, 'utf-8')

  // Build preview: 60% head + 40% tail
  const headCount = Math.floor(TRUNCATION_MAX_LINES * 0.6)
  const tailCount = Math.floor(TRUNCATION_MAX_LINES * 0.4)
  const headLines = lines.slice(0, headCount)
  const tailLines = lines.slice(-tailCount)
  const omittedCount = lines.length - headCount - tailCount

  let preview: string
  if (Buffer.byteLength(headLines.join('\n'), 'utf-8') <= TRUNCATION_MAX_BYTES * 0.9) {
    preview = [
      ...headLines,
      `... [${omittedCount} lines truncated, ${lines.length} total] ...`,
      ...tailLines
    ].join('\n')
  } else {
    // Even head is too large, just truncate by bytes
    preview = text.slice(0, TRUNCATION_MAX_BYTES)
    preview += '\n... [output truncated due to size] ...'
  }

  // Add helpful hints for the agent
  preview += `\n\n[Full output (${lines.length} lines, ${Math.round(totalBytes / 1024)}KB) saved to: ${outputPath}]`
  preview += '\n[Use read_file to inspect the full output, or search_memory to recall key details.]'

  return {
    content: preview,
    truncated: true,
    outputPath,
    originalLines: lines.length,
    originalBytes: totalBytes
  }
}
