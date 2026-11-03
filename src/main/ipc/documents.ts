import fs from 'node:fs'
import path from 'node:path'
import { BrowserWindow, dialog, shell } from 'electron'
import { db, inTransaction } from '../db'
import { route } from './router'
import {
  documentListSchema, documentReplaceSchema, documentUpdateSchema, documentUploadSchema, idSchema,
} from '../../shared/schemas'
import { audit } from '../lib/audit'
import { paging, paginated } from '../lib/util'
import { NotFoundError, ConflictError } from '../lib/errors'
import { storeFile, deleteStoredFile, copyExport, ALLOWED_EXTENSIONS } from '../lib/documents'
import { resolveStoragePath } from '../lib/paths'
import { preparePreview } from '../lib/preview'

function windowOrNull(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
}

route('documents.categories', {
  auth: 'session',
  handler: async () => db().documentCategory.findMany({ orderBy: { name: 'asc' } }),
})

route('documents.list', {
  auth: 'session',
  perm: 'documents.view',
  schema: documentListSchema,
  handler: async (q) => {
    const where: Record<string, unknown> = { deletedAt: null }
    if (q.categoryId) where.categoryId = q.categoryId
    if (q.clientId) where.clientId = q.clientId
    if (q.transactionId) where.transactionId = q.transactionId
    if (q.deedId) where.deedId = q.deedId
    if (q.search) {
      where.OR = [
        { title: { contains: q.search } },
        { fileName: { contains: q.search } },
        { notes: { contains: q.search } },
        { client: { fullName: { contains: q.search } } },
      ]
    }
    const [total, items] = await Promise.all([
      db().document.count({ where }),
      db().document.findMany({
        where,
        ...paging(q),
        orderBy: { createdAt: 'desc' },
        include: {
          category: true,
          client: { select: { id: true, fullName: true, code: true } },
          deed: { select: { id: true, deedNumber: true } },
          transaction: { select: { id: true, code: true, title: true } },
          uploadedBy: { select: { fullName: true } },
          identities: { select: { id: true } },
          certificates: { select: { id: true } },
        },
      }),
    ])
    return paginated(items, total, q)
  },
})

route('documents.pick', {
  auth: 'session',
  perm: 'documents.manage',
  handler: async () => {
    const win = windowOrNull()
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: 'Pilih dokumen',
          properties: ['openFile'],
          filters: [{ name: 'Dokumen', extensions: ALLOWED_EXTENSIONS.map((e) => e.slice(1)) }],
        })
      : await dialog.showOpenDialog({ properties: ['openFile'] })
    if (result.canceled || !result.filePaths[0]) return null
    const p = result.filePaths[0]
    const st = fs.statSync(p)
    return { path: p, name: path.basename(p), sizeBytes: st.size, mimeType: path.extname(p).toLowerCase() }
  },
})

route('documents.upload', {
  auth: 'session',
  perm: 'documents.manage',
  schema: documentUploadSchema,
  handler: async (input, ctx) => {
    const category = await db().documentCategory.findUnique({ where: { id: input.categoryId } })
    if (!category) throw new NotFoundError('Kategori dokumen tidak ditemukan.')
    let deedNumber: string | null = null
    if (input.deedId) {
      const deed = await db().deed.findUnique({ where: { id: input.deedId }, select: { deedNumber: true } })
      deedNumber = deed?.deedNumber ?? null
    }
    const stored = storeFile(input.tempPath, input.originalName, {
      clientId: input.clientId,
      transactionId: input.transactionId,
      deedNumber,
      kind: category.code === 'KTP' || category.code === 'NPWP' ? 'identities' : 'other',
    })
    try {
      return await inTransaction(async (tx) => {
      const created = await tx.document.create({
        data: {
          title: input.title,
          categoryId: input.categoryId,
          clientId: input.clientId ?? null,
          transactionId: input.transactionId ?? null,
          deedId: input.deedId ?? null,
          fileName: input.originalName,
          storagePath: stored.storagePath,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          checksum: stored.checksum,
          notes: input.notes,
          isConfidential: input.isConfidential,
          uploadedById: ctx.session!.userId,
          versions: {
            create: {
              version: 1,
              fileName: input.originalName,
              storagePath: stored.storagePath,
              mimeType: stored.mimeType,
              sizeBytes: stored.sizeBytes,
              checksum: stored.checksum,
              uploadedById: ctx.session!.userId,
              notes: 'Versi awal',
            },
          },
        },
      })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'UPLOAD', entity: 'Document',
        entityId: created.id,
        after: { title: created.title, fileName: created.fileName, sizeBytes: created.sizeBytes, checksum: created.checksum },
      })
      return created
      })
    } catch (err) {
      deleteStoredFile(stored.storagePath)
      throw err
    }
  },
})

