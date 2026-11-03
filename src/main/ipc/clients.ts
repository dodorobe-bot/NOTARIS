import { db, inTransaction } from '../db'
import { route } from './router'
import { clientListSchema, clientSchema, clientUpdateSchema, idSchema } from '../../shared/schemas'
import { audit } from '../lib/audit'
import { nextNumber } from '../lib/numbering'
import { paging, paginated } from '../lib/util'
import { NotFoundError, ConflictError } from '../lib/errors'

function auditSnapshot(client: {
  fullName: string; nik: string | null; npwp: string | null; phone: string | null; email: string | null;
  type: string; status: string; address: string | null;
}) {
  return {
    fullName: client.fullName, nik: client.nik, npwp: client.npwp, phone: client.phone,
    email: client.email, type: client.type, status: client.status, address: client.address,
  }
}

route('clients.list', {
  auth: 'session',
  perm: 'clients.view',
  schema: clientListSchema,
  handler: async (q) => {
    const where: Record<string, unknown> = { deletedAt: null }
    if (q.type) where.type = q.type
    if (q.status) where.status = q.status
    if (q.search) {
      where.OR = [
        { code: { contains: q.search } },
        { fullName: { contains: q.search } },
        { nik: { contains: q.search } },
        { npwp: { contains: q.search } },
        { phone: { contains: q.search } },
        { email: { contains: q.search } },
        { company: { companyName: { contains: q.search } } },
      ]
    }
    const [total, items] = await Promise.all([
      db().client.count({ where }),
      db().client.findMany({
        where,
        ...paging(q),
        orderBy: { createdAt: 'desc' },
        include: { company: { select: { companyName: true, legalType: true } }, _count: { select: { transactions: true, deeds: true } } },
      }),
    ])
    return paginated(items, total, q)
  },
})

route('clients.options', {
  auth: 'session',
  schema: clientListSchema.pick({ search: true }).partial(),
  handler: async (q) => {
    const search = (q as { search?: string }).search ?? ''
    const items = await db().client.findMany({
      where: {
        deletedAt: null,
        ...(search
          ? { OR: [{ fullName: { contains: search } }, { code: { contains: search } }, { nik: { contains: search } }] }
          : {}),
      },
      take: 50,
      orderBy: { fullName: 'asc' },
      select: { id: true, code: true, fullName: true, type: true, nik: true, phone: true },
    })
    return items
  },
})

route('clients.get', {
  auth: 'session',
  perm: 'clients.view',
  schema: idSchema,
  handler: async ({ id }) => {
    const client = await db().client.findFirst({
      where: { id, deletedAt: null },
      include: {
        identities: { include: { document: { select: { id: true, title: true } } }, orderBy: { createdAt: 'asc' } },
        company: true,
        transactions: { orderBy: { createdAt: 'desc' }, take: 10 },
        deeds: {
          orderBy: { deedDate: 'desc' }, take: 10,
          include: { deedType: { select: { name: true } } },
        },
        invoices: { orderBy: { issueDate: 'desc' }, take: 10 },
        documents: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 20, include: { category: true } },
      },
    })
    if (!client) throw new NotFoundError('Klien tidak ditemukan.')
    return client
  },
})

route('clients.create', {
  auth: 'session',
  perm: 'clients.manage',
  schema: clientSchema,
  handler: async (input, ctx) => {
    return inTransaction(async (tx) => {
      const code = await nextNumber(tx, 'client')
      const { identities, company, ...data } = input
      const created = await tx.client.create({
        data: {
          ...data,
          code,
          createdById: ctx.session!.userId,
          identities: identities?.length ? { create: identities.map(({ id: _id, ...i }: Record<string, any>) => i) } : undefined,
          company: company ? { create: company } : undefined,
        },
        include: { identities: true, company: true },
      })
      await audit(tx, {
        userId: ctx.session!.userId,
        username: ctx.username,
        action: 'CREATE',
        entity: 'Client',
        entityId: created.id,
        after: { code, ...auditSnapshot(created) },
      })
      return created
    })
  },
})

route('clients.update', {
  auth: 'session',
  perm: 'clients.manage',
  schema: clientUpdateSchema,
  handler: async (input, ctx) => {
    const existing = await db().client.findFirst({
      where: { id: input.id, deletedAt: null },
      include: { identities: true, company: true },
    })
    if (!existing) throw new NotFoundError('Klien tidak ditemukan.')
    return inTransaction(async (tx) => {
      const { id, identities, company, ...data } = input
      await tx.clientIdentity.deleteMany({ where: { clientId: id } })
      const updated = await tx.client.update({
        where: { id },
        data: {
          ...data,
          identities: identities?.length ? { create: identities.map(({ id: _i, ...rest }: Record<string, any>) => rest) } : undefined,
          company: company
            ? { upsert: { create: company, update: company } }
            : { delete: !!existing.company },
        },
        include: { identities: true, company: true },
      })
      await audit(tx, {
        userId: ctx.session!.userId,
        username: ctx.username,
        action: 'UPDATE',
        entity: 'Client',
        entityId: id,
        before: auditSnapshot(existing),
        after: auditSnapshot(updated),
      })
      return updated
    })
  },
})

route('clients.delete', {
  auth: 'session',
  perm: 'clients.manage',
  schema: idSchema,
  handler: async ({ id }, ctx) => {
    const existing = await db().client.findFirst({ where: { id, deletedAt: null } })
    if (!existing) throw new NotFoundError('Klien tidak ditemukan.')
    const activeTx = await db().transaction.count({ where: { clientId: id, deletedAt: null, status: { notIn: ['SELESAI', 'BATAL'] } } })
    if (activeTx > 0) throw new ConflictError('Klien masih memiliki transaksi berjalan. Selesaikan transaksi terlebih dahulu.')
    await inTransaction(async (tx) => {
      await tx.client.update({ where: { id }, data: { deletedAt: new Date(), status: 'NONAKTIF' } })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'SOFT_DELETE',
        entity: 'Client', entityId: id, before: auditSnapshot(existing),
      })
    })
    return { ok: true }
  },
})

route('clients.restore', {
  auth: 'session',
  perm: 'clients.manage',
  schema: idSchema,
  handler: async ({ id }, ctx) => {
    await inTransaction(async (tx) => {
      await tx.client.update({ where: { id }, data: { deletedAt: null, status: 'AKTIF' } })
      await audit(tx, { userId: ctx.session!.userId, username: ctx.username, action: 'RESTORE', entity: 'Client', entityId: id })
    })
    return { ok: true }
  },
})
