import fs from 'node:fs'
import path from 'node:path'
import { BrowserWindow, dialog, shell } from 'electron'
import { db } from '../db'
import { route } from './router'
import { z } from 'zod'
import { settingsUpdateSchema, templateSaveSchema } from '../../shared/schemas'
import { saveSettings } from '../lib/settings'
import { validateSettings } from '../lib/settings-validation'
import { audit } from '../lib/audit'
import { can } from '../lib/rbac'
import { dirs } from '../lib/paths'
import { listTemplates } from '../lib/docx'
import { PermissionError, NotFoundError, ConflictError } from '../lib/errors'
import { log } from '../lib/logger'
import { governmentAgencyLabel, governmentStatusLabel } from '../../shared/government'
import { ftsMatch } from '../../shared/search-query'

const FOLDER_TARGETS = ['root', 'documents', 'backups', 'exports', 'logs', 'templates'] as const
type FolderTarget = (typeof FOLDER_TARGETS)[number]

function folderPath(target: FolderTarget): string {
  const map: Record<FolderTarget, string> = {
    root: dirs.root(),
    documents: dirs.documents(),
    backups: dirs.backups(),
    exports: dirs.exports(),
    logs: dirs.logs(),
    templates: dirs.templates(),
  }
  return map[target]
}

function templatePermission(target: FolderTarget): string {
  if (target === 'exports') return 'reports.view'
  if (target === 'documents') return 'documents.view'
  if (target === 'backups') return 'backup.manage'
  if (target === 'templates') return 'templates.manage'
  return 'settings.manage'
}

route('settings.get', {
  auth: 'session',
  handler: async () => {
    const rows = await db().setting.findMany({ orderBy: [{ group: 'asc' }, { key: 'asc' }] })
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
    return { settings: rows, map }
  },
})

route('settings.update', {
  auth: 'session',
  perm: 'settings.manage',
  schema: settingsUpdateSchema,
  handler: async (input, ctx) => {
    const known = await db().setting.findMany({ select: { key: true, value: true } })
    const knownKeys = new Set(known.map((k) => k.key))
    const unknown = Object.keys(input.values).filter((k) => !knownKeys.has(k))
    if (unknown.length) throw new ConflictError(`Kunci pengaturan tidak dikenal: ${unknown.join(', ')}`)
    const invalid = validateSettings(input.values)
    if (invalid) throw new ConflictError(invalid)
    const before = Object.fromEntries(known.map((k) => [k.key, k.value]))
    await saveSettings(input.values, ctx.session!.userId)
    await audit(db(), {
      userId: ctx.session!.userId, username: ctx.username, action: 'UPDATE', entity: 'Setting',
      entityId: 'settings',
      before: Object.fromEntries(Object.keys(input.values).map((k) => [k, before[k]])),
      after: input.values,
    })
    const rows = await db().setting.findMany({ orderBy: [{ group: 'asc' }, { key: 'asc' }] })
    return { settings: rows, map: Object.fromEntries(rows.map((r) => [r.key, r.value])) }
  },
})

route('settings.sequences', {
  auth: 'session',
  perm: 'settings.manage',
  handler: () => db().numberingSequence.findMany({ orderBy: { key: 'asc' } }),
})

route('settings.updateSequence', {
  auth: 'session',
  perm: 'settings.manage',
  schema: z.object({
    key: z.string().min(1).max(50),
    prefix: z.string().max(20),
    pattern: z.string().min(1).max(80).refine((p) => /\{SEQ:\d+\}/.test(p), 'Pola harus memuat {SEQ:n}'),
    resetPeriod: z.enum(['NONE', 'YEAR', 'MONTH']),
  }),
  handler: async (input, ctx) => {
    const existing = await db().numberingSequence.findUnique({ where: { key: input.key } })
    if (!existing) throw new NotFoundError('Urutan penomoran tidak ditemukan.')
    const updated = await db().numberingSequence.update({ where: { key: input.key }, data: input })
    await audit(db(), {
      userId: ctx.session!.userId, username: ctx.username, action: 'UPDATE', entity: 'NumberingSequence',
      entityId: input.key,
      before: { prefix: existing.prefix, pattern: existing.pattern, resetPeriod: existing.resetPeriod },
      after: { prefix: updated.prefix, pattern: updated.pattern, resetPeriod: updated.resetPeriod },
    })
    return updated
  },
})

route('templates.list', {
  auth: 'session',
  perm: 'templates.manage',
  handler: () => listTemplates(),
})

route('templates.pick', {
  auth: 'session',
  perm: 'templates.manage',
  handler: async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: 'Pilih template DOCX',
          properties: ['openFile'],
          filters: [{ name: 'Template Word', extensions: ['docx'] }],
        })
      : await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Template Word', extensions: ['docx'] }] })
    if (result.canceled || !result.filePaths[0]) return null
    const p = result.filePaths[0]
    return { path: p, name: path.basename(p), sizeBytes: fs.statSync(p).size }
  },
})