route('documents.replace', {
  auth: 'session',
  perm: 'documents.manage',
  schema: documentReplaceSchema,
  handler: async (input, ctx) => {
    const existing = await db().document.findFirst({ where: { id: input.id, deletedAt: null } })
    if (!existing) throw new NotFoundError('Dokumen tidak ditemukan.')
    const stored = storeFile(input.tempPath, input.originalName, {
      clientId: existing.clientId,
      transactionId: existing.transactionId,
      kind: 'other',
    })
    try {
      return await inTransaction(async (tx) => {
      const updated = await tx.document.update({
        where: { id: existing.id },
        data: {
          fileName: input.originalName,
          storagePath: stored.storagePath,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          checksum: stored.checksum,
          version: existing.version + 1,
          notes: input.notes ?? existing.notes,
          versions: {
            create: {
              version: existing.version + 1,
              fileName: input.originalName,
              storagePath: stored.storagePath,
              mimeType: stored.mimeType,
              sizeBytes: stored.sizeBytes,
              checksum: stored.checksum,
              uploadedById: ctx.session!.userId,
              notes: input.notes ?? 'Revisi dokumen',
            },
          },
        },
        include: { versions: { orderBy: { version: 'desc' } } },
      })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'REPLACE', entity: 'Document',
        entityId: existing.id,
        before: { fileName: existing.fileName, checksum: existing.checksum, version: existing.version },
        after: { fileName: updated.fileName, checksum: updated.checksum, version: updated.version },
      })
      return updated
      })
    } catch (err) {
      deleteStoredFile(stored.storagePath)
      throw err
    }
  },
})

route('documents.update', {
  auth: 'session',
  perm: 'documents.manage',
  schema: documentUpdateSchema,
  handler: async (input, ctx) => {
    const existing = await db().document.findFirst({ where: { id: input.id, deletedAt: null } })
    if (!existing) throw new NotFoundError('Dokumen tidak ditemukan.')
    return inTransaction(async (tx) => {
      const updated = await tx.document.update({
        where: { id: input.id },
        data: {
          title: input.title,
          categoryId: input.categoryId,
          notes: input.notes,
          isConfidential: input.isConfidential,
          clientId: input.clientId ?? null,
          transactionId: input.transactionId ?? null,
          deedId: input.deedId ?? null,
        },
      })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'UPDATE', entity: 'Document',
        entityId: input.id,
        before: { title: existing.title, categoryId: existing.categoryId, isConfidential: existing.isConfidential },
        after: { title: updated.title, categoryId: updated.categoryId, isConfidential: updated.isConfidential },
      })
      return updated
    })
  },
})

route('documents.versions', {
  auth: 'session',
  perm: 'documents.view',
  schema: idSchema,
  handler: async ({ id }) => {
    return db().documentVersion.findMany({
      where: { documentId: id },
      orderBy: { version: 'desc' },
      include: { uploadedBy: { select: { fullName: true } } },
    })
  },
})

