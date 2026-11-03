import { z } from 'zod'
import { db } from '../db'
import { route } from './router'
import { paging, paginated, dateRange } from '../lib/util'
import { createChainVerifier, type AuditChainRow } from '../lib/audit'
import { paginationSchema } from '../../shared/schemas'

/** Jumlah baris audit yang dibaca dan diverifikasi per tahap. */
const VERIFY_BATCH = 5_000

const auditListSchema = paginationSchema.extend({
  action: z.string().optional(),
  entity: z.string().optional(),
  username: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
})

route('audit.list', {
  auth: 'session',
  perm: 'audit.view',
  schema: auditListSchema,
  handler: async (q) => {
    const where: Record<string, unknown> = {}
    if (q.action) where.action = q.action
    if (q.entity) where.entity = q.entity
    if (q.username) where.username = q.username
    const range = dateRange(q.from, q.to)
    if (range) where.createdAt = range
    if (q.search) {
      where.OR = [
        { username: { contains: q.search } },
        { action: { contains: q.search } },
        { entity: { contains: q.search } },
        { entityId: { contains: q.search } },
      ]
    }
    const [total, items, actions, entities] = await Promise.all([
      db().auditLog.count({ where }),
      db().auditLog.findMany({
        where, ...paging(q), orderBy: { id: 'desc' },
        select: {
          id: true, username: true, action: true, entity: true, entityId: true,
          before: true, after: true, meta: true, hash: true, prevHash: true, createdAt: true,
        },
      }),
      db().auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
      db().auditLog.findMany({ distinct: ['entity'], select: { entity: true }, orderBy: { entity: 'asc' } }),
    ])
    return {
      ...paginated(items, total, q),
      actions: actions.map((a) => a.action),
      entities: entities.map((e) => e.entity),
    }
  },
})

route('audit.verify', {
  auth: 'session',
  perm: 'audit.view',
  handler: async () => {
    const total = await db().auditLog.count()
    const verifier = createChainVerifier()
    let lastId = 0
    for (;;) {
      const rows = await db().auditLog.findMany({
        where: { id: { gt: lastId } },
        orderBy: { id: 'asc' },
        take: VERIFY_BATCH,
        select: {
          id: true, prevHash: true, hash: true, userId: true, username: true, action: true,
          entity: true, entityId: true, createdAt: true, before: true, after: true, meta: true,
        },
      })
      if (rows.length === 0) break
      for (const row of rows) {
        const mapped: AuditChainRow = { ...row, createdAt: row.createdAt.toISOString() }
        verifier.push(mapped)
        lastId = row.id
      }
      const state = verifier.state()
      if (!state.ok) {
        return { ...state, total, detail: `Rantai audit terputus pada entri #${state.brokenAt}.` }
      }
      if (rows.length < VERIFY_BATCH) break
      // beri kesempatan antrean IPC lain berjalan selama tahap berikutnya dihitung
      await new Promise((resolve) => setImmediate(resolve))
    }
    const result = verifier.state()
    return {
      ...result,
      total,
      detail: result.ok
        ? `Rantai audit utuh: ${result.checked} entri terverifikasi.`
        : `Rantai audit terputus pada entri #${result.brokenAt}.`,
    }
  },
})
