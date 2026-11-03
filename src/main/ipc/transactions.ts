import { db, inTransaction } from '../db'
import { route } from './router'
import {
  idSchema, transactionListSchema, transactionSchema, transactionStatusSchema, transactionUpdateSchema,
} from '../../shared/schemas'
import { audit } from '../lib/audit'
import { nextNumber } from '../lib/numbering'
import { paging, paginated } from '../lib/util'
import { ConflictError, NotFoundError } from '../lib/errors'
import { assertTransactionTransition } from '../lib/workflow'
import { WORKFLOW_LABELS } from '../../shared/constants'

route('transactions.list', {
  auth: 'session',
  perm: 'transactions.view',
  schema: transactionListSchema,
  handler: async (q) => {
    const where: Record<string, unknown> = { deletedAt: null }
    if (q.type) where.type = q.type
    if (q.status) where.status = q.status
    if (q.clientId) where.clientId = q.clientId
    if (q.search) {
      where.OR = [
        { code: { contains: q.search } },
        { title: { contains: q.search } },
        { client: { fullName: { contains: q.search } } },
      ]
    }
    const [total, items] = await Promise.all([
      db().transaction.count({ where }),
      db().transaction.findMany({
        where,
        ...paging(q),
        orderBy: { createdAt: 'desc' },
        include: {
          client: { select: { id: true, code: true, fullName: true, type: true } },
          assignedTo: { select: { id: true, fullName: true } },
          _count: { select: { deeds: true, documents: true, invoices: true } },
        },
      }),
    ])
    return paginated(items, total, q)
  },
})

route('transactions.get', {
  auth: 'session',
  perm: 'transactions.view',
  schema: idSchema,
  handler: async ({ id }) => {
    const trx = await db().transaction.findFirst({
      where: { id, deletedAt: null },
      include: {
        client: { select: { id: true, code: true, fullName: true, nik: true, type: true, address: true, phone: true } },
        assignedTo: { select: { id: true, fullName: true } },
        createdBy: { select: { id: true, fullName: true } },
        parties: true,
        properties: { include: { certificates: true } },
        deeds: { include: { deedType: { select: { code: true, name: true } } }, orderBy: { deedDate: 'desc' } },
        documents: { where: { deletedAt: null }, include: { category: true }, orderBy: { createdAt: 'desc' } },
        invoices: { orderBy: { issueDate: 'desc' }, include: { payments: true } },
        appointments: { orderBy: { startAt: 'asc' } },
        tasks: { orderBy: { createdAt: 'desc' } },
        workflow: { orderBy: { createdAt: 'asc' }, include: { byUser: { select: { fullName: true } } } },
        deadlines: { orderBy: { dueDate: 'asc' } },
      },
    })
    if (!trx) throw new NotFoundError('Transaksi tidak ditemukan.')
    return trx
  },
})

route('transactions.create', {
  auth: 'session',
  perm: 'transactions.manage',
  schema: transactionSchema,
  handler: async (input, ctx) => {
    return inTransaction(async (tx) => {
      const code = await nextNumber(tx, 'transaction')
      const { parties, ...data } = input
      const created = await tx.transaction.create({
        data: {
          ...data,
          code,
          createdById: ctx.session!.userId,
          parties: parties?.length ? { create: parties.map(({ id: _id, ...p }: Record<string, any>) => p) } : undefined,
        },
      })
      await tx.workflowHistory.create({
        data: {
          transactionId: created.id,
          toStatus: created.status,
          byUserId: ctx.session!.userId,
          note: 'Transaksi dibuat',
        },
      })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'CREATE', entity: 'Transaction',
        entityId: created.id, after: { code, title: created.title, type: created.type, clientId: created.clientId },
      })
      return created
    })
  },
})

route('transactions.update', {
  auth: 'session',
  perm: 'transactions.manage',
  schema: transactionUpdateSchema,
  handler: async (input, ctx) => {
    const existing = await db().transaction.findFirst({ where: { id: input.id, deletedAt: null } })
    if (!existing) throw new NotFoundError('Transaksi tidak ditemukan.')
    if (['SELESAI', 'BATAL'].includes(existing.status)) {
      throw new ConflictError('Transaksi yang sudah ditutup tidak dapat diubah.')
    }
    return inTransaction(async (tx) => {
      const { id, parties, ...data } = input
      await tx.transactionParty.deleteMany({ where: { transactionId: id } })
      const updated = await tx.transaction.update({
        where: { id },
        data: {
          ...data,
          parties: parties?.length ? { create: parties.map(({ id: _i, ...p }: Record<string, any>) => p) } : undefined,
        },
      })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'UPDATE', entity: 'Transaction', entityId: id,
        before: { title: existing.title, description: existing.description, priority: existing.priority, assignedToId: existing.assignedToId },
        after: { title: updated.title, description: updated.description, priority: updated.priority, assignedToId: updated.assignedToId },
      })
      return updated
    })
  },
})

route('transactions.changeStatus', {
  auth: 'session',
  perm: 'transactions.manage',
  schema: transactionStatusSchema,
  handler: async (input, ctx) => {
    const existing = await db().transaction.findFirst({ where: { id: input.id, deletedAt: null } })
    if (!existing) throw new NotFoundError('Transaksi tidak ditemukan.')
    assertTransactionTransition(existing.status, input.status)
    if (input.status === 'BATAL' && !input.note) {
      throw new ConflictError('Alasan pembatalan wajib diisi.')
    }
    return inTransaction(async (tx) => {
      const updated = await tx.transaction.update({
        where: { id: input.id },
        data: {
          status: input.status,
          closedAt: ['SELESAI', 'BATAL'].includes(input.status) ? new Date() : null,
        },
      })
      await tx.workflowHistory.create({
        data: {
          transactionId: input.id,
          fromStatus: existing.status,
          toStatus: input.status,
          byUserId: ctx.session!.userId,
          note: input.note ?? null,
        },
      })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'STATUS_CHANGE', entity: 'Transaction',
        entityId: input.id,
        before: { status: existing.status },
        after: { status: input.status },
        meta: { note: input.note ?? null, label: WORKFLOW_LABELS[input.status] },
      })
      return updated
    })
  },
})

route('transactions.delete', {
  auth: 'session',
  perm: 'transactions.manage',
  schema: idSchema,
  handler: async ({ id }, ctx) => {
    const existing = await db().transaction.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { deeds: true, invoices: true } } },
    })
    if (!existing) throw new NotFoundError('Transaksi tidak ditemukan.')
    if (existing._count.deeds > 0 || existing._count.invoices > 0) {
      throw new ConflictError('Transaksi sudah memiliki akta/invoice sehingga tidak dapat dihapus.')
    }
    await inTransaction(async (tx) => {
      await tx.transaction.update({ where: { id }, data: { deletedAt: new Date() } })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'SOFT_DELETE', entity: 'Transaction',
        entityId: id, before: { code: existing.code, title: existing.title },
      })
    })
    return { ok: true }
  },
})

route('transactions.options', {
  auth: 'session',
  handler: async () => {
    return db().transaction.findMany({
      where: { deletedAt: null, status: { notIn: ['SELESAI', 'BATAL'] } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, code: true, title: true, type: true, clientId: true },
    })
  },
})
