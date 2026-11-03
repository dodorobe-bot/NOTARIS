import fs from 'node:fs'
import path from 'node:path'
import { BrowserWindow, dialog, shell } from 'electron'
import type { GovernmentSubmission, PrismaClient } from '@prisma/client'
import { db, inTransaction, type Tx } from '../db'
import { route, type Ctx } from './router'
import {
  governmentConfigUpdateSchema, governmentCredentialSchema, governmentExportSummarySchema,
  governmentFileAddSchema, governmentFileListSchema, governmentOfficialStatusSchema,
  governmentPortalOpenSchema, governmentReferenceSchema, governmentServiceListSchema,
  governmentStatusSchema, governmentSubmissionListSchema, governmentSubmissionSchema,
  governmentSubmissionUpdateSchema, governmentSyncLogListSchema, idSchema,
} from '../../shared/schemas'
import {
  GOVERNMENT_STATUSES,
  GOVERNMENT_VIEW_GROUPS,
  governmentFieldsFor, governmentFileKindLabel, governmentOfficialSourceLabel, governmentStatusLabel,
  type GovernmentStatus, type GovernmentView,
} from '../../shared/government'
import { audit } from '../lib/audit'
import { paging, paginated } from '../lib/util'
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors'
import { ALLOWED_EXTENSIONS, copyExport, deleteStoredFile, storeFile } from '../lib/documents'
import { resolveStoragePath } from '../lib/paths'
import { preparePreview } from '../lib/preview'
import { nextNumber } from '../lib/numbering'
import { checklistFor, integrationCapabilities, portalUrlFor } from '../integrations/government-gateway/integration-manager'
import { officialPortalUrl } from '../integrations/government-gateway/portal'
import {
  assertGovernmentTransition, isFinalGovernmentStatus, missingRequirements,
  nextGovernmentStatuses, parseGovernmentData,
} from '../integrations/government-gateway/rules'
import {
  credentialEncryptionAvailable, decryptCredential, encryptionAlgorithmLabel, encryptCredential,
} from '../integrations/government-gateway/credentials'
import { renderSummaryPdf, type SummaryInput } from '../integrations/government-gateway/summary'

type DbLike = Tx | PrismaClient
type SubmissionState = {
  dataFields: number
  supportingFiles: number
  evidenceFiles: number
  resultFiles: number
  externalRef: string | null
  officialStatus: string | null
}

const credentialSelect = {
  id: true,
  agency: true,
  label: true,
  accountHint: true,
  algorithm: true,
  lastUsedAt: true,
  createdAt: true,
  updatedAt: true,
} as const

function windowOrNull(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
}

function cleanData(data: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(data ?? {})
      .map(([key, value]) => [String(key).trim(), String(value ?? '').trim()])
      .filter(([key, value]) => key && value),
  )
}

/** Kondisi faktual sebuah pengajuan; dipakai gerbang transisi status. */
async function submissionState(
  tx: DbLike,
  sub: { id: string; dataJson: string | null; externalRef: string | null; officialStatus: string | null },
): Promise<SubmissionState> {
  const rows = await tx.governmentSubmissionFile.findMany({
    where: { submissionId: sub.id, deletedAt: null },
    select: { kind: true },
  })
  const count = (kind: string) => rows.filter((r) => r.kind === kind).length
  return {
    dataFields: Object.keys(parseGovernmentData(sub.dataJson)).length,
    supportingFiles: count('DOKUMEN_PENDUKUNG'),
    evidenceFiles: count('BUKTI_PENGAJUAN'),
    resultFiles: count('HASIL_LAYANAN'),
    externalRef: sub.externalRef,
    officialStatus: sub.officialStatus,
  }
}

async function logSync(
  tx: DbLike,
  ctx: Ctx,
  input: { submissionId?: string | null; agency: string; direction: string; status: string; message: string; detail?: unknown },
): Promise<void> {
  await tx.governmentSyncLog.create({
    data: {
      submissionId: input.submissionId ?? null,
      agency: input.agency,
      direction: input.direction,
      mode: 'SEMI_OTOMATIS',
      status: input.status,
      message: input.message,
      detailJson: input.detail === undefined || input.detail === null ? null : JSON.stringify(input.detail),
      createdById: ctx.session!.userId,
    },
  })
}

async function getSubmissionOrThrow(tx: DbLike, id: string): Promise<GovernmentSubmission> {
  const sub = await tx.governmentSubmission.findUnique({ where: { id } })
  if (!sub) throw new NotFoundError('Pengajuan pemerintah tidak ditemukan.')
  return sub
}

function assertNotFinal(sub: { internalStatus: string }): void {
  if (isFinalGovernmentStatus(sub.internalStatus)) {
    throw new ConflictError(
      `Pengajuan sudah final (${governmentStatusLabel(sub.internalStatus)}) dan terkunci; perubahan tidak dapat dilakukan.`,
    )
  }
}

interface TransitionInput {
  toStatus: GovernmentStatus
  source?: string
  note?: string | null
  officialStatus?: string | null
}

/**
 * Satu-satunya jalur yang mengubah status internal. Menegakkan urutan transisi,
 * kelengkapan bukti, riwayat status, dan log sinkronisasi secara atomik.
 */
