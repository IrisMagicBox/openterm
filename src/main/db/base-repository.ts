import Database from 'better-sqlite3'

export abstract class BaseRepository<TRow> {
  protected db: Database.Database
  private stmtCache = new Map<string, Database.Statement>()

  constructor(db: Database.Database) {
    this.db = db
  }

  protected stmt(sql: string): Database.Statement {
    let s = this.stmtCache.get(sql)
    if (!s) {
      s = this.db.prepare(sql)
      this.stmtCache.set(sql, s)
    }
    return s
  }

  protected findAll(tableName: string, orderBy = 'createdAt DESC'): TRow[] {
    return this.stmt(`SELECT * FROM ${tableName} ORDER BY ${orderBy}`).all() as TRow[]
  }

  protected findById(tableName: string, id: string): TRow | undefined {
    return this.stmt(`SELECT * FROM ${tableName} WHERE id = ?`).get(id) as TRow | undefined
  }

  protected deleteById(tableName: string, id: string): void {
    this.stmt(`DELETE FROM ${tableName} WHERE id = ?`).run(id)
  }
}
