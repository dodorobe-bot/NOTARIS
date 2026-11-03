import { db, inTransaction } from '../db'
import { route } from './router'
import { idSchema, propertySchema, propertyUpdateSchema, paginationSchema } from '../../shared/schemas'
import { audit } from '../lib/audit'
import { paging, paginated } from '../lib/util'
import { NotFoundError, ConflictError } from '../lib/errors'
import { z } from 'zod'
import { startOfToday, endOfToday } from '../lib/util'

const ppatListSchema = paginationSchema.extend({
  rightType: z.string().optional(),
  transactionId: z.string().uuid().optional(),
})

interface PropertyLike {
  certificateNumber: string | null
  rightType: string | null
  landArea: number | null
  buildingArea: number | null
  ownerName: string | null
  transactionPrice: number | null
  certificates?: Array<{ number: string; type: string; ownerName: string | null }>
}

function propertySnapshot(property: PropertyLike) {
  return {
    certificateNumber: property.certificateNumber,
    rightType: property.rightType,
    landArea: property.landArea,
    buildingArea: property.buildingArea,
    ownerName: property.ownerName,
    transactionPrice: property.transactionPrice,
    certificates: (property.certificates ?? []).map((c) => ({ number: c.number, type: c.type, ownerName: c.ownerName })),
  }
}

/** Objek tanah pada transaksi yang sudah ditutup tidak boleh berubah tanpa jejak. */
async function assertPropertyEditable(transactionId: string | null): Promise<void> {
  if (!transactionId) return
  const transaction = await db().transaction.findUnique({ where: { id: transactionId }, select: { status: true } })
  if (transaction && ['SELESAI', 'BATAL'].includes(transaction.status)) {
    throw new ConflictError('Objek tanah milik transaksi yang sudah ditutup tidak dapat diubah atau dihapus.')
  }
}

route('ppat.properties.list', {
  auth: 'session',
  perm: 'ppat.view',
  schema: ppatListSchema,
  handler: async (q) => {
    const where: Record<string, unknown> = {}
    if (q.rightType) where.rightType = q.rightType
    if (q.transactionId) where.transactionId = q.transactionId
    if (q.search) {
      where.OR = [
        { certificateNumber: { contains: q.search } },
        { ownerName: { contains: q.search } },
        { address: { contains: q.search } },
        { nop: { contains: q.search } },
        { transaction: { code: { contains: q.search } } },
        { transaction: { client: { fullName: { contains: q.search } } } },
      ]
    }
    const [total, items] = await Promise.all([
      db().property.count({ where }),
      db().property.findMany({
        where,
        ...paging(q),
        orderBy: { createdAt: 'desc' },
        include: {
          certificates: true,
          transaction: {
            select: {
              id: true, code: true, serviceType: true, status: true,
              client: { select: { id: true, fullName: true, code: true } },
            },
          },
          deadlines: { orderBy: { dueDate: 'asc' }, take: 3 },
        },
      }),
    ])
    return paginated(items, total, q)
  },
})

route('ppat.properties.get', {
  auth: 'session',
  perm: 'ppat.view',
  schema: idSchema,
  handler: async ({ id }) => {
    const property = await db().property.findUnique({
      where: { id },
      include: {
        certificates: true,
        transaction: { include: { client: true, parties: true } },
        deadlines: { orderBy: { dueDate: 'asc' } },
      },
    })
    if (!property) throw new NotFoundError('Objek tanah tidak ditemukan.')
    return property
  },
})

route('ppat.properties.create', {
  auth: 'session',
  perm: 'ppat.manage',
  schema: propertySchema,
  handler: async (input, ctx) => {
    await assertPropertyEditable(input.transactionId ?? null)
    return inTransaction(async (tx) => {
      const { certificates, ...data } = input
      const created = await tx.property.create({
        data: {
          ...data,
          certificates: certificates?.length ? { create: certificates.map(({ id: _id, ...c }: Record<string, any>) => c) } : undefined,
        },
        include: { certificates: true },
      })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'CREATE', entity: 'Property',
        entityId: created.id,
        after: { certificateNumber: created.certificateNumber, rightType: created.rightType, transactionId: created.transactionId },
      })
      return created
    })
  },
})