async function applyTransition(tx: DbLike, ctx: Ctx, sub: GovernmentSubmission, input: TransitionInput) {
  assertNotFinal(sub)
  assertGovernmentTransition(sub.internalStatus, input.toStatus)
  const state = await submissionState(tx, { ...sub, officialStatus: input.officialStatus ?? sub.officialStatus })
  const missing = missingRequirements(input.toStatus, state)
  if (missing.length) {
    throw new ValidationError(
      `Status "${governmentStatusLabel(input.toStatus)}" belum dapat dicatat. ${missing.join(' ')}`,
    )
  }
  const now = new Date()
  const source = input.source ?? 'MANUAL'
  const updated = await tx.governmentSubmission.update({
    where: { id: sub.id },
    data: {
      internalStatus: input.toStatus,
      lastStatusAt: now,
      ...(input.officialStatus ? { officialStatus: input.officialStatus, officialSource: source } : {}),
      ...(input.toStatus === 'DIAJUKAN' && !sub.submittedAt ? { submittedAt: now } : {}),
    },
  })
  await tx.governmentStatusHistory.create({
    data: {
      submissionId: sub.id,
      scope: 'INTERNAL',
      fromStatus: sub.internalStatus,
      toStatus: input.toStatus,
      source,
      officialStatus: input.officialStatus ?? sub.officialStatus,
      note: input.note ?? null,
      changedById: ctx.session!.userId,
    },
  })
  await logSync(tx, ctx, {
    submissionId: sub.id,
    agency: sub.agency,
    direction: 'STATUS',
    status: ['MENUNGGU_PORTAL', 'DIAJUKAN', 'DIPROSES'].includes(input.toStatus) ? 'PENDING' : 'SUCCESS',
    message:
      `Status internal diubah dari "${governmentStatusLabel(sub.internalStatus)}" ke "${governmentStatusLabel(input.toStatus)}" ` +
      `oleh ${ctx.username}; tidak ada API resmi yang dipakai.`,
    detail: { from: sub.internalStatus, to: input.toStatus, portalUrl: portalUrlFor(sub.agency) },
  })
  await audit(tx, {
    userId: ctx.session!.userId,
    username: ctx.username,
    action: 'STATUS_CHANGE',
    entity: 'GovernmentSubmission',
    entityId: sub.id,
    before: { internalStatus: sub.internalStatus, officialStatus: sub.officialStatus },
    after: { internalStatus: updated.internalStatus, officialStatus: updated.officialStatus },
    meta: { source, note: input.note ?? null },
  })
  return updated
}

// ---------- LAYANAN & DASHBOARD ----------

route('government.services', {
  auth: 'session',
  perm: 'government.view',
  schema: governmentServiceListSchema,
  handler: async (q) => {
    const where = { ...(q.agency ? { agency: q.agency } : {}), ...(q.includeInactive ? {} : { isActive: true }) }
    const services = await db().governmentService.findMany({
      where,
      orderBy: [{ agency: 'asc' }, { sortOrder: 'asc' }],
    })
    const counts = await db().governmentSubmission.groupBy({ by: ['serviceId'], _count: { _all: true } })
    return services.map((s) => ({
      ...s,
      portalUrl: portalUrlFor(s.agency),
      checklist: checklistFor(s.agency, s.code),
      fields: governmentFieldsFor(s.agency),
      submissionCount: counts.find((c) => c.serviceId === s.id)?._count._all ?? 0,
    }))
  },
})

