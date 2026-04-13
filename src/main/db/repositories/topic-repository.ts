import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import { Topic } from '../../../shared/types'
import { TopicRow } from '../row-types'
import { mapTopicRow } from '../mappers'
import { BaseRepository } from '../base-repository'

export class TopicRepository extends BaseRepository<TopicRow> {
  constructor(db: Database.Database) {
    super(db)
  }

  getTopics(): Topic[] {
    const rows = this.stmt('SELECT * FROM topics ORDER BY lastMessageAt DESC').all() as TopicRow[]
    return rows.map(mapTopicRow)
  }

  createTopic(title: string, hostIds: string[]): Topic {
    const id = uuidv4()
    const now = Date.now()
    const hostsStr = JSON.stringify(hostIds)

    this.stmt(
      `
      INSERT INTO topics (id, title, hostIds, lastMessageAt, createdAt)
      VALUES (?, ?, ?, ?, ?)
    `
    ).run(id, title, hostsStr, now, now)

    return { id, title, hostIds, lastMessageAt: now, createdAt: now }
  }

  updateTopicTitle(id: string, title: string): void {
    this.stmt('UPDATE topics SET title = ? WHERE id = ?').run(title, id)
  }

  deleteTopic(id: string): void {
    this.stmt('DELETE FROM topics WHERE id = ?').run(id)
  }

  updateTopicHosts(id: string, hostIds: string[]): void {
    const hostsStr = JSON.stringify(hostIds)
    this.stmt('UPDATE topics SET hostIds = ? WHERE id = ?').run(hostsStr, id)
  }

  getTopicById(id: string): Topic | undefined {
    const row = this.stmt('SELECT * FROM topics WHERE id = ?').get(id) as TopicRow | undefined
    return row ? mapTopicRow(row) : undefined
  }

  searchTopics(query: string): Topic[] {
    const rows = this.stmt(
      'SELECT * FROM topics WHERE title LIKE ? OR id IN (SELECT topicId FROM tasks WHERE summary LIKE ? OR goal LIKE ?) ORDER BY lastMessageAt DESC LIMIT 10'
    ).all(`%${query}%`, `%${query}%`, `%${query}%`) as TopicRow[]
    return rows.map(mapTopicRow)
  }
}
