import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import { Artifact } from '../../../shared/types'
import { ArtifactRow } from '../row-types'
import { mapArtifactRow } from '../mappers'
import { BaseRepository } from '../base-repository'

export class ArtifactRepository extends BaseRepository<ArtifactRow> {
  constructor(db: Database.Database) {
    super(db)
  }

  getArtifactsByTaskId(taskId: string): Artifact[] {
    const rows = this.stmt('SELECT * FROM artifacts WHERE taskId = ? ORDER BY createdAt ASC').all(
      taskId
    ) as ArtifactRow[]
    return rows.map(mapArtifactRow)
  }

  createArtifact(
    artifact: Omit<Artifact, 'id' | 'createdAt' | 'updatedAt'> &
      Partial<Pick<Artifact, 'id' | 'createdAt' | 'updatedAt'>>
  ): Artifact {
    const id = artifact.id || uuidv4()
    const now = artifact.createdAt || Date.now()
    const updatedAt = artifact.updatedAt || now
    const createdArtifact: Artifact = {
      id,
      taskId: artifact.taskId,
      type: artifact.type,
      title: artifact.title,
      content: artifact.content,
      metadata: artifact.metadata,
      createdAt: now,
      updatedAt
    }

    this.stmt(
      `
      INSERT INTO artifacts (id, taskId, type, title, content, metadata, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      createdArtifact.id,
      createdArtifact.taskId,
      createdArtifact.type,
      createdArtifact.title,
      createdArtifact.content,
      createdArtifact.metadata ? JSON.stringify(createdArtifact.metadata) : null,
      createdArtifact.createdAt,
      createdArtifact.updatedAt
    )

    this.stmt('UPDATE tasks SET updatedAt = ? WHERE id = ?').run(updatedAt, createdArtifact.taskId)
    return createdArtifact
  }
}