route('government.dashboard', {
  auth: 'session',
  perm: 'government.view',
  handler: async () => {
    const [services, byStatus, byAgency, files, references, pendingLogs, recentLogs, recentSubmissions, configs] =
      await Promise.all([
        db().governmentService.findMany({ where: { isActive: true }, orderBy: [{ agency: 'asc' }, { sortOrder: 'asc' }] }),
        db().governmentSubmission.groupBy({ by: ['internalStatus'], _count: { _all: true } }),
        db().governmentSubmission.groupBy({ by: ['agency', 'internalStatus'], _count: { _all: true } }),
        db().governmentSubmissionFile.count({ where: { deletedAt: null } }),
        db().governmentReference.count(),
        db().governmentSyncLog.count({ where: { status: 'PENDING' } }),
        db().governmentSyncLog.findMany({
          orderBy: { createdAt: 'desc' },
          take: 8,
          include: {
            submission: { select: { id: true, number: true, title: true } },
            createdBy: { select: { fullName: true } },
          },
        }),
        db().governmentSubmission.findMany({
          orderBy: { createdAt: 'desc' },
          take: 8,
          include: {
            service: { select: { id: true, code: true, name: true } },
            client: { select: { id: true, fullName: true, code: true } },
            createdBy: { select: { fullName: true } },
            _count: { select: { files: true, references: true } },
          },
        }),
        db().governmentApiConfig.findMany(),
      ])

    const countOf = (status: string) =>
      byStatus.find((row) => row.internalStatus === status)?._count._all ?? 0
    const countOfAgency = (agency: string, status: string) =>
      byAgency.filter((row) => row.agency === agency && row.internalStatus === status).reduce((sum, row) => sum + row._count._all, 0)

    const agencies = integrationCapabilities().map((cap) => {
      const config = configs.find((c) => c.agency === cap.agency)
      const total = byAgency.filter((row) => row.agency === cap.agency).reduce((sum, row) => sum + row._count._all, 0)
      const open = ['DRAFT', 'SIAP_DIAJUKAN', 'MENUNGGU_PORTAL', 'DIAJUKAN', 'DIPROSES'].reduce(
        (sum, status) => sum + countOfAgency(cap.agency, status),
        0,
      )
      return {
        ...cap,
        serviceCount: services.filter((s) => s.agency === cap.agency).length,
        submissionCount: total,
        openCount: open,
        awaitingPortal: countOfAgency(cap.agency, 'MENUNGGU_PORTAL'),
        inProgress: countOfAgency(cap.agency, 'DIAJUKAN') + countOfAgency(cap.agency, 'DIPROSES'),
        finished: countOfAgency(cap.agency, 'SELESAI'),
        rejected: countOfAgency(cap.agency, 'DITOLAK'),
        apiEnabled: config?.apiEnabled ?? false,
        apiVerifiedAt: config?.apiVerifiedAt ?? null,
      }
    })

    return {
      agencies,
      capabilities: integrationCapabilities(),
      totals: {
        services: services.length,
        submissions: byStatus.reduce((sum, row) => sum + row._count._all, 0),
        files,
        references,
        pendingManual: pendingLogs,
        draft: countOf('DRAFT'),
        ready: countOf('SIAP_DIAJUKAN'),
        awaitingPortal: countOf('MENUNGGU_PORTAL'),
        inProgress: countOf('DIAJUKAN') + countOf('DIPROSES'),
        finished: countOf('SELESAI'),
        rejected: countOf('DITOLAK'),
        cancelled: countOf('DIBATALKAN'),
      },
      byStatus: GOVERNMENT_STATUSES.map((status) => ({
        status,
        label: governmentStatusLabel(status),
        count: countOf(status),
      })),
      recentSubmissions,
      recentSyncLogs: recentLogs,
      encryption: { available: credentialEncryptionAvailable(), algorithm: encryptionAlgorithmLabel() },
      apiNote:
        'Tidak ada API resmi AHU/ATR/BPN yang diaktifkan. Gateway bekerja semi-otomatis: data disiapkan di sini, ' +
        'pengajuan dilakukan manusia pada portal resmi, lalu nomor, status, dan bukti dicatat kembali di sini.',
    }
  },
})

// ---------- PENGAJUAN ----------

route('government.submissions.list', {
  auth: 'session',
  perm: 'government.view',
  schema: governmentSubmissionListSchema,
  handler: async (q) => {
    const where: Record<string, unknown> = {}
    if (q.agency) where.agency = q.agency
    if (q.internalStatus) {
      where.internalStatus = q.internalStatus
    } else if (q.view !== 'SEMUA') {
      where.internalStatus = { in: GOVERNMENT_VIEW_GROUPS[q.view as GovernmentView].statuses }
    }
    if (q.serviceId) where.serviceId = q.serviceId
    if (q.clientId) where.clientId = q.clientId
    if (q.transactionId) where.transactionId = q.transactionId
    if (q.search) {
      where.OR = [
        { number: { contains: q.search } },
        { title: { contains: q.search } },
        { externalRef: { contains: q.search } },
        { officialStatus: { contains: q.search } },
        { service: { name: { contains: q.search } } },
        { client: { fullName: { contains: q.search } } },
      ]
    }
    const [total, items] = await Promise.all([
      db().governmentSubmission.count({ where }),
      db().governmentSubmission.findMany({
        where,
        ...paging(q),
        orderBy: { createdAt: 'desc' },
        include: {
          service: { select: { id: true, code: true, name: true, category: true } },
          client: { select: { id: true, code: true, fullName: true } },
          transaction: { select: { id: true, code: true, title: true } },
          createdBy: { select: { fullName: true } },
          _count: { select: { files: true, references: true } },
        },
      }),
    ])
    return paginated(items, total, q)
  },
})

route('government.submissions.get', {
  auth: 'session',
  perm: 'government.view',
  schema: idSchema,
  handler: async ({ id }) => {
    const sub = await db().governmentSubmission.findUnique({
      where: { id },
      include: {
        service: true,
        client: { select: { id: true, code: true, fullName: true } },
        transaction: { select: { id: true, code: true, title: true } },
        createdBy: { select: { fullName: true } },
        files: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          include: { uploadedBy: { select: { fullName: true } } },
        },
        statusHistory: { orderBy: { createdAt: 'desc' }, include: { changedBy: { select: { fullName: true } } } },
        references: { orderBy: { createdAt: 'desc' }, include: { createdBy: { select: { fullName: true } } } },
        syncLogs: { orderBy: { createdAt: 'desc' }, take: 30 },
      },
    })
    if (!sub) throw new NotFoundError('Pengajuan pemerintah tidak ditemukan.')
    const state = await submissionState(db(), sub)
    const transitions = nextGovernmentStatuses(sub.internalStatus).map((to) => ({
      to,
      label: governmentStatusLabel(to),
      missing: missingRequirements(to, state),
    }))
    return {
      ...sub,
      data: parseGovernmentData(sub.dataJson),
      files: sub.files.map((f) => ({ ...f, kindLabel: governmentFileKindLabel(f.kind) })),
      portalUrl: portalUrlFor(sub.agency),
      checklist: checklistFor(sub.agency, sub.service.code),
      fields: governmentFieldsFor(sub.agency),
      state,
      transitions,
      isFinal: isFinalGovernmentStatus(sub.internalStatus),
      officialSourceLabel: governmentOfficialSourceLabel(sub.officialSource),
    }
  },
})

