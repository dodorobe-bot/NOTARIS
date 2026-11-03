import fs from 'node:fs'
import path from 'node:path'
import { db, inTransaction } from '../db'
import { route } from './router'
import {
  deedListSchema, deedSchema, deedStatusSchema, deedUpdateSchema, idSchema, protocolSchema, repertoriumSchema,
} from '../../shared/schemas'
import { audit } from '../lib/audit'
import { nextNumber } from '../lib/numbering'
import { paging, paginated, parseJsonOrNull } from '../lib/util'
import { paginationSchema } from '../../shared/schemas'
import { z } from 'zod'
import { ConflictError, NotFoundError, PermissionError } from '../lib/errors'
import { assertDeedContentEditable, assertDeedTransition } from '../lib/workflow'
import { can } from '../lib/rbac'
import { getSettings } from '../lib/settings'
import { renderDocx, resolveTemplate } from '../lib/docx'
import { storeFile } from '../lib/documents'
import { dirs, safeSegment } from '../lib/paths'
import { formatDateLong } from '../../shared/format'
import { DEED_STATUS_LABELS } from '../../shared/constants'

const paginationQuerySchema = paginationSchema.extend({
  year: z
    .union([z.number(), z.string()])
    .optional()
    .transform((v) => (v === '' || v === undefined ? undefined : Number(v))),
})


function witnessNames(json: string | null | undefined): string[] {
  const parsed = parseJsonOrNull(json)
  if (!Array.isArray(parsed)) return []
  return parsed
    .map((w) => (typeof w === 'string' ? w : (w as { name?: string; nama?: string })?.name ?? (w as { nama?: string })?.nama))
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
}

route('deeds.types', {
  auth: 'session',
  handler: async () => db().deedType.findMany({ where: { isActive: true }, orderBy: [{ category: 'asc' }, { name: 'asc' }] }),
})

route('deeds.list', {
  auth: 'session',
  perm: 'deeds.view',
  schema: deedListSchema,
  handler: async (q) => {
    const where: Record<string, unknown> = {}
    if (q.status) where.status = q.status
    if (q.deedTypeId) where.deedTypeId = q.deedTypeId
    if (q.clientId) where.clientId = q.clientId
    if (q.year) {
      where.deedDate = { gte: new Date(q.year, 0, 1), lt: new Date(q.year + 1, 0, 1) }
    }
    if (q.search) {
      where.OR = [
        { deedNumber: { contains: q.search } },
        { title: { contains: q.search } },
        { client: { fullName: { contains: q.search } } },
        { penghadap: { contains: q.search } },
      ]
    }
    const [total, items] = await Promise.all([
      db().deed.count({ where }),
      db().deed.findMany({
        where,
        ...paging(q),
        orderBy: [{ deedDate: 'desc' }, { deedNumber: 'desc' }],
        include: {
          deedType: { select: { code: true, name: true, category: true } },
          client: { select: { id: true, code: true, fullName: true } },
          notary: { select: { id: true, fullName: true } },
          repertorium: { select: { number: true, year: true } },
        },
      }),
    ])
    return paginated(items, total, q)
  },
})

route('deeds.get', {
  auth: 'session',
  perm: 'deeds.view',
  schema: idSchema,
  handler: async ({ id }) => {
    const deed = await db().deed.findUnique({
      where: { id },
      include: {
        deedType: true,
        client: { select: { id: true, code: true, fullName: true, nik: true, address: true, type: true } },
        transaction: { select: { id: true, code: true, title: true, status: true } },
        parties: true,
        notary: { select: { id: true, fullName: true } },
        draftMaker: { select: { id: true, fullName: true } },
        repertorium: true,
        protocol: true,
        revisions: { orderBy: { revisionNo: 'desc' }, take: 20 },
        workflow: { orderBy: { createdAt: 'asc' }, include: { byUser: { select: { fullName: true } } } },
        documents: { where: { deletedAt: null }, include: { category: true } },
      },
    })
    if (!deed) throw new NotFoundError('Akta tidak ditemukan.')
    return deed
  },
})

route('deeds.create', {
  auth: 'session',
  perm: 'deeds.manage',
  schema: deedSchema,
  handler: async (input, ctx) => {
    const client = await db().client.findFirst({ where: { id: input.clientId, deletedAt: null } })
    if (!client) throw new NotFoundError('Klien tidak ditemukan.')
    const deedType = await db().deedType.findUnique({ where: { id: input.deedTypeId } })
    if (!deedType) throw new NotFoundError('Jenis akta tidak ditemukan.')
    return inTransaction(async (tx) => {
      const deedNumber = await nextNumber(tx, 'deed', input.deedDate)
      const { parties, ...rest } = input
      const created = await tx.deed.create({
        data: {
          ...rest,
          deedNumber,
          title: input.title ?? deedType.name,
          createdById: ctx.session!.userId,
          parties: parties?.length ? { create: parties.map(({ id: _id, ...p }: Record<string, any>) => p) } : undefined,
        },
      })
      await tx.workflowHistory.create({
        data: { deedId: created.id, toStatus: 'DRAFT', byUserId: ctx.session!.userId, note: 'Draft akta dibuat' },
      })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'CREATE', entity: 'Deed',
        entityId: created.id,
        after: { deedNumber, deedType: deedType.name, client: client.fullName, status: created.status },
      })
      return created
    })
  },
})

