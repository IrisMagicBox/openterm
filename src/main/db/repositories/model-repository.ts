import Database from 'better-sqlite3'
import { Model } from '../../../shared/types'
import { ModelRow } from '../row-types'
import { mapModelRow } from '../mappers'
import { BaseRepository } from '../base-repository'

export class ModelRepository extends BaseRepository<ModelRow> {
  constructor(db: Database.Database) {
    super(db)
  }

  getModels(providerId?: string): Model[] {
    const query = providerId
      ? 'SELECT * FROM models WHERE providerId = ? ORDER BY createdAt DESC'
      : 'SELECT * FROM models ORDER BY createdAt DESC'
    const rows = this.stmt(query).all(providerId ? [providerId] : []) as ModelRow[]
    return rows.map(mapModelRow)
  }

  getModelById(id: string): Model | undefined {
    const row = this.stmt('SELECT * FROM models WHERE id = ?').get(id) as ModelRow | undefined
    return row ? mapModelRow(row) : undefined
  }

  saveModel(model: Model): void {
    const now = Date.now()
    const existing = this.stmt('SELECT * FROM models WHERE id = ?').get(model.id) as
      | ModelRow
      | undefined
    const capabilitiesStr = model.capabilities ? JSON.stringify(model.capabilities) : null
    const pricingStr = model.pricing ? JSON.stringify(model.pricing) : null

    if (existing) {
      this.stmt(
        `
        UPDATE models
        SET providerId = ?, name = ?, group_name = ?, capabilities = ?, endpointType = ?, pricing = ?
        WHERE id = ?
      `
      ).run(
        model.providerId,
        model.name,
        model.group,
        capabilitiesStr,
        model.endpointType,
        pricingStr,
        model.id
      )
    } else {
      this.stmt(
        `
        INSERT INTO models (id, providerId, name, group_name, capabilities, endpointType, pricing, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        model.id,
        model.providerId,
        model.name,
        model.group,
        capabilitiesStr,
        model.endpointType,
        pricingStr,
        model.createdAt || now
      )
    }
  }

  deleteModel(id: string): void {
    this.stmt('DELETE FROM models WHERE id = ?').run(id)
  }

  deleteModelsByProvider(providerId: string): void {
    this.stmt('DELETE FROM models WHERE providerId = ?').run(providerId)
  }
}