route('government.submissions.create', {
  auth: 'session',
  perm: 'government.manage',
  schema: governmentSubmissionSchema,
  handler: async (input, ctx) => {
    const service = await db().governmentService.findUnique({ where: { id: input.serviceId } })
    if (!service) throw new NotFoundError('Layanan pemerintah tidak ditemukan.')
    if (!service.isActive) throw new ConflictError('Layanan ini sedang tidak digunakan.')
    if (service.agency !== input.agency) throw new ValidationError('Layanan tidak sesuai dengan agen yang dipilih.')
    const data = cleanData(input.data)
    const portalUrl = officialPortalUrl(service.agency)
    return inTransaction(async (tx) => {
      const number = await nextNumber(tx, 'government')
      const created = await tx.governmentSubmission.create({
        data: {
          number,
          agency: service.agency,
          serviceId: service.id,
          clientId: input.clientId ?? null,
          transactionId: input.transactionId ?? null,
          title: input.title,
          description: input.description,
          dataJson: Object.keys(data).length ? JSON.stringify(data) : null,
          internalStatus: 'DRAFT',
          officialSource: 'MANUAL',
          createdById: ctx.session!.userId,
          statusHistory: {
            create: {
              scope: 'INTERNAL',
              fromStatus: null,
              toStatus: 'DRAFT',
              source: 'MANUAL',
              changedById: ctx.session!.userId,
            },
          },
        },
      })
      await logSync(tx, ctx, {
        submissionId: created.id,
        agency: service.agency,
        direction: 'PERSIAPAN',
        status: 'SUCCESS',
        message: `Pengajuan ${number} (${service.name}) dibuat sebagai draft internal.`,
        detail: { portalUrl, dataFields: Object.keys(data).length },
      })
      await audit(tx, {
        userId: ctx.session!.userId,
        username: ctx.username,
        action: 'CREATE',
        entity: 'GovernmentSubmission',
        entityId: created.id,
        after: { number, agency: service.agency, service: service.code, title: created.title },
      })
      return created
    })
  },
})

route('government.submissions.update', {
  auth: 'session',
  perm: 'government.manage',
  schema: governmentSubmissionUpdateSchema,
  handler: async (input, ctx) => {
    const existing = await getSubmissionOrThrow(db(), input.id)
    assertNotFinal(existing)
    const data = cleanData(input.data)
    return inTransaction(async (tx) => {
      const updated = await tx.governmentSubmission.update({
        where: { id: input.id },
        data: {
          title: input.title,
          description: input.description,
          clientId: input.clientId ?? null,
          transactionId: input.transactionId ?? null,
          dataJson: Object.keys(data).length ? JSON.stringify(data) : null,
        },
      })
      await logSync(tx, ctx, {
        submissionId: input.id,
        agency: existing.agency,
        direction: 'PERSIAPAN',
        status: 'SUCCESS',
        message: `Data persiapan pengajuan ${existing.number} diperbarui.`,
        detail: { dataFields: Object.keys(data).length },
      })
      await audit(tx, {
        userId: ctx.session!.userId,
        username: ctx.username,
        action: 'UPDATE',
        entity: 'GovernmentSubmission',
        entityId: input.id,
        before: { title: existing.title, data: parseGovernmentData(existing.dataJson) },
        after: { title: updated.title, data },
      })
      return updated
    })
  },
})

route('government.submissions.changeStatus', {
  auth: 'session',
  perm: 'government.manage',
  schema: governmentStatusSchema,
  handler: (input, ctx) =>
    inTransaction(async (tx) => {
      const sub = await getSubmissionOrThrow(tx, input.id)
      return applyTransition(tx, ctx, sub, {
        toStatus: input.toStatus,
        source: input.source,
        note: input.note,
        officialStatus: input.officialStatus,
      })
    }),
})

route('government.submissions.portalOpened', {
  auth: 'session',
  perm: 'government.manage',
  schema: governmentPortalOpenSchema,
  handler: async (input, ctx) => {
    const sub = await getSubmissionOrThrow(db(), input.id)
    const portalUrl = portalUrlFor(sub.agency)
    await inTransaction(async (tx) => {
      await logSync(tx, ctx, {
        submissionId: sub.id,
        agency: sub.agency,
        direction: 'PORTAL',
        status: 'PENDING',
        message: input.online
          ? `Portal resmi ${portalUrl} dibuka. Pengisian dan pengajuan tetap dilakukan operator di portal; aplikasi tidak mengambil data dari portal.`
          : 'Perangkat sedang luring. Portal resmi belum dapat dibuka; persiapan tetap tersimpan lokal dan menunggu tindakan manual.',
        detail: { portalUrl, online: input.online },
      })
      await audit(tx, {
        userId: ctx.session!.userId,
        username: ctx.username,
        action: 'PORTAL_OPEN',
        entity: 'GovernmentSubmission',
        entityId: sub.id,
        meta: { portalUrl, online: input.online },
      })
    })
    return { ok: true, portalUrl, online: input.online }
  },
})

