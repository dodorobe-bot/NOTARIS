import { db, inTransaction } from '../db'
import { route } from './router'
import {
  expenseListSchema, expenseSchema, idSchema, invoiceListSchema, invoiceSchema, invoiceUpdateSchema,
  invoiceVoidSchema, paymentSchema, paginationSchema,
} from '../../shared/schemas'
import { audit } from '../lib/audit'
import { nextNumber } from '../lib/numbering'
import { paging, paginated, calcInvoiceTotals, invoiceStatusFor, dateRange, monthStart } from '../lib/util'
import { ConflictError, NotFoundError } from '../lib/errors'
import { getSetting } from '../lib/settings'
import { startOfZonedMonthOffset, zonedMonthKey } from '../lib/time'
import { APP_TIMEZONE } from '../../shared/format'
import { z } from 'zod'

/**
 * Semua pencatatan pembayaran diserialkan dalam proses utama. SQLite hanya
 * mengizinkan satu penulis; antrean ini mencegah dua permintaan membaca sisa
 * tagihan yang sama sebelum salah satunya sempat menulis.
 */
let paymentQueue: Promise<unknown> = Promise.resolve()
function serializedPayment<T>(fn: () => Promise<T>): Promise<T> {
  const run = paymentQueue.then(fn, fn)
  paymentQueue = run.then(() => undefined, () => undefined)
  return run
}

route('invoices.list', {
  auth: 'session',
  perm: 'finance.view',
  schema: invoiceListSchema,
  handler: async (q) => {
    const where: Record<string, unknown> = {}
    if (q.status) where.status = q.status
    if (q.clientId) where.clientId = q.clientId
    if (q.search) {
      where.OR = [
        { number: { contains: q.search } },
        { client: { fullName: { contains: q.search } } },
        { notes: { contains: q.search } },
      ]
    }
    const [total, items] = await Promise.all([
      db().invoice.count({ where }),
      db().invoice.findMany({
        where, ...paging(q), orderBy: { issueDate: 'desc' },
        include: {
          client: { select: { id: true, code: true, fullName: true } },
          transaction: { select: { id: true, code: true, title: true } },
          _count: { select: { items: true, payments: true } },
        },
      }),
    ])
    return paginated(items, total, q)
  },
})

route('invoices.get', {
  auth: 'session',
  perm: 'finance.view',
  schema: idSchema,
  handler: async ({ id }) => {
    const invoice = await db().invoice.findUnique({
      where: { id },
      include: {
        client: true,
        transaction: { select: { id: true, code: true, title: true } },
        deed: { select: { id: true, deedNumber: true, title: true } },
        items: true,
        payments: { orderBy: { paidAt: 'desc' }, include: { receivedBy: { select: { fullName: true } } } },
        createdBy: { select: { fullName: true } },
      },
    })
    if (!invoice) throw new NotFoundError('Invoice tidak ditemukan.')
    return invoice
  },
})

route('invoices.create', {
  auth: 'session',
  perm: 'finance.manage',
  schema: invoiceSchema,
  handler: async (input, ctx) => {
    const dueDays = Number(await getSetting('finance.invoiceDueDays', '14')) || 14
    const totals = calcInvoiceTotals(input.items, input.discount, input.taxPercent)
    return inTransaction(async (tx) => {
      const number = await nextNumber(tx, 'invoice', input.issueDate)
      const created = await tx.invoice.create({
        data: {
          number,
          clientId: input.clientId,
          transactionId: input.transactionId ?? null,
          deedId: input.deedId ?? null,
          issueDate: input.issueDate,
          dueDate: input.dueDate ?? new Date(input.issueDate.getTime() + dueDays * 86400_000),
          discount: input.discount,
          taxPercent: input.taxPercent,
          notes: input.notes,
          status: input.status,
          createdById: ctx.session!.userId,
          ...totals,
          items: {
            create: input.items.map((it: { kind: string; description: string; quantity: number; unitPrice: number }) => ({
              kind: it.kind,
              description: it.description,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              amount: Math.round(it.quantity * it.unitPrice),
            })),
          },
        },
      })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'CREATE', entity: 'Invoice',
        entityId: created.id,
        after: { number, total: created.total, clientId: created.clientId, status: created.status },
      })
      return created
    })
  },
})