route('deeds.update', {
  auth: 'session',
  perm: 'deeds.manage',
  schema: deedUpdateSchema,
  handler: async (input, ctx) => {
    const existing = await db().deed.findUnique({ where: { id: input.id }, include: { parties: true } })
    if (!existing) throw new NotFoundError('Akta tidak ditemukan.')
    assertDeedContentEditable(existing.status)
    return inTransaction(async (tx) => {
      const lastRevision = await tx.deedRevision.findFirst({
        where: { deedId: existing.id }, orderBy: { revisionNo: 'desc' }, select: { revisionNo: true },
      })
      await tx.deedRevision.create({
        data: {
          deedId: existing.id,
          revisionNo: (lastRevision?.revisionNo ?? 0) + 1,
          snapshotJson: JSON.stringify({
            title: existing.title, status: existing.status, penghadap: existing.penghadap,
            komparisi: existing.komparisi, premis: existing.premis, isi: existing.isi,
            penutup: existing.penutup, witnessesJson: existing.witnessesJson, parties: existing.parties,
          }),
          changeNote: 'Snapshot sebelum perubahan',
          createdById: ctx.session!.userId,
        },
      })
      const { id, parties, ...data } = input
      await tx.deedParty.deleteMany({ where: { deedId: id } })
      const updated = await tx.deed.update({
        where: { id },
        data: { ...data, parties: parties?.length ? { create: parties.map(({ id: _i, ...p }: Record<string, any>) => p) } : undefined },
      })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'UPDATE', entity: 'Deed',
        entityId: id,
        before: { title: existing.title, status: existing.status },
        after: { title: updated.title, status: updated.status },
        meta: { revision: (lastRevision?.revisionNo ?? 0) + 1 },
      })
      return updated
    })
  },
})

route('deeds.changeStatus', {
  auth: 'session',
  perm: 'deeds.manage',
  schema: deedStatusSchema,
  handler: async (input, ctx) => {
    const existing = await db().deed.findUnique({ where: { id: input.id }, include: { deedType: true, client: true } })
    if (!existing) throw new NotFoundError('Akta tidak ditemukan.')
    assertDeedTransition(existing.status, input.status)
    if (['APPROVED', 'SIGNED', 'REGISTERED', 'ARCHIVED'].includes(input.status) && !can(ctx.session, 'deeds.approve')) {
      throw new PermissionError('Hanya Notaris/PPAT yang berwenang menyetujui dan menandatangani akta.')
    }
    if (input.status === 'CANCELLED' && !input.note) throw new ConflictError('Alasan pembatalan wajib diisi.')
    if (input.status === 'SIGNED' && !existing.notaryId) {
      throw new ConflictError('Notaris/PPAT penanggung jawab belum ditetapkan pada akta ini.')
    }
    return inTransaction(async (tx) => {
      const updated = await tx.deed.update({
        where: { id: input.id },
        data: {
          status: input.status,
          signedAt: input.status === 'SIGNED' ? new Date() : existing.signedAt,
        },
      })
      let repertoriumCreated = false
      if (input.status === 'REGISTERED') {
        const already = await tx.deedRepertorium.findUnique({ where: { deedId: existing.id } })
        if (!already) {
          const year = existing.deedDate.getFullYear()
          const last = await tx.deedRepertorium.findFirst({ where: { year }, orderBy: { number: 'desc' } })
          await tx.deedRepertorium.create({
            data: {
              deedId: existing.id,
              year,
              number: (last?.number ?? 0) + 1,
              notaryId: existing.notaryId,
              notes: 'Otomatis tercatat saat status akta menjadi Tercatat',
            },
          })
          repertoriumCreated = true
        }
      }
      await tx.workflowHistory.create({
        data: {
          deedId: existing.id, fromStatus: existing.status, toStatus: input.status,
          byUserId: ctx.session!.userId, note: input.note ?? null,
        },
      })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'STATUS_CHANGE', entity: 'Deed',
        entityId: existing.id,
        before: { status: existing.status },
        after: { status: input.status },
        meta: { note: input.note ?? null, label: DEED_STATUS_LABELS[input.status], repertoriumCreated },
      })
      return { ...updated, repertoriumCreated }
    })
  },
})

