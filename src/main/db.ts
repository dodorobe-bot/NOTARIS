import { PrismaClient } from '@prisma/client'
import { files } from './lib/paths'
import { log } from './lib/logger'
import { performancePragmas } from './lib/migrate'

let client: PrismaClient | null = null

export function db(): PrismaClient {
  if (!client) {
    client = new PrismaClient({
      datasources: { db: { url: `file:${files.db().replace(/\\/g, '/')}` } },
      log: ['error'],
    })
  }
  return client
}

export async function connectDb(): Promise<void> {
  await db().$connect()
  try {
    for (const sql of performancePragmas()) {
      await db().$queryRawUnsafe(sql)
    }
  } catch (err) {
    log.warn('PRAGMA gagal diterapkan', String(err))
  }
}

export async function disconnectDb(): Promise<void> {
  if (client) {
    await client.$disconnect()
    client = null
  }
}

export type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

export async function inTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db().$transaction(fn, { maxWait: 10000, timeout: 30000 })
}