route('invoices.update', {
  auth: 'session',
  perm: 'finance.manage',
  schema: invoiceUpdateSchema,
  handler: async (input, ctx) => {
    const existing = await db().invoice.findUnique({ where: { id: input.id }, include: { payments: true } })
    if (!existing) throw new NotFoundError('Invoice tidak ditemukan.')
    if (existing.status === 'VOID') throw new ConflictError('Invoice yang dibatalkan tidak dapat diubah.')
    if (existing.payments.length > 0) {
      throw new ConflictError('Invoice sudah memiliki pembayaran; rincian tidak dapat diubah.')
    }
    const totals = calcInvoiceTotals(input.items, input.discount, input.taxPercent)
    return inTransaction(async (tx) => {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: input.id } })
      const updated = await tx.invoice.update({
        where: { id: input.id },
        data: {
          clientId: input.clientId,
          transactionId: input.transactionId ?? null,
          deedId: input.deedId ?? null,
          issueDate: input.issueDate,
          dueDate: input.dueDate,
          discount: input.discount,
          taxPercent: input.taxPercent,
          notes: input.notes,
          status: input.status,
          ...totals,
          items: {
            create: input.items.map((it: { kind: string; description: string; quantity: number; unitPrice: number }) => ({
              kind: it.kind, description: it.description, quantity: it.quantity,
              unitPrice: it.unitPrice, amount: Math.round(it.quantity * it.unitPrice),
            })),
          },
        },
      })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'UPDATE', entity: 'Invoice', entityId: input.id,
        before: { total: existing.total, status: existing.status, discount: existing.discount },
        after: { total: updated.total, status: updated.status, discount: updated.discount },
      })
      return updated
    })
  },
})

route('invoices.void', {
  auth: 'session',
  perm: 'finance.manage',
  schema: invoiceVoidSchema,
  handler: async (input, ctx) => {
    const existing = await db().invoice.findUnique({ where: { id: input.id }, include: { payments: true } })
    if (!existing) throw new NotFoundError('Invoice tidak ditemukan.')
    if (existing.status === 'VOID') throw new ConflictError('Invoice sudah dibatalkan.')
    if (existing.payments.length > 0) throw new ConflictError('Invoice dengan pembayaran tidak dapat dibatalkan.')
    return inTransaction(async (tx) => {
      const updated = await tx.invoice.update({ where: { id: input.id }, data: { status: 'VOID' } })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'VOID', entity: 'Invoice', entityId: input.id,
        before: { status: existing.status }, after: { status: 'VOID' }, meta: { reason: input.reason },
      })
      return updated
    })
  },
})

route('payments.create', {
  auth: 'session',
  perm: 'finance.manage',
  schema: paymentSchema,
  handler: async (input, ctx) => serializedPayment(async () => {
    return inTransaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: input.invoiceId },
        include: { payments: { select: { amount: true } } },
      })
      if (!invoice) throw new NotFoundError('Invoice tidak ditemukan.')
      if (invoice.status === 'VOID') throw new ConflictError('Invoice dibatalkan tidak dapat menerima pembayaran.')
      if (invoice.status === 'DRAFT') throw new ConflictError('Terbitkan invoice terlebih dahulu sebelum mencatat pembayaran.')
      const paidBefore = invoice.payments.reduce((sum, p) => sum + p.amount, 0)
      const remaining = invoice.total - paidBefore
      if (input.amount > remaining) {
        throw new ConflictError(`Pembayaran melebihi sisa tagihan (${remaining}).`)
      }
      const number = await nextNumber(tx, 'payment', input.paidAt)
      const payment = await tx.payment.create({
        data: {
          number,
          invoiceId: input.invoiceId,
          amount: input.amount,
          method: input.method,
          paidAt: input.paidAt,
          reference: input.reference,
          notes: input.notes,
          receivedById: ctx.session!.userId,
        },
      })
      const paid = paidBefore + input.amount
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { paidAmount: paid, status: invoiceStatusFor(invoice.total, paid, invoice.status) },
      })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'PAYMENT', entity: 'Invoice', entityId: invoice.id,
        after: { paymentNumber: number, amount: input.amount, method: input.method, paidTotal: paid },
      })
      return payment
    })
  }),
})

