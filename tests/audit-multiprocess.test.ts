import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { verifyAuditChain } from '../src/main/lib/audit'

const nodeRequire = createRequire(import.meta.url)
const esbuild = nodeRequire('esbuild') as {
  buildSync(options: Record<string, unknown>): void
}
const { DatabaseSync } = nodeRequire('node:sqlite') as {
  DatabaseSync: new (p: string) => {
    exec(sql: string): void
    prepare(sql: string): { all(): Record<string, unknown>[] }
    close(): void
  }
}

const workDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp', 'audit-multiprocess-'))

afterAll(() => {
  fs.rmSync(workDir, { recursive: true, force: true })
})

function createDatabase(): string {
  const dbPath = path.join(workDir, 'app.db')
  const conn = new DatabaseSync(dbPath)
  conn.exec(`PRAGMA journal_mode=WAL`)
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
  conn.exec(fs.readFileSync(path.join(process.cwd(), 'migrations', '007_audit_chain.sql'), 'utf8'))
  conn.close()
  return dbPath
}

function workerPath(): string {
  const worker = path.join(workDir, 'worker.mjs')
  fs.writeFileSync(
    worker,
    `import { PrismaClient } from '@prisma/client'
import { audit } from './audit-bundle.mjs'

const [dbUrl, prefix, count] = process.argv.slice(2)
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } })
try {
  await prisma.$queryRawUnsafe('PRAGMA busy_timeout=5000')
  for (let i = 0; i < Number(count); i++) {
    await audit(prisma, {
      username: 'worker-' + prefix,
      action: 'MULTIPROCESS',
      entity: 'Client',
      entityId: prefix + '-' + i,
    })
  }
} finally {
  await prisma.$disconnect()
}
`,
  )
  return worker
}

function runWorker(worker: string, dbUrl: string, prefix: string, count: number): Promise<void> {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [worker, dbUrl, prefix, String(count)], {
      cwd: process.cwd(),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`worker ${prefix} keluar dengan kode ${code}: ${stderr}`))
    })
  })
}

describe('rantai audit lintas proses', () => {
  it('dua proses yang menulis bersamaan tetap menghasilkan satu rantai utuh', async () => {
    esbuild.buildSync({
      entryPoints: [path.join(process.cwd(), 'src', 'main', 'lib', 'audit.ts')],
      outfile: path.join(workDir, 'audit-bundle.mjs'),
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node24',
      external: ['@prisma/client'],
      logLevel: 'silent',
    })

    const dbPath = createDatabase()
    const dbUrl = `file:${dbPath.replace(/\\/g, '/')}`
    const worker = workerPath()
    const perWorker = 15

    await Promise.all([
      runWorker(worker, dbUrl, 'alpha', perWorker),
      runWorker(worker, dbUrl, 'beta', perWorker),
    ])

    const client = new PrismaClient({ datasources: { db: { url: dbUrl } } })
    try {
      const rows = await client.auditLog.findMany({ orderBy: { id: 'asc' } })
      expect(rows).toHaveLength(perWorker * 2)
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
      expect(result).toEqual({ ok: true, brokenAt: null, checked: perWorker * 2 })
      expect(new Set(rows.map((r) => r.entityId)).size).toBe(perWorker * 2)
    } finally {
      await client.$disconnect()
    }
  }, 90_000)
})