route('documents.preview', {
  auth: 'session',
  perm: 'documents.view',
  schema: idSchema,
  handler: async ({ id }) => {
    const doc = await db().document.findFirst({ where: { id, deletedAt: null } })
    if (!doc) throw new NotFoundError('Dokumen tidak ditemukan.')
    const preview = preparePreview(resolveStoragePath(doc.storagePath), doc.mimeType)
    return { ...preview, fileName: doc.fileName, tooLarge: preview.kind === 'too-large' }
  },
})

route('documents.openExternal', {
  auth: 'session',
  perm: 'documents.view',
  schema: idSchema,
  handler: async ({ id }) => {
    const doc = await db().document.findFirst({ where: { id, deletedAt: null } })
    if (!doc) throw new NotFoundError('Dokumen tidak ditemukan.')
    const abs = resolveStoragePath(doc.storagePath)
    if (!fs.existsSync(abs)) throw new Error('Berkas tidak ditemukan di penyimpanan.')
    const err = await shell.openPath(abs)
    if (err) throw new Error(err)
    return { ok: true }
  },
})

route('documents.download', {
  auth: 'session',
  perm: 'documents.view',
  schema: idSchema,
  handler: async ({ id }) => {
    const doc = await db().document.findFirst({ where: { id, deletedAt: null } })
    if (!doc) throw new NotFoundError('Dokumen tidak ditemukan.')
    const win = windowOrNull()
    const result = win
      ? await dialog.showSaveDialog(win, { defaultPath: doc.fileName })
      : await dialog.showSaveDialog({ defaultPath: doc.fileName })
    if (result.canceled || !result.filePath) return { canceled: true }
    copyExport(doc.storagePath, result.filePath)
    return { canceled: false, filePath: result.filePath }
  },
})

route('documents.delete', {
  auth: 'session',
  perm: 'documents.manage',
  schema: idSchema,
  handler: async ({ id }, ctx) => {
    const existing = await db().document.findFirst({ where: { id, deletedAt: null } })
    if (!existing) throw new NotFoundError('Dokumen tidak ditemukan.')
    const linkedDeed = await db().deed.count({ where: { documentId: id } })
    if (linkedDeed > 0) throw new ConflictError('Dokumen ini adalah dokumen akta utama dan tidak dapat dihapus.')
    await inTransaction(async (tx) => {
      await tx.document.update({ where: { id }, data: { deletedAt: new Date() } })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'SOFT_DELETE', entity: 'Document',
        entityId: id, before: { title: existing.title, fileName: existing.fileName },
      })
    })
    return { ok: true, note: 'Berkas fisik dipertahankan untuk keperluan audit.' }
  },
})

route('documents.restore', {
  auth: 'session',
  perm: 'documents.manage',
  schema: idSchema,
  handler: async ({ id }, ctx) => {
    const existing = await db().document.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Dokumen tidak ditemukan.')
    if (!existing.deletedAt) throw new ConflictError('Dokumen ini belum dihapus.')
    const deletedAt = existing.deletedAt
    await inTransaction(async (tx) => {
      await tx.document.update({ where: { id }, data: { deletedAt: null } })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'RESTORE', entity: 'Document', entityId: id,
        before: { deletedAt: deletedAt.toISOString() }, after: { deletedAt: null },
      })
    })
    return { ok: true }
  },
})

route('documents.purgeFile', {
  auth: 'session',
  perm: 'settings.manage',
  schema: idSchema,
  handler: async ({ id }, ctx) => {
    const doc = await db().document.findUnique({ where: { id } })
    if (!doc) throw new NotFoundError('Dokumen tidak ditemukan.')
    if (!doc.deletedAt) throw new ConflictError('Hanya dokumen terhapus yang dapat dibersihkan berkasnya.')
    if (!deleteStoredFile(doc.storagePath)) {
      throw new ConflictError('Berkas tidak dapat dihapus dari penyimpanan; periksa izin folder dokumen lalu coba lagi.')
    }
    await audit(db(), {
      userId: ctx.session!.userId, username: ctx.username, action: 'PURGE_FILE', entity: 'Document',
      entityId: id, before: { storagePath: doc.storagePath },
    })
    return { ok: true }
  },
})
