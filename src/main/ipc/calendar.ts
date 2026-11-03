import { z } from 'zod'
import { db, inTransaction } from '../db'
import { route } from './router'
import {
  appointmentSchema, appointmentUpdateSchema, deadlineSchema, idSchema, paginationSchema, taskSchema,
} from '../../shared/schemas'
import { audit } from '../lib/audit'
import { paging, paginated, dateRange } from '../lib/util'
import { refreshOverdueDeadlines } from '../lib/automation'
import { NotFoundError, ConflictError } from '../lib/errors'

const rangeSchema = z.object({ from: z.string().min(8), to: z.string().min(8) })

route('calendar.appointments', {
  auth: 'session',
  perm: 'calendar.view',
  schema: rangeSchema,
  handler: async ({ from, to }) => {
    return db().appointment.findMany({
      where: { startAt: dateRange(from, to) },
      orderBy: { startAt: 'asc' },
      include: {
        client: { select: { id: true, fullName: true } },
        transaction: { select: { id: true, code: true, title: true } },
        assignedTo: { select: { id: true, fullName: true } },
      },
    })
  },
})

route('appointments.create', {
  auth: 'session',
  perm: 'calendar.manage',
  schema: appointmentSchema,
  handler: async (input, ctx) => {
    if (input.endAt && input.endAt <= input.startAt) throw new ConflictError('Waktu selesai harus setelah waktu mulai.')
    return inTransaction(async (tx) => {
      const created = await tx.appointment.create({ data: { ...input, createdById: ctx.session!.userId } })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'CREATE', entity: 'Appointment', entityId: created.id,
        after: { title: created.title, startAt: created.startAt, type: created.type },
      })
      return created
    })
  },
})

route('appointments.update', {
  auth: 'session',
  perm: 'calendar.manage',
  schema: appointmentUpdateSchema,
  handler: async (input, ctx) => {
    const existing = await db().appointment.findUnique({ where: { id: input.id } })
    if (!existing) throw new NotFoundError('Jadwal tidak ditemukan.')
    const startAt = input.startAt ?? existing.startAt
    const endAt = input.endAt ?? existing.endAt
    if (endAt && endAt <= startAt) throw new ConflictError('Waktu selesai harus setelah waktu mulai.')
    return inTransaction(async (tx) => {
      const { id, ...data } = input
      const updated = await tx.appointment.update({ where: { id }, data })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'UPDATE', entity: 'Appointment', entityId: id,
        before: { title: existing.title, startAt: existing.startAt, status: existing.status },
        after: { title: updated.title, startAt: updated.startAt, status: updated.status },
      })
      return updated
    })
  },
})

route('appointments.delete', {
  auth: 'session',
  perm: 'calendar.manage',
  schema: idSchema,
  handler: async ({ id }, ctx) => {
    const existing = await db().appointment.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Jadwal tidak ditemukan.')
    await inTransaction(async (tx) => {
      await tx.appointment.delete({ where: { id } })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'DELETE', entity: 'Appointment', entityId: id,
        before: { title: existing.title, startAt: existing.startAt },
      })
    })
    return { ok: true }
  },
})

route('tasks.list', {
  auth: 'session',
  perm: 'calendar.view',
  schema: paginationSchema.extend({ status: z.string().optional(), mine: z.boolean().optional() }),
  handler: async (q, ctx) => {
    const where: Record<string, unknown> = {}
    if (q.status) where.status = q.status
    if (q.mine) where.assignedToId = ctx.session!.userId
    if (q.search) where.title = { contains: q.search }
    const [total, items] = await Promise.all([
      db().workTask.count({ where }),
      db().workTask.findMany({
        where, ...paging(q), orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
        include: {
          assignedTo: { select: { id: true, fullName: true } },
          transaction: { select: { id: true, code: true } },
          deed: { select: { id: true, deedNumber: true } },
        },
      }),
    ])
    return paginated(items, total, q)
  },
})