route('templates.save', {
  auth: 'session',
  perm: 'templates.manage',
  schema: templateSaveSchema,
  handler: async (input, ctx) => {
    if (!fs.existsSync(input.tempPath)) throw new NotFoundError('Berkas template tidak ditemukan.')
    if (!input.fileName.toLowerCase().endsWith('.docx')) throw new ConflictError('Template harus berformat DOCX.')
    const size = fs.statSync(input.tempPath).size
    if (size <= 0 || size > 20 * 1024 * 1024) throw new ConflictError('Ukuran template harus antara 1 byte dan 20 MB.')
    const safeName = path.basename(input.fileName).replace(/[^a-zA-Z0-9._ -]/g, '_')
    if (!safeName.toLowerCase().endsWith('.docx')) throw new ConflictError('Nama template tidak valid.')
    const targetDir = path.join(dirs.templates(), input.category)
    fs.mkdirSync(targetDir, { recursive: true })
    const target = path.join(targetDir, safeName)
    if (fs.existsSync(target)) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      fs.copyFileSync(target, `${target}.${stamp}.bak`)
    }
    fs.copyFileSync(input.tempPath, target)
    log.info(`Template disimpan: ${input.category}/${safeName}`)
    await audit(db(), {
      userId: ctx.session!.userId, username: ctx.username, action: 'UPLOAD_TEMPLATE', entity: 'Template',
      entityId: `${input.category}/${safeName}`, after: { size },
    })
    return { fileName: safeName, category: input.category }
  },
})

route('templates.delete', {
  auth: 'session',
  perm: 'templates.manage',
  schema: z.object({ category: z.enum(['notary', 'ppat', 'invoices']), fileName: z.string().min(1).max(200) }),
  handler: async (input, ctx) => {
    const safeName = path.basename(input.fileName)
    const target = path.join(dirs.templates(), input.category, safeName)
    if (!fs.existsSync(target)) throw new NotFoundError('Template tidak ditemukan.')
    fs.rmSync(target, { force: true })
    await audit(db(), {
      userId: ctx.session!.userId, username: ctx.username, action: 'DELETE_TEMPLATE', entity: 'Template',
      entityId: `${input.category}/${safeName}`,
    })
    return { ok: true }
  },
})

route('app.openFolder', {
  auth: 'session',
  schema: z.object({ target: z.enum(FOLDER_TARGETS) }),
  handler: async ({ target }, ctx) => {
    if (!can(ctx.session, templatePermission(target))) throw new PermissionError()
    const p = folderPath(target)
    fs.mkdirSync(p, { recursive: true })
    const err = await shell.openPath(p)
    if (err) throw new Error(err)
    return { ok: true, path: p }
  },
})

