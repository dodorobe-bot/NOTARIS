import { createHash } from 'node:crypto'
import type { Tx } from '../db'
import type { PrismaClient } from '@prisma/client'

type DbLike = Tx | PrismaClient

export interface AuditInput {
  userId?: string | null
  username: string
  action: string
  entity: string
  entityId?: string | null
  before?: unknown
  after?: unknown
  meta?: unknown
}

export interface AuditChainRow {
  id: number
  prevHash: string | null
  hash: string
  userId: string | null
  username: string
  action: string
  entity: string
  entityId: string | null
  createdAt: string
  before: string | null
  after: string | null
  meta: string | null
}

export function computeAuditHash(row: Omit<AuditChainRow, 'id' | 'hash'>): string {
  const payload = [
    'v1',
    row.prevHash ?? 'GENESIS',
    row.userId ?? '',
    row.username,
    row.action,
    row.entity,
    row.entityId ?? '',
    row.createdAt,
    row.before ?? '',
    row.after ?? '',
    row.meta ?? '',
  ].join('|')
  return createHash('sha256').update(payload).digest('hex')
}

export async function audit(tx: DbLike, input: AuditInput): Promise<void> {
  const prev = await tx.auditLog.findFirst({ orderBy: { id: 'desc' }, select: { hash: true } })
  const createdAt = new Date()
  const before = input.before === undefined || input.before === null ? null : JSON.stringify(input.before)
  const after = input.after === undefined || input.after === null ? null : JSON.stringify(input.after)
  const meta = input.meta === undefined || input.meta === null ? null : JSON.stringify(input.meta)
  const row = {
    userId: input.userId ?? null,
    username: input.username,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId ?? null,
    createdAt: createdAt.toISOString(),
    before,
    after,
    meta,
    prevHash: prev?.hash ?? null,
  }
  const hash = computeAuditHash(row)
  await tx.auditLog.create({ data: { ...row, createdAt, hash } })
}

/**
 * Verifikasi rantai hash secara bertahap. Pemanggil menambahkan baris urut `id`
 * dan membaca `state()` kapan saja, sehingga tabel beratus-ratus ribu baris dapat
 * diverifikasi tanpa menahan seluruh isi rantai di memori.
 */
export function createChainVerifier(): {
  push(row: AuditChainRow): void
  state(): { ok: boolean; brokenAt: number | null; checked: number }
} {
  let prevHash: string | null = null
  let checked = 0
  let brokenAt: number | null = null
  return {
    push(row) {
      if (brokenAt !== null) return
      const expected = computeAuditHash({
        prevHash,
        userId: row.userId,
        username: row.username,
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        createdAt: row.createdAt,
        before: row.before,
        after: row.after,
        meta: row.meta,
      })
      if (expected !== row.hash || (row.prevHash ?? null) !== prevHash) {
        brokenAt = row.id
        return
      }
      prevHash = row.hash
      checked++
    },
    state: () => ({ ok: brokenAt === null, brokenAt, checked }),
  }
}

/** Memverifikasi rantai hash audit. Mengembalikan indeks pertama yang rusak. */
export function verifyAuditChain(rows: AuditChainRow[]): { ok: boolean; brokenAt: number | null; checked: number } {
  const verifier = createChainVerifier()
  for (const row of rows) verifier.push(row)
  return verifier.state()
}