route('government.submissions.recordOfficialStatus', {
  auth: 'session',
  perm: 'government.manage',
  schema: governmentOfficialStatusSchema,
  handler: (input, ctx) =>
    inTransaction(async (tx) => {
      const sub = await getSubmissionOrThrow(tx, input.id)
      assertNotFinal(sub)
      const updated = await tx.governmentSubmission.update({
        where: { id: sub.id },
        data: { officialStatus: input.officialStatus, officialSource: input.source },
      })
      await tx.governmentStatusHistory.create({
        data: {
          submissionId: sub.id,
          scope: 'OFFICIAL',
          fromStatus: sub.officialStatus,
          toStatus: sub.internalStatus,
          source: input.source,
          officialStatus: input.officialStatus,
          note: input.note,
          changedById: ctx.session!.userId,
        },
      })
      await logSync(tx, ctx, {
        submissionId: sub.id,
        agency: sub.agency,
        direction: 'STATUS',
        status: 'SUCCESS',
        message:
          `Status resmi dicatat dari ${governmentOfficialSourceLabel(input.source).toLowerCase()}: ${input.officialStatus}. ` +
          `Status internal tetap "${governmentStatusLabel(sub.internalStatus)}" sampai bukti hasil diunggah.`,
        detail: { officialStatus: input.officialStatus, source: input.source, portalUrl: portalUrlFor(sub.agency) },
      })
      await audit(tx, {
        userId: ctx.session!.userId,
        username: ctx.username,
        action: 'OFFICIAL_STATUS',
        entity: 'GovernmentSubmission',
        entityId: sub.id,
        before: { officialStatus: sub.officialStatus, officialSource: sub.officialSource },
        after: { officialStatus: updated.officialStatus, officialSource: updated.officialSource },
      })
      return updated
    }),
})

route('government.submissions.addReference', {
  auth: 'session',
  perm: 'government.manage',
  schema: governmentReferenceSchema,
  handler: (input, ctx) =>
    inTransaction(async (tx) => {
      const sub = await getSubmissionOrThrow(tx, input.submissionId)
      assertNotFinal(sub)
      const reference = await tx.governmentReference.create({
        data: {
          submissionId: sub.id,
          type: input.type,
          value: input.value,
          issuedAt: input.issuedAt,
          source: input.source,
          notes: input.notes,
          createdById: ctx.session!.userId,
        },
      })
      const primarySet = !sub.externalRef && input.type !== 'LAINNYA'
      if (primarySet) {
        await tx.governmentSubmission.update({
          where: { id: sub.id },
          data: { externalRef: input.value, officialSource: input.source },
        })
      }
      await logSync(tx, ctx, {
        submissionId: sub.id,
        agency: sub.agency,
        direction: 'PENGAJUAN',
        status: 'SUCCESS',
        message: `Nomor resmi "${input.value}" (${input.type}) dicatat dari ${governmentOfficialSourceLabel(input.source).toLowerCase()}.`,
        detail: { referenceType: input.type, primarySet, portalUrl: portalUrlFor(sub.agency) },
      })
      await audit(tx, {
        userId: ctx.session!.userId,
        username: ctx.username,
        action: 'CREATE',
        entity: 'GovernmentReference',
        entityId: reference.id,
        after: { submissionNumber: sub.number, type: input.type, value: input.value, source: input.source },
      })
      return reference
    }),
})