route('search.global', {
  auth: 'session',
  schema: z.object({ query: z.string().trim().min(2).max(100) }),
  handler: async ({ query }, ctx) => {
    const groups: { group: string; items: { id: string; title: string; subtitle: string; to: string }[] }[] = []
    const match = ftsMatch(query)
    if (!match) return groups

    const dedupe = <T extends { id: string }>(rows: T[]): T[] => {
      const seen = new Set<string>()
      return rows.filter((row) => {
        if (seen.has(row.id)) return false
        seen.add(row.id)
        return true
      })
    }
    const clientIds: string[] = []

    if (can(ctx.session, 'clients.view')) {
      const hits = await db().$queryRawUnsafe<{ id: string; code: string; fullName: string; type: string }[]>(
        `SELECT c."id" AS id, c."code" AS code, c."fullName" AS fullName, c."type" AS type
         FROM client_search JOIN "Client" c ON c.rowid = client_search.rowid
         WHERE client_search MATCH ? AND c."deletedAt" IS NULL
         ORDER BY rank LIMIT 5`,
        match,
      )
      // NIK/NPWP sengaja tidak masuk indeks FTS; pencarian identitas memakai kecocokan persis.
      const byIdentity = await db().client.findMany({
        where: { deletedAt: null, OR: [{ nik: query }, { npwp: query }] },
        take: 5,
        select: { id: true, code: true, fullName: true, type: true },
      })
      const clients = dedupe([...byIdentity, ...hits]).slice(0, 5)
      clientIds.push(...clients.map((c) => c.id))
      if (clients.length) {
        groups.push({
          group: 'Klien',
          items: clients.map((c) => ({ id: c.id, title: c.fullName, subtitle: `${c.code} · ${c.type === 'BADAN_HUKUM' ? 'Badan Hukum' : 'Perorangan'}`, to: `/klien/${c.id}` })),
        })
      }
    }

    if (can(ctx.session, 'transactions.view')) {
      const hits = await db().$queryRawUnsafe<{ id: string; code: string; title: string; clientName: string }[]>(
        `SELECT t."id" AS id, t."code" AS code, t."title" AS title, c."fullName" AS clientName
         FROM transaction_search JOIN "Transaction" t ON t.rowid = transaction_search.rowid
         JOIN "Client" c ON c."id" = t."clientId"
         WHERE transaction_search MATCH ? AND t."deletedAt" IS NULL
         ORDER BY rank LIMIT 5`,
        match,
      )
      const byClient = clientIds.length
        ? await db().transaction.findMany({
            where: { deletedAt: null, clientId: { in: clientIds } },
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: { id: true, code: true, title: true, client: { select: { fullName: true } } },
          })
        : []
      const trx = dedupe([
        ...hits,
        ...byClient.map((t) => ({ id: t.id, code: t.code, title: t.title, clientName: t.client.fullName })),
      ]).slice(0, 5)
      if (trx.length) {
        groups.push({
          group: 'Transaksi',
          items: trx.map((t) => ({ id: t.id, title: `${t.code} — ${t.title}`, subtitle: t.clientName, to: `/transaksi/${t.id}` })),
        })
      }
    }

    if (can(ctx.session, 'deeds.view')) {
      const hits = await db().$queryRawUnsafe<{ id: string; deedNumber: string; title: string | null; typeName: string }[]>(
        `SELECT d."id" AS id, d."deedNumber" AS deedNumber, d."title" AS title, dt."name" AS typeName
         FROM deed_search JOIN "Deed" d ON d.rowid = deed_search.rowid
         JOIN "DeedType" dt ON dt."id" = d."deedTypeId"
         WHERE deed_search MATCH ?
         ORDER BY rank LIMIT 5`,
        match,
      )
      const byClient = clientIds.length
        ? await db().deed.findMany({
            where: { clientId: { in: clientIds } },
            take: 5,
            orderBy: { deedDate: 'desc' },
            select: { id: true, deedNumber: true, title: true, deedType: { select: { name: true } } },
          })
        : []
      const deeds = dedupe([
        ...hits,
        ...byClient.map((d) => ({ id: d.id, deedNumber: d.deedNumber, title: d.title, typeName: d.deedType.name })),
      ]).slice(0, 5)
      if (deeds.length) {
        groups.push({
          group: 'Akta',
          items: deeds.map((d) => ({ id: d.id, title: `${d.deedNumber} — ${d.title ?? d.typeName}`, subtitle: d.typeName, to: `/akta/${d.id}` })),
        })
      }
    }

    if (can(ctx.session, 'finance.view')) {
      const hits = await db().$queryRawUnsafe<{ id: string; number: string; status: string; clientName: string }[]>(
        `SELECT i."id" AS id, i."number" AS number, i."status" AS status, c."fullName" AS clientName
         FROM invoice_search JOIN "Invoice" i ON i.rowid = invoice_search.rowid
         JOIN "Client" c ON c."id" = i."clientId"
         WHERE invoice_search MATCH ?
         ORDER BY rank LIMIT 5`,
        match,
      )
      const byClient = clientIds.length
        ? await db().invoice.findMany({
            where: { clientId: { in: clientIds } },
            take: 5,
            orderBy: { issueDate: 'desc' },
            select: { id: true, number: true, status: true, client: { select: { fullName: true } } },
          })
        : []
      const invoices = dedupe([
        ...hits,
        ...byClient.map((i) => ({ id: i.id, number: i.number, status: i.status, clientName: i.client.fullName })),
      ]).slice(0, 5)
      if (invoices.length) {
        groups.push({
          group: 'Invoice',
          items: invoices.map((i) => ({ id: i.id, title: i.number, subtitle: i.clientName, to: `/keuangan/invoice/${i.id}` })),
        })
      }
    }

    if (can(ctx.session, 'documents.view')) {
      const docs = await db().$queryRawUnsafe<{ id: string; title: string; fileName: string; categoryName: string }[]>(
        `SELECT d."id" AS id, d."title" AS title, d."fileName" AS fileName, cat."name" AS categoryName
         FROM document_search JOIN "Document" d ON d.rowid = document_search.rowid
         JOIN "DocumentCategory" cat ON cat."id" = d."categoryId"
         WHERE document_search MATCH ? AND d."deletedAt" IS NULL
         ORDER BY rank LIMIT 5`,
        match,
      )
      if (docs.length) {
        groups.push({
          group: 'Dokumen',
          items: docs.map((d) => ({ id: d.id, title: d.title, subtitle: `${d.categoryName} · ${d.fileName}`, to: `/dokumen/${d.id}` })),
        })
      }
    }

    if (can(ctx.session, 'government.view')) {
      const submissions = await db().$queryRawUnsafe<{
        id: string; number: string; title: string; agency: string; internalStatus: string; externalRef: string | null
      }[]>(
        `SELECT s."id" AS id, s."number" AS number, s."title" AS title, s."agency" AS agency,
                s."internalStatus" AS internalStatus, s."externalRef" AS externalRef
         FROM government_search JOIN government_submissions s ON s.rowid = government_search.rowid
         WHERE government_search MATCH ?
         ORDER BY rank LIMIT 5`,
        match,
      )
      if (submissions.length) {
        groups.push({
          group: 'Pengajuan Pemerintah',
          items: submissions.map((s) => ({
            id: s.id,
            title: `${s.number} — ${s.title}`,
            subtitle: `${governmentAgencyLabel(s.agency)} · ${governmentStatusLabel(s.internalStatus)}${s.externalRef ? ` · ${s.externalRef}` : ''}`,
            to: `/integrasi/${s.id}`,
          })),
        })
      }
    }
    return groups
  },
})