route('payments.list', {
  auth: 'session',
  perm: 'finance.view',
  schema: paginationSchema.extend({ from: zDate(), to: zDate(), method: zString() }),
  handler: async (q) => {
    const where: Record<string, unknown> = {}
    const range = dateRange(q.from, q.to)
    if (range) where.paidAt = range
    if (q.method) where.method = q.method
    if (q.search) {
      where.OR = [
        { number: { contains: q.search } },
        { reference: { contains: q.search } },
        { invoice: { number: { contains: q.search } } },
        { invoice: { client: { fullName: { contains: q.search } } } },
      ]
    }
    const [total, items] = await Promise.all([
      db().payment.count({ where }),
      db().payment.findMany({
        where, ...paging(q), orderBy: { paidAt: 'desc' },
        include: {
          invoice: { select: { id: true, number: true, total: true, status: true, client: { select: { fullName: true, code: true } } } },
          receivedBy: { select: { fullName: true } },
        },
      }),
    ])
    const sum = await db().payment.aggregate({ where, _sum: { amount: true } })
    return { ...paginated(items, total, q), totalAmount: sum._sum.amount ?? 0 }
  },
})

route('expenses.list', {
  auth: 'session',
  perm: 'finance.view',
  schema: expenseListSchema,
  handler: async (q) => {
    const where: Record<string, unknown> = {}
    if (q.category) where.category = q.category
    const range = dateRange(q.from, q.to)
    if (range) where.expenseDate = range
    if (q.search) {
      where.OR = [
        { number: { contains: q.search } },
        { description: { contains: q.search } },
        { paidTo: { contains: q.search } },
      ]
    }
    const [total, items] = await Promise.all([
      db().expense.count({ where }),
      db().expense.findMany({
        where, ...paging(q), orderBy: { expenseDate: 'desc' },
        include: { createdBy: { select: { fullName: true } } },
      }),
    ])
    const sum = await db().expense.aggregate({ where, _sum: { amount: true } })
    return { ...paginated(items, total, q), totalAmount: sum._sum.amount ?? 0 }
  },
})

route('expenses.create', {
  auth: 'session',
  perm: 'finance.manage',
  schema: expenseSchema,
  handler: async (input, ctx) => {
    return inTransaction(async (tx) => {
      const number = await nextNumber(tx, 'expense', input.expenseDate)
      const created = await tx.expense.create({
        data: { ...input, number, createdById: ctx.session!.userId },
      })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'CREATE', entity: 'Expense', entityId: created.id,
        after: { number, amount: created.amount, category: created.category, description: created.description },
      })
      return created
    })
  },
})

route('expenses.update', {
  auth: 'session',
  perm: 'finance.manage',
  schema: expenseSchema.extend({ id: idSchema.shape.id }),
  handler: async (input, ctx) => {
    const existing = await db().expense.findUnique({ where: { id: input.id } })
    if (!existing) throw new NotFoundError('Pengeluaran tidak ditemukan.')
    return inTransaction(async (tx) => {
      const { id, ...data } = input
      const number = zonedMonthKey(existing.expenseDate) === zonedMonthKey(input.expenseDate)
        ? existing.number
        : await nextNumber(tx, 'expense', input.expenseDate)
      const updated = await tx.expense.update({ where: { id }, data: { ...data, number } })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'UPDATE', entity: 'Expense', entityId: id,
        before: { amount: existing.amount, description: existing.description, number: existing.number },
        after: { amount: updated.amount, description: updated.description, number: updated.number },
      })
      return updated
    })
  },
})