route('tasks.create', {
  auth: 'session',
  perm: 'calendar.manage',
  schema: taskSchema,
  handler: async (input, ctx) => {
    return inTransaction(async (tx) => {
      const created = await tx.workTask.create({ data: { ...input, createdById: ctx.session!.userId } })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'CREATE', entity: 'WorkTask', entityId: created.id,
        after: { title: created.title, dueDate: created.dueDate },
      })
      return created
    })
  },
})

route('tasks.update', {
  auth: 'session',
  perm: 'calendar.manage',
  schema: taskSchema.partial().extend({ id: idSchema.shape.id }),
  handler: async (input, ctx) => {
    const existing = await db().workTask.findUnique({ where: { id: input.id } })
    if (!existing) throw new NotFoundError('Tugas tidak ditemukan.')
    return inTransaction(async (tx) => {
      const { id, ...data } = input
      const updated = await tx.workTask.update({
        where: { id },
        data: {
          ...data,
          completedAt: data.status === 'DONE' ? (existing.completedAt ?? new Date()) : data.status ? null : existing.completedAt,
        },
      })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'UPDATE', entity: 'WorkTask', entityId: id,
        before: { status: existing.status }, after: { status: updated.status },
      })
      return updated
    })
  },
})

route('tasks.delete', {
  auth: 'session',
  perm: 'calendar.manage',
  schema: idSchema,
  handler: async ({ id }, ctx) => {
    const existing = await db().workTask.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Tugas tidak ditemukan.')
    await inTransaction(async (tx) => {
      await tx.workTask.delete({ where: { id } })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'DELETE', entity: 'WorkTask', entityId: id,
        before: { title: existing.title, status: existing.status },
      })
    })
    return { ok: true }
  },
})

route('deadlines.list', {
  auth: 'session',
  perm: 'calendar.view',
  schema: paginationSchema.extend({ status: z.string().optional() }),
  handler: async (q, ctx) => {
    await refreshOverdueDeadlines({ userId: ctx.session!.userId, username: ctx.username })
    const where: Record<string, unknown> = {}
    if (q.status) where.status = q.status
    if (q.search) where.title = { contains: q.search }
    const [total, items] = await Promise.all([
      db().legalDeadline.count({ where }),
      db().legalDeadline.findMany({
        where, ...paging(q), orderBy: { dueDate: 'asc' },
        include: {
          transaction: { select: { id: true, code: true, title: true } },
          deed: { select: { id: true, deedNumber: true } },
          property: { select: { id: true, certificateNumber: true } },
        },
      }),
    ])
    return paginated(items, total, q)
  },
})

route('deadlines.create', {
  auth: 'session',
  perm: 'calendar.manage',
  schema: deadlineSchema,
  handler: async (input, ctx) => {
    return inTransaction(async (tx) => {
      const created = await tx.legalDeadline.create({ data: { ...input, createdById: ctx.session!.userId } })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'CREATE', entity: 'LegalDeadline', entityId: created.id,
        after: { title: created.title, dueDate: created.dueDate, type: created.type },
      })
      return created
    })
  },
})

route('deadlines.update', {
  auth: 'session',
  perm: 'calendar.manage',
  schema: deadlineSchema.partial().extend({ id: idSchema.shape.id }),
  handler: async (input, ctx) => {
    const existing = await db().legalDeadline.findUnique({ where: { id: input.id } })
    if (!existing) throw new NotFoundError('Tenggat tidak ditemukan.')
    return inTransaction(async (tx) => {
      const { id, ...data } = input
      const updated = await tx.legalDeadline.update({ where: { id }, data })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'UPDATE', entity: 'LegalDeadline', entityId: id,
        before: { status: existing.status, dueDate: existing.dueDate },
        after: { status: updated.status, dueDate: updated.dueDate },
      })
      return updated
    })
  },
})

route('deadlines.delete', {
  auth: 'session',
  perm: 'calendar.manage',
  schema: idSchema,
  handler: async ({ id }, ctx) => {
    const existing = await db().legalDeadline.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Tenggat tidak ditemukan.')
    await inTransaction(async (tx) => {
      await tx.legalDeadline.delete({ where: { id } })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'DELETE', entity: 'LegalDeadline', entityId: id,
        before: { title: existing.title, dueDate: existing.dueDate, status: existing.status },
      })
    })
    return { ok: true }
  },
})
