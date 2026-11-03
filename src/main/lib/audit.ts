import { createHash } from 'node:crypto'
import type { Tx } from '../db'
import type { PrismaClient } from '@prisma/client'
import { ConflictError } from './errors'

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

const CHAIN_CONFLICT = 'Rantai audit tidak berkesinambungan'
const CHAIN_ATTEMPTS = 6
const RETRY_BASE_MS = 20

function isPrismaClient(tx: DbLike): tx is PrismaClient {
  return typeof (tx as { $connect?: unknown }).$connect === 'function'
}

/**
 * Prisma membungkus `RAISE(ABORT)` dari trigger 007 sebagai P2003 (bukan pesan aslinya),
 * jadi model juga harus diperiksa. AuditLog tidak memiliki relasi foreign key, sehingga
 * P2003 pada model ini hanya dapat berasal dari trigger rantai.
 */
function isChainConflict(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  if (err.message.includes(CHAIN_CONFLICT)) return true
  const code = (err as { code?: string }).code
  const modelName = (err as { meta?: { modelName?: string } }).meta?.modelName
  return code === 'P2003' && modelName === 'AuditLog'
}

/** SQLite dapat melaporkan kunci tulis sementara saat ada koneksi lain; aman diulang. */
function isTransientLock(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const code = (err as { code?: string }).code
  const message = err.message.toLowerCase()
  return code === 'P2034' || message.includes('database is locked') || message.includes('sqlite_busy')
}

async function appendRow(tx: DbLike, input: AuditInput): Promise<void> {
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
 * Rantai hash hanya sah bila setiap baris menunjuk hash baris tepat sebelumnya.
 * Membaca ujung rantai lalu menulis baris baru adalah dua operasi terpisah, sehingga dua
 * penulisan bersamaan pada level PrismaClient dapat membaca kepala yang sama dan menghasilkan
 * rantai bercabang. Pemanggilan level klien karena itu diantrekan dalam proses ini; di dalam
 * transaksi, trigger `trg_audit_logs_chain` (migrasi 007) menjadi pengaman terakhir dan
 * penulisan yang kalah diulang dengan kepala rantai terbaru.
 */
let clientChain: Promise<void> = Promise.resolve()

async function appendSerialized(tx: PrismaClient, input: AuditInput): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await appendRow(tx, input)
      return
    } catch (err) {
      if (!isChainConflict(err) && !isTransientLock(err)) throw err
      if (attempt >= CHAIN_ATTEMPTS) {
        throw new ConflictError('Rantai audit sedang diperbarui oleh proses lain. Silakan ulangi tindakan ini.')
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_MS * attempt))
    }
  }
}

export async function audit(tx: DbLike, input: AuditInput): Promise<void> {
  if (!isPrismaClient(tx)) {
    try {
      await appendRow(tx, input)
    } catch (err) {
      if (isChainConflict(err)) {
        throw new ConflictError('Rantai audit sedang diperbarui oleh proses lain. Silakan ulangi tindakan ini.')
      }
      throw err
    }
    return
  }
  const run = clientChain.then(
    () => appendSerialized(tx, input),
    () => appendSerialized(tx, input),
  )
  clientChain = run.catch(() => undefined)
  return run
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