route('expenses.delete', {
  auth: 'session',
  perm: 'finance.manage',
  schema: idSchema,
  handler: async ({ id }, ctx) => {
    const existing = await db().expense.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Pengeluaran tidak ditemukan.')
    await inTransaction(async (tx) => {
      await tx.expense.delete({ where: { id } })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'DELETE', entity: 'Expense', entityId: id,
        before: { number: existing.number, amount: existing.amount, description: existing.description },
      })
    })
    return { ok: true }
  },
})

route('finance.summary', {
  auth: 'session',
  perm: 'finance.view',
  handler: async () => {
    const now = new Date()
    const from = monthStart(now)
    const to = startOfZonedMonthOffset(now, 1)
    const from6 = startOfZonedMonthOffset(now, -5)
    const [incomeMonth, expenseMonth, outstanding, invoiceAgg, payments, expenses] = await Promise.all([
      db().payment.aggregate({ where: { paidAt: { gte: from, lt: to } }, _sum: { amount: true } }),
      db().expense.aggregate({ where: { expenseDate: { gte: from, lt: to } }, _sum: { amount: true } }),
      db().invoice.aggregate({
        where: { status: { in: ['UNPAID', 'PARTIAL'] } },
        _sum: { total: true, paidAmount: true },
      }),
      db().invoice.groupBy({ by: ['status'], _count: { _all: true }, _sum: { total: true } }),
      db().payment.findMany({
        where: { paidAt: { gte: from6 } },
        select: { paidAt: true, amount: true },
      }),
      db().expense.findMany({
        where: { expenseDate: { gte: from6 } },
        select: { expenseDate: true, amount: true, category: true },
      }),
    ])
    const months: { key: string; label: string; income: number; expense: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = startOfZonedMonthOffset(now, -i)
      months.push({
        key: zonedMonthKey(d),
        label: new Intl.DateTimeFormat('id-ID', { month: 'short', year: '2-digit', timeZone: APP_TIMEZONE }).format(d),
        income: 0,
        expense: 0,
      })
    }
    for (const p of payments) {
      const m = months.find((x) => x.key === zonedMonthKey(p.paidAt))
      if (m) m.income += p.amount
    }
    for (const e of expenses) {
      const m = months.find((x) => x.key === zonedMonthKey(e.expenseDate))
      if (m) m.expense += e.amount
    }
    const expenseByCategory: Record<string, number> = {}
    for (const e of expenses) expenseByCategory[e.category] = (expenseByCategory[e.category] ?? 0) + e.amount
    return {
      incomeMonth: incomeMonth._sum.amount ?? 0,
      expenseMonth: expenseMonth._sum.amount ?? 0,
      netMonth: (incomeMonth._sum.amount ?? 0) - (expenseMonth._sum.amount ?? 0),
      outstanding: (outstanding._sum.total ?? 0) - (outstanding._sum.paidAmount ?? 0),
      invoicesByStatus: invoiceAgg.map((i) => ({ status: i.status, count: i._count._all, total: i._sum.total ?? 0 })),
      months,
      expenseByCategory,
    }
  },
})

route('finance.outstanding', {
  auth: 'session',
  perm: 'finance.view',
  schema: paginationSchema,
  handler: async (q) => {
    const where: Record<string, unknown> = { status: { in: ['UNPAID', 'PARTIAL'] } }
    if (q.search) {
      where.OR = [
        { number: { contains: q.search } },
        { client: { fullName: { contains: q.search } } },
      ]
    }
    const [total, items] = await Promise.all([
      db().invoice.count({ where }),
      db().invoice.findMany({
        where, ...paging(q), orderBy: { dueDate: 'asc' },
        include: { client: { select: { fullName: true, code: true } } },
      }),
    ])
    return paginated(items, total, q)
  },
})

function zDate() {
  return z.string().optional()
}
function zString() {
  return z.string().optional()
}