route('ppat.properties.update', {
  auth: 'session',
  perm: 'ppat.manage',
  schema: propertyUpdateSchema,
  handler: async (input, ctx) => {
    const existing = await db().property.findUnique({ where: { id: input.id }, include: { certificates: true } })
    if (!existing) throw new NotFoundError('Objek tanah tidak ditemukan.')
    await assertPropertyEditable(existing.transactionId)
    return inTransaction(async (tx) => {
      const { id, certificates, ...data } = input
      await tx.certificate.deleteMany({ where: { propertyId: id } })
      const updated = await tx.property.update({
        where: { id },
        data: {
          ...data,
          certificates: certificates?.length ? { create: certificates.map(({ id: _cid, ...c }: Record<string, any>) => c) } : undefined,
        },
        include: { certificates: true },
      })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'UPDATE', entity: 'Property', entityId: id,
        before: propertySnapshot(existing),
        after: propertySnapshot(updated),
      })
      return updated
    })
  },
})

route('ppat.properties.delete', {
  auth: 'session',
  perm: 'ppat.manage',
  schema: idSchema,
  handler: async ({ id }, ctx) => {
    const existing = await db().property.findUnique({
      where: { id },
      include: { certificates: true, _count: { select: { deadlines: true } } },
    })
    if (!existing) throw new NotFoundError('Objek tanah tidak ditemukan.')
    await assertPropertyEditable(existing.transactionId)
    if (existing.certificates.length > 0) {
      throw new ConflictError('Objek tanah masih memiliki data sertifikat. Hapus keterkaitan sertifikat secara resmi terlebih dahulu.')
    }
    if (existing._count.deadlines > 0) {
      throw new ConflictError('Objek tanah masih terkait tenggat hukum. Selesaikan atau pindahkan tenggat tersebut terlebih dahulu.')
    }
    await inTransaction(async (tx) => {
      await tx.property.delete({ where: { id } })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'DELETE', entity: 'Property', entityId: id,
        before: propertySnapshot(existing),
      })
    })
    return { ok: true }
  },
})

route('ppat.summary', {
  auth: 'session',
  perm: 'ppat.view',
  handler: async () => {
    const [byService, totalProperties, totalCertificates, activeDeadlines] = await Promise.all([
      db().transaction.groupBy({
        by: ['serviceType'],
        where: { type: 'PPAT', deletedAt: null },
        _count: { _all: true },
      }),
      db().property.count(),
      db().certificate.count(),
      db().legalDeadline.count({ where: { status: 'AKTIF' } }),
    ])
    const ppatProcess = await db().transaction.count({
      where: { type: 'PPAT', deletedAt: null, status: { notIn: ['SELESAI', 'BATAL'] } },
    })
    return {
      byService: byService.map((s) => ({ serviceType: s.serviceType ?? 'LAINNYA', count: s._count._all })),
      totalProperties,
      totalCertificates,
      activeDeadlines,
      ppatProcess,
    }
  },
})

route('ppat.dashboard', {
  auth: 'session',
  perm: 'ppat.view',
  handler: async () => {
    const [recent, todayAppointments] = await Promise.all([
      db().transaction.findMany({
        where: { type: 'PPAT', deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { client: { select: { fullName: true } }, properties: { select: { id: true, certificateNumber: true } } },
      }),
      db().appointment.findMany({
        where: { startAt: { gte: startOfToday(), lte: endOfToday() } },
        orderBy: { startAt: 'asc' },
        include: { client: { select: { fullName: true } } },
      }),
    ])
    const deadlines = await db().legalDeadline.findMany({
      where: { status: 'AKTIF' },
      orderBy: { dueDate: 'asc' },
      take: 10,
      include: { transaction: { select: { code: true, title: true } }, property: { select: { certificateNumber: true } } },
    })
    return { recent, todayAppointments, deadlines }
  },
})
