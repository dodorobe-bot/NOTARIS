import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import {
  analyzeDatabase,
  checkpointDetailed,
  integrityCheck,
  performancePragmas,
  snapshotDatabase,
} from '../src/main/lib/migrate'

const nodeRequire = createRequire(import.meta.url)

function open(p: string) {
  const { DatabaseSync } = nodeRequire('node:sqlite')
  return new DatabaseSync(p)
}

function count(p: string, sql: string): number {
  const conn = open(p)
  try {
    return Number(Object.values(conn.prepare(sql).get() ?? {})[0] ?? 0)
  } finally {
    conn.close()
  }
}

function tempDb(): { dir: string; db: string } {
  return { dir: fs.mkdtempSync(path.join(os.tmpdir(), 'notarispro-migrate-')), db: '' }
}

describe('salinan, checkpoint, dan PRAGMA performa', () => {
  it('salinan memakai API backup SQLite dan berisi seluruh data', async () => {
    const { dir } = tempDb()
    const db = path.join(dir, 'app.db')
    try {
      const src = open(db)
      src.exec('PRAGMA journal_mode=WAL')
      src.exec('CREATE TABLE Client (id INTEGER PRIMARY KEY, name TEXT NOT NULL)')
      const ins = src.prepare('INSERT INTO Client (name) VALUES (?)')
      for (let i = 0; i < 500; i++) ins.run(`klien-${i}`)
      src.close()

      const target = path.join(dir, 'salinan.db')
      const snapshot = await snapshotDatabase(db, target)
      expect(['backup-api', 'vacuum-into']).toContain(snapshot.method)
      expect(count(target, 'SELECT COUNT(*) AS c FROM Client')).toBe(500)
      expect(integrityCheck(target).ok).toBe(true)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('salinan tidak mengandung data yang masih ada di WAL sumber', async () => {
    const { dir } = tempDb()
    const db = path.join(dir, 'app.db')
    try {
      const src = open(db)
      src.exec('PRAGMA journal_mode=WAL')
      src.exec('CREATE TABLE Deed (id INTEGER PRIMARY KEY, number TEXT NOT NULL)')
      src.prepare("INSERT INTO Deed (number) VALUES ('AKT-A')").run()
      // Frame kedua sengaja dibiarkan di WAL: checkpoint sumber tidak boleh dilewati.
      src.prepare("INSERT INTO Deed (number) VALUES ('AKT-B')").run()
      const target = path.join(dir, 'salinan.db')
      await snapshotDatabase(db, target)
      expect(count(target, 'SELECT COUNT(*) AS c FROM Deed')).toBe(2)
      src.close()
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('checkpoint melaporkan keberhasilan secara eksplisit', () => {
    const { dir } = tempDb()
    const db = path.join(dir, 'app.db')
    try {
      const src = open(db)
      src.exec('PRAGMA journal_mode=WAL')
      src.exec('CREATE TABLE Setting (key TEXT PRIMARY KEY)')
      src.prepare("INSERT INTO Setting (key) VALUES ('a')").run()
      src.close()
      const result = checkpointDetailed(db)
      expect(result.ok).toBe(true)
      expect(result.busy).toBe(false)
      expect(result.detail).toBe('ok')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('PRAGMA performa menjaga synchronous=FULL dan tidak pernah berisi VACUUM', () => {
    const sql = performancePragmas({ cacheKb: 65536, mmapMb: 128, tempStoreMemory: true })
    expect(sql).toContain('PRAGMA journal_mode=WAL')
    expect(sql).toContain('PRAGMA synchronous=FULL')
    expect(sql).toContain('PRAGMA cache_size=-65536')
    expect(sql).toContain('PRAGMA mmap_size=134217728')
    expect(sql).toContain('PRAGMA temp_store=MEMORY')
    expect(sql.join(' ').toUpperCase()).not.toContain('VACUUM')
  })

  it('migrasi 004 membuat indeks komposit dan ANALYZE menulis statistik', () => {
    const { dir } = tempDb()
    const db = path.join(dir, 'app.db')
    try {
      const conn = open(db)
      conn.exec('CREATE TABLE "Client" (id INTEGER PRIMARY KEY, deletedAt TEXT, createdAt TEXT)')
      conn.exec('CREATE TABLE "Deed" (id INTEGER PRIMARY KEY, status TEXT, signedAt TEXT, createdAt TEXT)')
      conn.exec('CREATE TABLE "Transaction" (id INTEGER PRIMARY KEY, deletedAt TEXT, status TEXT, createdAt TEXT)')
      conn.exec('CREATE TABLE "AuditLog" (id INTEGER PRIMARY KEY, action TEXT)')
      conn.exec('CREATE TABLE "Document" (id INTEGER PRIMARY KEY, deletedAt TEXT, createdAt TEXT)')
      for (let i = 0; i < 50; i++) {
        conn.prepare('INSERT INTO "Client" (deletedAt, createdAt) VALUES (NULL, ?)').run(`2026-01-${(i % 28) + 1}`)
        conn.prepare('INSERT INTO "AuditLog" (action) VALUES (?)').run(i % 2 ? 'CREATE' : 'UPDATE')
      }
      const sql = fs.readFileSync(new URL('../migrations/004_performance.sql', import.meta.url), 'utf8')
      conn.exec(sql)
      const names = (conn.prepare("SELECT name FROM sqlite_master WHERE type='index' AND sql IS NOT NULL").all() as { name: string }[])
        .map((r) => r.name)
      expect(names).toEqual(expect.arrayContaining([
        'Client_deletedAt_createdAt_idx',
        'Deed_status_signedAt_idx',
        'Deed_createdAt_idx',
        'Transaction_deletedAt_status_createdAt_idx',
        'AuditLog_action_idx',
        'Document_deletedAt_createdAt_idx',
      ]))
      conn.close()

      analyzeDatabase(db)
      expect(count(db, 'SELECT COUNT(*) AS c FROM sqlite_stat1')).toBeGreaterThan(0)
      expect(integrityCheck(db).ok).toBe(true)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('migrasi 006 mengganti indeks deedId dengan komposit deedId+createdAt', () => {
    const { dir } = tempDb()
    const db = path.join(dir, 'app.db')
    try {
      const conn = open(db)
      conn.exec('CREATE TABLE "WorkflowHistory" (id TEXT PRIMARY KEY, deedId TEXT, createdAt INTEGER)')
      conn.exec('CREATE INDEX "WorkflowHistory_deedId_idx" ON "WorkflowHistory"("deedId")')
      conn.exec('CREATE INDEX "WorkflowHistory_createdAt_idx" ON "WorkflowHistory"("createdAt")')
      const insert = conn.prepare('INSERT INTO "WorkflowHistory" (id, deedId, createdAt) VALUES (?, ?, ?)')
      conn.exec('BEGIN')
      for (let i = 0; i < 5000; i++) insert.run(`w${i}`, i < 4500 ? null : `deed-${i % 4}`, i)
      conn.exec('COMMIT')
      conn.exec(fs.readFileSync(new URL('../migrations/006_workflow_index.sql', import.meta.url), 'utf8'))

      const names = (conn.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='WorkflowHistory'").all() as { name: string }[])
        .map((r) => r.name)
      expect(names).toContain('WorkflowHistory_deedId_createdAt_idx')
      expect(names).not.toContain('WorkflowHistory_deedId_idx')

      const plan = (conn.prepare('EXPLAIN QUERY PLAN SELECT * FROM "WorkflowHistory" WHERE "deedId" = ? ORDER BY "createdAt" ASC').all('deed-1') as { detail: string }[])
        .map((r) => r.detail)
        .join(' ')
      expect(plan).toMatch(/SEARCH .*WorkflowHistory_deedId_createdAt_idx/)

      const deed = conn.prepare('SELECT id, createdAt FROM "WorkflowHistory" WHERE "deedId" = ? ORDER BY "createdAt" ASC').all('deed-1') as { id: string; createdAt: number }[]
      expect(deed).toHaveLength(125)
      expect(deed[0].id).toBe('w4501')
      expect(deed.at(-1)?.id).toBe('w4997')
      expect(deed.every((r, i) => i === 0 || r.createdAt > deed[i - 1].createdAt)).toBe(true)
      conn.close()
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('migrasi 005 menjaga indeks FTS tetap sinkron saat data berubah', () => {
    const { dir } = tempDb()
    const db = path.join(dir, 'app.db')
    try {
      const conn = open(db)
      conn.exec('CREATE TABLE "Client" (id TEXT PRIMARY KEY, fullName TEXT, code TEXT, nik TEXT, npwp TEXT, deletedAt TEXT)')
      conn.exec('CREATE TABLE "Transaction" (id TEXT PRIMARY KEY, code TEXT, title TEXT, deletedAt TEXT)')
      conn.exec('CREATE TABLE "Deed" (id TEXT PRIMARY KEY, deedNumber TEXT, title TEXT)')
      conn.exec('CREATE TABLE "Invoice" (id TEXT PRIMARY KEY, number TEXT)')
      conn.exec('CREATE TABLE "Document" (id TEXT PRIMARY KEY, title TEXT, fileName TEXT, deletedAt TEXT)')
      conn.exec('CREATE TABLE "government_submissions" (id TEXT PRIMARY KEY, number TEXT, title TEXT, externalRef TEXT)')
      conn.exec(fs.readFileSync(new URL('../migrations/005_search_fts.sql', import.meta.url), 'utf8'))

      const hits = (term: string): number =>
        Number(Object.values(conn.prepare('SELECT COUNT(*) AS c FROM client_search WHERE client_search MATCH ?').get(term) ?? {})[0] ?? 0)
      conn.prepare('INSERT INTO "Client" (id, fullName, code, nik) VALUES (?, ?, ?, ?)').run('c1', 'Budi Santoso', 'KLN-00001', '3201010101010001')
      expect(hits('"budi"*')).toBe(1)

      conn.prepare('UPDATE "Client" SET fullName = ? WHERE id = ?').run('Budi Prakoso', 'c1')
      expect(hits('"santoso"*')).toBe(0)
      expect(hits('"prakoso"*')).toBe(1)

      conn.prepare('DELETE FROM "Client" WHERE id = ?').run('c1')
      expect(hits('"budi"*')).toBe(0)
      conn.close()
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('PRAGMA menolak nilai yang tidak masuk akal', () => {
    const sql = performancePragmas({ cacheKb: 0, mmapMb: 10_000, tempStoreMemory: false })
    expect(sql.join(' ')).not.toContain('cache_size=-0')
    const mmap = Number(/mmap_size=(\d+)/.exec(sql.join(' '))?.[1] ?? 0)
    expect(mmap).toBeLessThanOrEqual(512 * 1048576)
    expect(sql.join(' ')).not.toContain('temp_store=MEMORY')
  })
})