route('government.submissions.exportSummary', {
  auth: 'session',
  perm: 'government.manage',
  schema: governmentExportSummarySchema,
  handler: async (input, ctx) => {
    const sub = await db().governmentSubmission.findUnique({
      where: { id: input.id },
      include: {
        service: true,
        client: { select: { fullName: true, code: true } },
        transaction: { select: { code: true } },
        createdBy: { select: { fullName: true } },
        files: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
      },
    })
    if (!sub) throw new NotFoundError('Pengajuan pemerintah tidak ditemukan.')
    const summary: SummaryInput = {
      id: sub.id,
      number: sub.number,
      agency: sub.agency,
      serviceName: sub.service.name,
      title: sub.title,
      description: sub.description,
      internalStatus: sub.internalStatus,
      officialStatus: sub.officialStatus,
      externalRef: sub.externalRef,
      clientName: sub.client?.fullName ?? null,
      transactionCode: sub.transaction?.code ?? null,
      createdByName: sub.createdBy?.fullName ?? null,
      createdAt: sub.createdAt.toISOString(),
      data: parseGovernmentData(sub.dataJson),
      files: sub.files.map((f) => ({ fileName: f.fileName, kindLabel: governmentFileKindLabel(f.kind), checksum: f.checksum })),
    }

    let target: string
    if (input.filePath) {
      if (!path.isAbsolute(input.filePath)) throw new ValidationError('Path ekspor harus absolut.')
      if (path.extname(input.filePath).toLowerCase() !== '.pdf') throw new ValidationError('Lembar persiapan diekspor sebagai PDF.')
      target = input.filePath
    } else {
      const win = windowOrNull()
      const defaultName = `Lembar Persiapan ${sub.number.replace(/[^\w.-]+/g, '-')}.pdf`
      const result = win
        ? await dialog.showSaveDialog(win, { title: 'Simpan lembar persiapan', defaultPath: defaultName, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
        : await dialog.showSaveDialog({ defaultPath: defaultName, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
      if (result.canceled || !result.filePath) return { canceled: true }
      target = result.filePath
    }

    const tmpPath = await renderSummaryPdf(summary)
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.copyFileSync(tmpPath, target)
    } finally {
      try {
        fs.rmSync(tmpPath, { force: true })
      } catch {
        /* berkas sementara mungkin sudah dipindahkan */
      }
    }

    await inTransaction(async (tx) => {
      await logSync(tx, ctx, {
        submissionId: sub.id,
        agency: sub.agency,
        direction: 'PERSIAPAN',
        status: 'SUCCESS',
        message: `Lembar persiapan ${sub.number} diekspor ke PDF untuk mengisi formulir portal resmi secara manual.`,
        detail: { portalUrl: portalUrlFor(sub.agency), target },
      })
      await audit(tx, {
        userId: ctx.session!.userId,
        username: ctx.username,
        action: 'EXPORT',
        entity: 'GovernmentSubmission',
        entityId: sub.id,
        meta: { target, documentType: 'LEMBAR_PERSIAPAN' },
      })
    })
    return { canceled: false, filePath: target }
  },
})

// ---------- BERKAS PENGAJUAN ----------

route('government.files.pick', {
  auth: 'session',
  perm: 'government.manage',
  handler: async () => {
    const win = windowOrNull()
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: 'Pilih berkas pengajuan pemerintah',
          properties: ['openFile'],
          filters: [{ name: 'Dokumen', extensions: ALLOWED_EXTENSIONS.map((e) => e.slice(1)) }],
        })
      : await dialog.showOpenDialog({ properties: ['openFile'] })
    if (result.canceled || !result.filePaths[0]) return null
    const picked = result.filePaths[0]
    const st = fs.statSync(picked)
    return { path: picked, name: path.basename(picked), sizeBytes: st.size, mimeType: path.extname(picked).toLowerCase() }
  },
})

route('government.files.add', {
  auth: 'session',
  perm: 'government.manage',
  schema: governmentFileAddSchema,
  handler: async (input, ctx) => {
    const sub = await getSubmissionOrThrow(db(), input.submissionId)
    assertNotFinal(sub)
    const stored = storeFile(input.tempPath, input.originalName, {
      clientId: sub.clientId,
      transactionId: sub.transactionId,
      governmentSubmissionId: sub.id,
      kind: 'government',
    })
    try {
      return await inTransaction(async (tx) => {
        const created = await tx.governmentSubmissionFile.create({
          data: {
            submissionId: sub.id,
            kind: input.kind,
            fileName: stored.fileName,
            storagePath: stored.storagePath,
            mimeType: stored.mimeType,
            sizeBytes: stored.sizeBytes,
            checksum: stored.checksum,
            notes: input.notes,
            uploadedById: ctx.session!.userId,
          },
        })
        await logSync(tx, ctx, {
          submissionId: sub.id,
          agency: sub.agency,
          direction: 'BERKAS',
          status: 'SUCCESS',
          message: `${governmentFileKindLabel(input.kind)} "${stored.fileName}" dilampirkan pada pengajuan ${sub.number}.`,
          detail: { checksum: stored.checksum, sizeBytes: stored.sizeBytes, kind: input.kind },
        })
        await audit(tx, {
          userId: ctx.session!.userId,
          username: ctx.username,
          action: 'UPLOAD',
          entity: 'GovernmentSubmissionFile',
          entityId: created.id,
          after: {
            submissionNumber: sub.number,
            kind: input.kind,
            fileName: created.fileName,
            sizeBytes: created.sizeBytes,
            checksum: created.checksum,
          },
        })
        return { ...created, kindLabel: governmentFileKindLabel(created.kind) }
      })
    } catch (err) {
      deleteStoredFile(stored.storagePath)
      throw err
    }
  },
})

route('government.files.remove', {
  auth: 'session',
  perm: 'government.manage',
  schema: idSchema,
  handler: async ({ id }, ctx) => {
    const file = await db().governmentSubmissionFile.findUnique({ where: { id }, include: { submission: true } })
    if (!file) throw new NotFoundError('Berkas pengajuan tidak ditemukan.')
    if (file.deletedAt) throw new ConflictError('Berkas sudah dikeluarkan dari daftar.')
    assertNotFinal(file.submission)
    await inTransaction(async (tx) => {
      await tx.governmentSubmissionFile.update({ where: { id }, data: { deletedAt: new Date() } })
      await logSync(tx, ctx, {
        submissionId: file.submissionId,
        agency: file.submission.agency,
        direction: 'BERKAS',
        status: 'SUCCESS',
        message: `Berkas "${file.fileName}" dikeluarkan dari lampiran pengajuan ${file.submission.number}; berkas fisik tetap dipertahankan untuk audit.`,
        detail: { checksum: file.checksum },
      })
      await audit(tx, {
        userId: ctx.session!.userId,
        username: ctx.username,
        action: 'SOFT_DELETE',
        entity: 'GovernmentSubmissionFile',
        entityId: id,
        before: { fileName: file.fileName, kind: file.kind, checksum: file.checksum },
      })
    })
    return { ok: true, note: 'Berkas fisik dipertahankan untuk keperluan audit.' }
  },
})

async function activeFileRow(id: string) {
  const file = await db().governmentSubmissionFile.findUnique({ where: { id }, include: { submission: true } })
  if (!file) throw new NotFoundError('Berkas pengajuan tidak ditemukan.')
  if (file.deletedAt) throw new ConflictError('Berkas ini sudah dikeluarkan dari daftar.')
  return file
}

route('government.files.preview', {
  auth: 'session',
  perm: 'government.view',
  schema: idSchema,
  handler: async ({ id }) => {
    const file = await activeFileRow(id)
    const preview = preparePreview(resolveStoragePath(file.storagePath), file.mimeType)
    return { ...preview, fileName: file.fileName, tooLarge: preview.kind === 'too-large' }
  },
})

route('government.files.openExternal', {
  auth: 'session',
  perm: 'government.view',
  schema: idSchema,
  handler: async ({ id }) => {
    const file = await activeFileRow(id)
    const abs = resolveStoragePath(file.storagePath)
    if (!fs.existsSync(abs)) throw new NotFoundError('Berkas tidak ditemukan di penyimpanan.')
    const err = await shell.openPath(abs)
    if (err) throw new Error(err)
    return { ok: true }
  },
})

route('government.files.download', {
  auth: 'session',
  perm: 'government.view',
  schema: idSchema,
  handler: async ({ id }) => {
    const file = await activeFileRow(id)
    const win = windowOrNull()
    const result = win
      ? await dialog.showSaveDialog(win, { defaultPath: file.fileName })
      : await dialog.showSaveDialog({ defaultPath: file.fileName })
    if (result.canceled || !result.filePath) return { canceled: true }
    copyExport(file.storagePath, result.filePath)
    return { canceled: false, filePath: result.filePath }
  },
})

route('government.files.list', {
  auth: 'session',
  perm: 'government.view',
  schema: governmentFileListSchema,
  handler: async (q) => {
    const where: Record<string, unknown> = { deletedAt: null }
    if (q.kind) where.kind = q.kind
    if (q.submissionId) where.submissionId = q.submissionId
    if (q.agency) where.submission = { agency: q.agency }
    if (q.search) {
      where.OR = [
        { fileName: { contains: q.search } },
        { notes: { contains: q.search } },
        { submission: { number: { contains: q.search } } },
        { submission: { title: { contains: q.search } } },
      ]
    }
    const [total, items] = await Promise.all([
      db().governmentSubmissionFile.count({ where }),
      db().governmentSubmissionFile.findMany({
        where,
        ...paging(q),
        orderBy: { createdAt: 'desc' },
        include: {
          submission: {
            select: {
              id: true, number: true, title: true, agency: true, internalStatus: true, officialStatus: true, externalRef: true,
            },
          },
          uploadedBy: { select: { fullName: true } },
        },
      }),
    ])
    return paginated(items.map((f) => ({ ...f, kindLabel: governmentFileKindLabel(f.kind) })), total, q)
  },
})

// ---------- RIWAYAT SINKRONISASI ----------

route('government.syncLogs.list', {
  auth: 'session',
  perm: 'government.view',
  schema: governmentSyncLogListSchema,
  handler: async (q) => {
    const where: Record<string, unknown> = {}
    if (q.agency) where.agency = q.agency
    if (q.status) where.status = q.status
    if (q.submissionId) where.submissionId = q.submissionId
    if (q.search) {
      where.OR = [{ message: { contains: q.search } }, { submission: { number: { contains: q.search } } }]
    }
    const [total, items] = await Promise.all([
      db().governmentSyncLog.count({ where }),
      db().governmentSyncLog.findMany({
        where,
        ...paging(q),
        orderBy: { createdAt: 'desc' },
        include: {
          submission: { select: { id: true, number: true, title: true, internalStatus: true } },
          createdBy: { select: { fullName: true } },
        },
      }),
    ])
    return paginated(items, total, q)
  },
})

// ---------- KONFIGURASI & KREDENSIAL ----------

route('government.config.get', {
  auth: 'session',
  perm: 'government.configure',
  handler: async () => {
    const [configs, credentials, services, submissions] = await Promise.all([
      db().governmentApiConfig.findMany(),
      db().governmentApiCredential.findMany({ orderBy: [{ agency: 'asc' }, { label: 'asc' }], select: credentialSelect }),
      db().governmentService.count({ where: { isActive: true } }),
      db().governmentSubmission.groupBy({ by: ['agency'], _count: { _all: true } }),
    ])
    return {
      agencies: integrationCapabilities().map((cap) => {
        const config = configs.find((c) => c.agency === cap.agency)
        return {
          ...cap,
          mode: config?.mode ?? 'SEMI_OTOMATIS',
          apiEnabled: config?.apiEnabled ?? false,
          apiVerifiedAt: config?.apiVerifiedAt ?? null,
          notes: config?.notes ?? null,
          updatedAt: config?.updatedAt ?? null,
          serviceCount: services,
          submissionCount: submissions.find((row) => row.agency === cap.agency)?._count._all ?? 0,
          credentials: credentials.filter((c) => c.agency === cap.agency),
        }
      }),
      encryption: { available: credentialEncryptionAvailable(), algorithm: encryptionAlgorithmLabel() },
      portals: { AHU: officialPortalUrl('AHU'), BPN: officialPortalUrl('BPN') },
    }
  },
})

route('government.config.update', {
  auth: 'session',
  perm: 'government.configure',
  schema: governmentConfigUpdateSchema,
  handler: async (input, ctx) => {
    if (input.apiEnabled) {
      throw new ConflictError(
        'API resmi AHU/ATR/BPN belum tersedia untuk aplikasi ini. Pengajuan tetap semi-otomatis sampai ada dokumentasi ' +
          'dan otorisasi tertulis dari penyelenggara.',
      )
    }
    const existing = await db().governmentApiConfig.findUnique({ where: { agency: input.agency } })
    if (!existing) throw new NotFoundError(`Konfigurasi untuk ${input.agency} belum tersedia.`)
    return inTransaction(async (tx) => {
      const updated = await tx.governmentApiConfig.update({
        where: { agency: input.agency },
        data: { notes: input.notes, apiEnabled: false, mode: 'SEMI_OTOMATIS', updatedById: ctx.session!.userId },
      })
      await audit(tx, {
        userId: ctx.session!.userId,
        username: ctx.username,
        action: 'UPDATE',
        entity: 'GovernmentApiConfig',
        entityId: updated.id,
        before: { notes: existing.notes, apiEnabled: existing.apiEnabled },
        after: { notes: updated.notes, apiEnabled: updated.apiEnabled },
      })
      return updated
    })
  },
})

route('government.credentials.save', {
  auth: 'session',
  perm: 'government.configure',
  schema: governmentCredentialSchema,
  handler: async (input, ctx) => {
    const cipherText = encryptCredential(input.secret)
    const existing = await db().governmentApiCredential.findUnique({
      where: { agency_label: { agency: input.agency, label: input.label } },
    })
    return inTransaction(async (tx) => {
      const saved = existing
        ? await tx.governmentApiCredential.update({
            where: { id: existing.id },
            data: { accountHint: input.accountHint, cipherText, algorithm: 'DPAPI_SAFE_STORAGE' },
            select: credentialSelect,
          })
        : await tx.governmentApiCredential.create({
            data: {
              agency: input.agency,
              label: input.label,
              accountHint: input.accountHint,
              cipherText,
              algorithm: 'DPAPI_SAFE_STORAGE',
              createdById: ctx.session!.userId,
            },
            select: credentialSelect,
          })
      await logSync(tx, ctx, {
        agency: input.agency,
        direction: 'KREDENSIAL',
        status: 'SUCCESS',
        message: `Kredensial "${input.label}" untuk ${input.agency} ${existing ? 'diperbarui' : 'disimpan'} terenkripsi (${encryptionAlgorithmLabel()}).`,
        detail: { agency: input.agency, label: input.label, algorithm: 'DPAPI_SAFE_STORAGE' },
      })
      await audit(tx, {
        userId: ctx.session!.userId,
        username: ctx.username,
        action: existing ? 'UPDATE' : 'CREATE',
        entity: 'GovernmentApiCredential',
        entityId: saved.id,
        after: { agency: input.agency, label: input.label, accountHint: input.accountHint, algorithm: 'DPAPI_SAFE_STORAGE' },
        meta: { secretStored: 'encrypted-dpapi' },
      })
      return saved
    })
  },
})

route('government.credentials.delete', {
  auth: 'session',
  perm: 'government.configure',
  schema: idSchema,
  handler: async ({ id }, ctx) => {
    const existing = await db().governmentApiCredential.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Kredensial tidak ditemukan.')
    await inTransaction(async (tx) => {
      await tx.governmentApiCredential.delete({ where: { id } })
      await logSync(tx, ctx, {
        agency: existing.agency,
        direction: 'KREDENSIAL',
        status: 'SUCCESS',
        message: `Kredensial "${existing.label}" untuk ${existing.agency} dihapus dari penyimpanan terenkripsi.`,
        detail: { agency: existing.agency, label: existing.label },
      })
      await audit(tx, {
        userId: ctx.session!.userId,
        username: ctx.username,
        action: 'DELETE',
        entity: 'GovernmentApiCredential',
        entityId: id,
        before: { agency: existing.agency, label: existing.label, accountHint: existing.accountHint },
      })
    })
    return { ok: true }
  },
})

/** Menguji kredensial masih terbaca dari penyimpanan terenkripsi tanpa mengirim rahasia ke antarmuka. */
route('government.credentials.test', {
  auth: 'session',
  perm: 'government.configure',
  schema: idSchema,
  handler: async ({ id }, ctx) => {
    const existing = await db().governmentApiCredential.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Kredensial tidak ditemukan.')
    const secret = decryptCredential(existing.cipherText)
    const decryptedLength = secret.length
    await inTransaction(async (tx) => {
      await tx.governmentApiCredential.update({ where: { id }, data: { lastUsedAt: new Date() } })
      await logSync(tx, ctx, {
        agency: existing.agency,
        direction: 'KREDENSIAL',
        status: 'SUCCESS',
        message: `Kredensial "${existing.label}" berhasil dibaca dari penyimpanan terenkripsi (${encryptionAlgorithmLabel()}); nilai rahasia tidak dikirim ke antarmuka.`,
        detail: { agency: existing.agency, label: existing.label },
      })
      await audit(tx, {
        userId: ctx.session!.userId,
        username: ctx.username,
        action: 'READ',
        entity: 'GovernmentApiCredential',
        entityId: id,
        meta: { agency: existing.agency, label: existing.label, decryptedLength },
      })
    })
    return { ok: true, algorithm: existing.algorithm, decryptedLength }
  },
})
