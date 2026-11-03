import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { audit, verifyAuditChain } from '../src/main/lib/audit'

const nodeRequire = createRequire(import.meta.url)
const { DatabaseSync } = nodeRequire('node:sqlite') as {
  DatabaseSync: new (p: string) => {
    exec(sql: string): void
    prepare(sql: string): { run(...args: unknown[]): unknown; all(): Record<string, unknown>[] }
    close(): void
  }
}

const dirs: string[] = []

function tempClient(): { client: PrismaClient; dbPath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notaris-audit-'))
  dirs.push(dir)
  const dbPath = path.join(dir, 'app.db')
  const conn = new DatabaseSync(dbPath)
  conn.exec(`CREATE TABLE "AuditLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT,
    "username" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" TEXT,
    "after" TEXT,
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prevHash" TEXT,
    "hash" TEXT NOT NULL
  )`)
  conn.close()
  const client = new PrismaClient({ datasources: { db: { url: `file:${dbPath.replace(/\\/g, '/')}` } } })
  return { client, dbPath }
}

function applyAuditChainTrigger(dbPath: string): void {
  const sql = fs.readFileSync(path.join(process.cwd(), 'migrations', '007_audit_chain.sql'), 'utf8')
  const conn = new DatabaseSync(dbPath)
  conn.exec(sql)
  conn.close()
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('rantai audit pada database nyata', () => {
  it('tetap utuh saat banyak entri ditulis bersamaan tanpa transaksi pemanggil', async () => {
    const { client } = tempClient()
    try {
      const total = 24
      await Promise.all(
        Array.from({ length: total }, (_, i) =>
          audit(client, { username: 'admin', action: 'TEST', entity: 'Client', entityId: `c-${i}` }),
        ),
      )
      const rows = await client.auditLog.findMany({ orderBy: { id: 'asc' } })
      expect(rows).toHaveLength(total)
      const result = verifyAuditChain(
        rows.map((r) => ({
          id: r.id,
          prevHash: r.prevHash,
          hash: r.hash,
          userId: r.userId,
          username: r.username,
          action: r.action,
          entity: r.entity,
          entityId: r.entityId,
          createdAt: r.createdAt.toISOString(),
          before: r.before,
          after: r.after,
          meta: r.meta,
        })),
      )
      expect(result).toEqual({ ok: true, brokenAt: null, checked: total })
    } finally {
      await client.$disconnect()
    }
  })

  it('trigger migrasi 007 menolak baris yang tidak menyambung dengan kepala rantai', async () => {
    const { client, dbPath } = tempClient()
    applyAuditChainTrigger(dbPath)
    try {
      await audit(client, { username: 'admin', action: 'TEST', entity: 'Client', entityId: 'c-1' })
      const rows = await client.auditLog.findMany({ orderBy: { id: 'asc' } })
      expect(rows).toHaveLength(1)

      await expect(
        client.$executeRawUnsafe(
          `INSERT INTO "AuditLog" ("username","action","entity","prevHash","hash") VALUES ('admin','TEST','Client','deadbeef','bad')`,
        ),
      ).rejects.toThrow(/Rantai audit tidak berkesinambungan/)

      await client.$executeRawUnsafe(
        `INSERT INTO "AuditLog" ("username","action","entity","prevHash","hash") VALUES ('admin','TEST','Client',?, 'lanjut')`,
        rows[0].hash,
      )
      expect(await client.auditLog.count()).toBe(2)
    } finally {
      await client.$disconnect()
    }
  })
})