route('deeds.revisions', {
  auth: 'session',
  perm: 'deeds.view',
  schema: idSchema,
  handler: async ({ id }) => {
    const rows = await db().deedRevision.findMany({
      where: { deedId: id }, orderBy: { revisionNo: 'desc' },
    })
    return rows.map((r) => ({ ...r, snapshot: parseJsonOrNull(r.snapshotJson) }))
  },
})

route('deeds.generateDocument', {
  auth: 'session',
  perm: 'deeds.manage',
  schema: z.object({ id: z.string().uuid(), variant: z.enum(['draft', 'minuta']).default('draft') }),
  handler: async (input, ctx) => {
    const variant = input.variant
    const deed = await db().deed.findUnique({
      where: { id: input.id },
      include: { deedType: true, client: true, parties: true, notary: true },
    })
    if (!deed) throw new NotFoundError('Akta tidak ditemukan.')
    const settings = await getSettings()
    const templateRel = deed.deedType.templatePath
      ?? (deed.deedType.category === 'PPAT' ? 'ppat/akta-ppat.docx' : 'notary/akta-umum.docx')
    const templatePath = resolveTemplate(templateRel)
    const witnesses = witnessNames(deed.witnessesJson)
    const data = {
      nomor_akta: deed.deedNumber,
      tanggal_akta: formatDateLong(deed.deedDate),
      judul: deed.title ?? deed.deedType.name,
      jenis_akta: deed.deedType.name,
      klien: deed.client.fullName,
      kode_klien: deed.client.code,
      penghadap: deed.penghadap ?? '',
      komparisi: deed.komparisi ?? '',
      premis: deed.premis ?? '',
      isi: deed.isi ?? '',
      penutup: deed.penutup ?? '',
      pihak: deed.parties.map((p) => `${p.role}: ${p.name}`).join('\n'),
      pihak_list: deed.parties.map((p) => ({ role: p.role, nama: p.name, nik: p.nik ?? '', alamat: p.address ?? '' })),
      saksi: witnesses.join(', '),
      saksi_list: witnesses.map((n) => ({ nama: n })),
      notaris: settings['office.notaryName'] || deed.notary?.fullName || '',
      kantor: settings['office.name'] || '',
      kota: settings['office.city'] || '',
      alamat_kantor: settings['office.address'] || '',
      tanggal_cetak: formatDateLong(new Date()),
      status_akta: DEED_STATUS_LABELS[deed.status] ?? deed.status,
    }
    const fileName = `${variant === 'minuta' ? 'Minuta' : 'Draft'}-${safeSegment(deed.deedNumber)}.docx`
    const tempPath = path.join(dirs.tmp(), `${safeSegment(deed.deedNumber)}-${Date.now()}.docx`)
    fs.mkdirSync(dirs.tmp(), { recursive: true })
    renderDocx(templatePath, data, tempPath)
    try {
      const stored = storeFile(tempPath, fileName, { deedNumber: deed.deedNumber, kind: 'deeds' })
      const categoryCode = variant === 'minuta' ? 'MINUTA' : 'DRAFT_AKTA'
      const category = await db().documentCategory.findUnique({ where: { code: categoryCode } })
      if (!category) throw new Error('Kategori dokumen draft/minuta belum tersedia.')
      const result = await inTransaction(async (tx) => {
        const oldDoc = await tx.document.findFirst({
          where: { deedId: deed.id, categoryId: category.id, deletedAt: null },
          orderBy: { createdAt: 'desc' },
        })
        let documentId: string
        if (oldDoc) {
          const updated = await tx.document.update({
            where: { id: oldDoc.id },
            data: {
              fileName, storagePath: stored.storagePath, mimeType: stored.mimeType,
              sizeBytes: stored.sizeBytes, checksum: stored.checksum,
              version: oldDoc.version + 1, uploadedById: ctx.session!.userId,
              versions: {
                create: {
                  version: oldDoc.version + 1, fileName, storagePath: stored.storagePath,
                  mimeType: stored.mimeType, sizeBytes: stored.sizeBytes, checksum: stored.checksum,
                  uploadedById: ctx.session!.userId, notes: `Dibuat ulang dari template (${variant})`,
                },
              },
            },
          })
          documentId = updated.id
        } else {
          const created = await tx.document.create({
            data: {
              title: `${variant === 'minuta' ? 'Minuta' : 'Draft'} Akta ${deed.deedNumber}`,
              categoryId: category.id, clientId: deed.clientId, transactionId: deed.transactionId,
              deedId: deed.id, fileName, storagePath: stored.storagePath, mimeType: stored.mimeType,
              sizeBytes: stored.sizeBytes, checksum: stored.checksum, uploadedById: ctx.session!.userId,
              versions: {
                create: {
                  version: 1, fileName, storagePath: stored.storagePath, mimeType: stored.mimeType,
                  sizeBytes: stored.sizeBytes, checksum: stored.checksum,
                  uploadedById: ctx.session!.userId, notes: 'Versi awal',
                },
              },
            },
          })
          documentId = created.id
        }
        if (variant === 'minuta') {
          await tx.deed.update({ where: { id: deed.id }, data: { minutaFilePath: stored.storagePath } })
        } else {
          await tx.deed.update({ where: { id: deed.id }, data: { documentId } })
        }
        await audit(tx, {
          userId: ctx.session!.userId, username: ctx.username, action: 'GENERATE_DOCX', entity: 'Deed',
          entityId: deed.id, after: { documentId, fileName, variant },
        })
        return { documentId, fileName, variant }
      })
      return { ...result, filePath: path.join(dirs.documents(), stored.storagePath), templateUsed: templateRel }
    } finally {
      fs.rmSync(tempPath, { force: true })
    }
  },
})

