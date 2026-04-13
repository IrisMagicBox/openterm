import Database from 'better-sqlite3'
import { Message } from '../../../shared/types'
import { MessageRow } from '../row-types'
import { mapMessageRow } from '../mappers'
import { BaseRepository } from '../base-repository'

export class MessageRepository extends BaseRepository<MessageRow> {
  constructor(db: Database.Database) {
    super(db)
  }

  getMessages(topicId: string): Message[] {
    const rows = this.stmt('SELECT * FROM messages WHERE topicId = ? ORDER BY timestamp ASC').all(
      topicId
    ) as MessageRow[]
    return rows.map(mapMessageRow)
  }

  createMessage(message: Message): void {
    const toolCallsStr = message.toolCalls ? JSON.stringify(message.toolCalls) : null
    this.stmt(
      `
      INSERT INTO messages (id, topicId, role, content, thought, toolCalls, toolCallId, name, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      message.id,
      message.topicId,
      message.role,
      message.content || '',
      message.thought || null,
      toolCallsStr,
      message.toolCallId || null,
      message.name || null,
      message.timestamp
    )

    this.db
      .prepare('UPDATE topics SET lastMessageAt = ? WHERE id = ?')
      .run(message.timestamp, message.topicId)
  }
}