route('deeds.repertorium.list', {
  auth: 'session',
  perm: 'repertorium.view',
  schema: paginationQuerySchema,
  handler: async (q) => {
    const where: Record<string, unknown> = {}
    if (q.year) where.year = Number(q.year)
    if (q.search) {
      where.OR = [
        { deed: { deedNumber: { contains: q.search } } },
        { deed: { client: { fullName: { contains: q.search } } } },
        { deed: { deedType: { name: { contains: q.search } } } },
      ]
    }
    const [total, items] = await Promise.all([
      db().deedRepertorium.count({ where }),
      db().deedRepertorium.findMany({
        where, ...paging(q), orderBy: [{ year: 'desc' }, { number: 'desc' }],
        include: {
          deed: {
            include: {
              deedType: { select: { name: true, category: true } },
              client: { select: { fullName: true, code: true } },
              notary: { select: { fullName: true } },
            },
          },
        },
      }),
    ])
    return paginated(items, total, q)
  },
})

route('deeds.repertorium.register', {
  auth: 'session',
  perm: 'deeds.manage',
  schema: repertoriumSchema,
  handler: async (input, ctx) => {
    const deed = await db().deed.findUnique({ where: { id: input.deedId }, include: { repertorium: true } })
    if (!deed) throw new NotFoundError('Akta tidak ditemukan.')
    if (deed.repertorium) throw new ConflictError('Akta sudah tercatat dalam repertorium.')
    const year = deed.deedDate.getFullYear()
    return inTransaction(async (tx) => {
      const last = await tx.deedRepertorium.findFirst({ where: { year }, orderBy: { number: 'desc' } })
      const created = await tx.deedRepertorium.create({
        data: {
          deedId: deed.id, year, number: (last?.number ?? 0) + 1,
          notaryId: deed.notaryId, notes: input.notes ?? 'Pencatatan manual repertorium',
        },
      })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'REPERTORIUM_REGISTER', entity: 'Deed',
        entityId: deed.id, after: { number: created.number, year: created.year },
      })
      return created
    })
  },
})

route('protocol.list', {
  auth: 'session',
  perm: 'protocol.view',
  schema: paginationQuerySchema,
  handler: async (q) => {
    const where: Record<string, unknown> = {}
    if (q.year) where.year = Number(q.year)
    if (q.search) {
      where.OR = [
        { deed: { deedNumber: { contains: q.search } } },
        { location: { contains: q.search } },
        { notes: { contains: q.search } },
      ]
    }
    const [total, items] = await Promise.all([
      db().protocolRegister.count({ where }),
      db().protocolRegister.findMany({
        where, ...paging(q), orderBy: [{ year: 'desc' }, { registerNumber: 'desc' }],
        include: { deed: { select: { id: true, deedNumber: true, title: true } }, createdBy: { select: { fullName: true } } },
      }),
    ])
    return paginated(items, total, q)
  },
})

route('protocol.create', {
  auth: 'session',
  perm: 'protocol.manage',
  schema: protocolSchema,
  handler: async (input, ctx) => {
    const year = input.year
    const lastRegister = await db().protocolRegister.findFirst({ where: { year }, orderBy: { registerNumber: 'desc' } })
    const lastSeq = await db().protocolRegister.findFirst({ where: { year }, orderBy: { sequenceNo: 'desc' } })
    const created = await inTransaction(async (tx) => {
      const row = await tx.protocolRegister.create({
        data: {
          deedId: input.deedId ?? null,
          year,
          registerNumber: (lastRegister?.registerNumber ?? 0) + 1,
          sequenceNo: (lastSeq?.sequenceNo ?? 0) + 1,
          protocolType: input.protocolType,
          location: input.location,
          notes: input.notes,
          createdById: ctx.session!.userId,
        },
      })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'PROTOCOL_REGISTER', entity: 'Protocol',
        entityId: String(row.id), after: { registerNumber: row.registerNumber, year: row.year, type: row.protocolType },
      })
      return row
    })
    return created
  },
})

