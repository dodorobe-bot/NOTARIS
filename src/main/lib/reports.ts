import { db } from '../db'
import { dateRange } from './util'
import { fromZonedParts } from './time'
import { ConflictError } from './errors'
import { formatDate } from '../../shared/format'
import { DEED_STATUS_LABELS, WORKFLOW_LABELS, labelOf, PPAT_SERVICE_TYPES, INVOICE_STATUSES } from '../../shared/constants'
import { getSettings } from './settings'

export interface ReportColumn {
  key: string
  label: string
  type?: 'text' | 'money' | 'date' | 'number'
  width?: number
}

export interface ReportDefinition {
  id: string
  title: string
  description: string
  orientation: 'portrait' | 'landscape'
  signature?: boolean
}

export interface ReportFilters {
  from?: string
  to?: string
  year?: number
  status?: string
}

export interface ReportResult {
  id: string
  title: string
  subtitle: string
  orientation: 'portrait' | 'landscape'
  signature: boolean
  columns: ReportColumn[]
  rows: Record<string, string | number | null>[]
  totals?: Record<string, number>
  /** Jumlah baris yang sebenarnya ada pada filter; diisi hanya ketika hasil dibatasi. */
  rowTotal?: number
  meta: {
    officeName: string
    notaryName: string
    city: string
    address: string
    generatedAt: string
    generatedBy: string
    period: string
  }
}

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  { id: 'clients', title: 'Daftar Klien', description: 'Seluruh klien aktif, nonaktif, dan badan hukum.', orientation: 'landscape' },
  { id: 'deeds', title: 'Daftar Akta', description: 'Daftar akta notaris/PPAT beserta status dan notaris.', orientation: 'landscape' },
  { id: 'repertorium', title: 'Repertorium Akta', description: 'Catatan repertorium akta per tahun.', orientation: 'portrait', signature: true },
  { id: 'protocol', title: 'Protokol Notaris', description: 'Register protokol minuta, salinan, dan arsip.', orientation: 'portrait', signature: true },
  { id: 'ppat-transactions', title: 'Transaksi PPAT', description: 'Transaksi pertanahan PPAT beserta objek dan nilai transaksi.', orientation: 'landscape' },
  { id: 'certificates', title: 'Daftar Sertifikat', description: 'Sertifikat hak atas tanah yang tercatat.', orientation: 'landscape' },
  { id: 'finance', title: 'Laporan Keuangan (Invoice)', description: 'Invoice, pembayaran, dan sisa tagihan.', orientation: 'landscape' },
  { id: 'payments', title: 'Laporan Pembayaran', description: 'Penerimaan pembayaran dalam periode.', orientation: 'portrait' },
  { id: 'receivables', title: 'Laporan Piutang', description: 'Invoice belum lunas beserta umur piutang.', orientation: 'portrait' },
  { id: 'staff-activity', title: 'Aktivitas Karyawan', description: 'Ringkasan aktivitas pengguna berdasarkan audit log.', orientation: 'portrait' },
  { id: 'audit-log', title: 'Audit Log', description: 'Jejak audit lengkap beserta hash rantai.', orientation: 'landscape' },
]

/**
 * Batas keras jumlah baris satu laporan. Laporan dibangun sekaligus untuk pratinjau, Excel, dan PDF,
 * sehingga membacanya tanpa batas akan menghabiskan memori proses utama saat dataset membesar.
 */
export const MAX_REPORT_ROWS = 20_000
/** Jejak audit dibaca bertahap; nilai ini sudah menjadi perilaku lama dan dipertahankan. */
const AUDIT_REPORT_ROWS = 5_000
/** Ambil satu baris ekstra untuk mengetahui apakah hasil melewati batas tanpa memuat semuanya. */
const FETCH_LIMIT = MAX_REPORT_ROWS + 1

function rowLimitError(def: ReportDefinition): ConflictError {
  return new ConflictError(
    `Laporan "${def.title}" memuat lebih dari ${MAX_REPORT_ROWS.toLocaleString('id-ID')} baris. ` +
      'Persempit periode (tahun atau tanggal) atau filter status, lalu cetak bertahap.',
  )
}

function assertWithinLimit(count: number, def: ReportDefinition): void {
  if (count > MAX_REPORT_ROWS) throw rowLimitError(def)
}

function periodLabel(filters: ReportFilters): string {
  if (filters.year) return `Tahun ${filters.year}`
  if (filters.from && filters.to) return `${formatDate(filters.from)} s.d. ${formatDate(filters.to)}`
  if (filters.from) return `Sejak ${formatDate(filters.from)}`
  if (filters.to) return `Sampai ${formatDate(filters.to)}`
  return 'Seluruh periode'
}

function deedDateFilter(filters: ReportFilters, range?: { gte?: Date; lte?: Date }) {
  if (filters.year) {
    return {
      gte: fromZonedParts({ year: filters.year, month: 1, day: 1 }),
      lt: fromZonedParts({ year: filters.year + 1, month: 1, day: 1 }),
    }
  }
  return range
}

export async function buildReport(
  id: string,
  filters: ReportFilters,
  generatedBy: string,
): Promise<ReportResult> {
  const def = REPORT_DEFINITIONS.find((r) => r.id === id)
  if (!def) throw new Error('Jenis laporan tidak dikenal.')
  const settings = await getSettings()
  const range = dateRange(filters.from, filters.to)
  let columns: ReportColumn[] = []
  let rows: Record<string, string | number | null>[] = []
  let totals: Record<string, number> | undefined
  let rowTotal: number | undefined

  if (id === 'clients') {
    columns = [
      { key: 'code', label: 'Kode' }, { key: 'name', label: 'Nama / Perusahaan' },
      { key: 'type', label: 'Jenis' }, { key: 'nik', label: 'NIK' }, { key: 'npwp', label: 'NPWP' },
      { key: 'phone', label: 'Telepon' }, { key: 'city', label: 'Kota' },
      { key: 'status', label: 'Status' }, { key: 'created', label: 'Terdaftar' },
    ]
    const clients = await db().client.findMany({
      where: { deletedAt: null, ...(filters.status ? { status: filters.status } : {}) },
      orderBy: { code: 'asc' },
      take: FETCH_LIMIT,
      select: {
        code: true, fullName: true, type: true, nik: true, npwp: true, phone: true,
        kabupaten: true, provinsi: true, status: true, createdAt: true,
        company: { select: { companyName: true, legalType: true } },
      },
    })
    assertWithinLimit(clients.length, def)
    rows = clients.map((c) => ({
      code: c.code,
      name: c.type === 'BADAN_HUKUM' ? c.company?.companyName ?? c.fullName : c.fullName,
      type: c.type === 'BADAN_HUKUM' ? `Badan Hukum (${c.company?.legalType ?? '-'})` : 'Perorangan',
      nik: c.nik ?? '-', npwp: c.npwp ?? '-', phone: c.phone ?? '-',
      city: c.kabupaten ?? c.provinsi ?? '-',
      status: c.status, created: formatDate(c.createdAt),
    }))
  } else if (id === 'deeds') {
    columns = [
      { key: 'number', label: 'Nomor Akta' }, { key: 'date', label: 'Tanggal' },
      { key: 'type', label: 'Jenis Akta' }, { key: 'client', label: 'Penghadap/Klien' },
      { key: 'status', label: 'Status' }, { key: 'notary', label: 'Notaris/PPAT' },
    ]
    const where: Record<string, unknown> = {}
    if (filters.status) where.status = filters.status
    const deedDate = deedDateFilter(filters, range)
    if (deedDate) where.deedDate = deedDate
    const deeds = await db().deed.findMany({
      where, orderBy: [{ deedDate: 'desc' }],
      take: FETCH_LIMIT,
      select: {
        deedNumber: true, deedDate: true, status: true,
        deedType: { select: { name: true } },
        client: { select: { fullName: true } },
        notary: { select: { fullName: true } },
      },
    })
    assertWithinLimit(deeds.length, def)
    rows = deeds.map((d) => ({
      number: d.deedNumber, date: formatDate(d.deedDate), type: d.deedType.name,
      client: d.client.fullName, status: DEED_STATUS_LABELS[d.status] ?? d.status,
      notary: d.notary?.fullName ?? '-',
    }))
  } else if (id === 'repertorium') {
    columns = [
      { key: 'number', label: 'No. Repertorium' }, { key: 'deedNumber', label: 'Nomor Akta' },
      { key: 'date', label: 'Tanggal Akta' }, { key: 'type', label: 'Jenis Akta' },
      { key: 'client', label: 'Penghadap' }, { key: 'registered', label: 'Dicatat' },
    ]
    const where: Record<string, unknown> = {}
    if (filters.year) where.year = filters.year
    const rowsDb = await db().deedRepertorium.findMany({
      where, orderBy: [{ year: 'desc' }, { number: 'desc' }],
      take: FETCH_LIMIT,
      select: {
        number: true, year: true, registeredAt: true,
        deed: {
          select: {
            deedNumber: true, deedDate: true,
            deedType: { select: { name: true } },
            client: { select: { fullName: true } },
          },
        },
      },
    })
    assertWithinLimit(rowsDb.length, def)
    rows = rowsDb.map((r) => ({
      number: `${String(r.number).padStart(3, '0')}/${r.year}`,
      deedNumber: r.deed.deedNumber,
      date: formatDate(r.deed.deedDate),
      type: r.deed.deedType.name,
      client: r.deed.client.fullName,
      registered: formatDate(r.registeredAt),
    }))
  } else if (id === 'protocol') {
    columns = [
      { key: 'register', label: 'No. Register' }, { key: 'type', label: 'Jenis Protokol' },
      { key: 'deedNumber', label: 'Nomor Akta' }, { key: 'deposited', label: 'Tanggal Setor' },
      { key: 'location', label: 'Lokasi' },
    ]
    const where: Record<string, unknown> = {}
    if (filters.year) where.year = filters.year
    const rowsDb = await db().protocolRegister.findMany({
      where, orderBy: [{ year: 'desc' }, { registerNumber: 'desc' }],
      take: FETCH_LIMIT,
      select: {
        registerNumber: true, year: true, protocolType: true, depositedAt: true, location: true,
        deed: { select: { deedNumber: true } },
      },
    })
    assertWithinLimit(rowsDb.length, def)
    rows = rowsDb.map((r) => ({
      register: `${String(r.registerNumber).padStart(3, '0')}/${r.year}`,
      type: r.protocolType, deedNumber: r.deed?.deedNumber ?? '-',
      deposited: formatDate(r.depositedAt), location: r.location ?? '-',
    }))
  } else if (id === 'ppat-transactions') {
    columns = [
      { key: 'code', label: 'Kode' }, { key: 'service', label: 'Layanan' },
      { key: 'client', label: 'Klien' }, { key: 'certificate', label: 'Sertifikat' },
      { key: 'owner', label: 'Pemilik' }, { key: 'price', label: 'Nilai Transaksi', type: 'money' },
      { key: 'status', label: 'Status' },
    ]
    const where: Record<string, unknown> = {
      type: 'PPAT', deletedAt: null,
      ...(range ? { createdAt: range } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    }
    const trx = await db().transaction.findMany({
      where, orderBy: { createdAt: 'desc' },
      take: FETCH_LIMIT,
      select: {
        code: true, serviceType: true, status: true,
        client: { select: { fullName: true } },
        properties: { select: { certificateNumber: true, ownerName: true, transactionPrice: true } },
      },
    })
    assertWithinLimit(trx.length, def)
    rows = trx.flatMap((t) =>
      (t.properties.length ? t.properties : [null]).map((p) => ({
        code: t.code,
        service: labelOf(PPAT_SERVICE_TYPES, t.serviceType),
        client: t.client.fullName,
        certificate: p?.certificateNumber ?? '-',
        owner: p?.ownerName ?? '-',
        price: p?.transactionPrice ?? 0,
        status: WORKFLOW_LABELS[t.status] ?? t.status,
      })),
    )
    assertWithinLimit(rows.length, def)
    const sum = await db().property.aggregate({
      where: { transaction: where },
      _sum: { transactionPrice: true },
    })
    totals = { price: sum._sum.transactionPrice ?? 0 }
  } else if (id === 'certificates') {
    columns = [
      { key: 'number', label: 'Nomor Sertifikat' }, { key: 'type', label: 'Hak' },
      { key: 'owner', label: 'Pemilik' }, { key: 'address', label: 'Alamat Objek' },
      { key: 'area', label: 'Luas (m2)', type: 'number' }, { key: 'issued', label: 'Terbit' },
      { key: 'expiry', label: 'Berakhir' },
    ]
    const certs = await db().certificate.findMany({
      orderBy: { createdAt: 'desc' },
      take: FETCH_LIMIT,
      select: {
        number: true, type: true, ownerName: true, issuedAt: true, expiryAt: true,
        property: { select: { address: true, landArea: true, ownerName: true } },
      },
    })
    assertWithinLimit(certs.length, def)
    rows = certs.map((c) => ({
      number: c.number, type: c.type, owner: c.ownerName ?? c.property.ownerName ?? '-',
      address: c.property.address ?? '-', area: c.property.landArea ?? 0,
      issued: c.issuedAt ? formatDate(c.issuedAt) : '-',
      expiry: c.expiryAt ? formatDate(c.expiryAt) : '-',
    }))
  } else if (id === 'finance') {
    columns = [
      { key: 'number', label: 'Invoice' }, { key: 'date', label: 'Tanggal' },
      { key: 'client', label: 'Klien' }, { key: 'status', label: 'Status' },
      { key: 'total', label: 'Total', type: 'money' }, { key: 'paid', label: 'Dibayar', type: 'money' },
      { key: 'remaining', label: 'Sisa', type: 'money' },
    ]
    const where: Record<string, unknown> = {
      ...(range ? { issueDate: range } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    }
    const invoices = await db().invoice.findMany({
      where, orderBy: { issueDate: 'desc' },
      take: FETCH_LIMIT,
      select: {
        number: true, issueDate: true, status: true, total: true, paidAmount: true,
        client: { select: { fullName: true } },
      },
    })
    assertWithinLimit(invoices.length, def)
    rows = invoices.map((i) => ({
      number: i.number, date: formatDate(i.issueDate), client: i.client.fullName,
      status: labelOf(INVOICE_STATUSES, i.status), total: i.total, paid: i.paidAmount,
      remaining: i.total - i.paidAmount,
    }))
    const sum = await db().invoice.aggregate({ where, _sum: { total: true, paidAmount: true } })
    totals = {
      total: sum._sum.total ?? 0,
      paid: sum._sum.paidAmount ?? 0,
      remaining: (sum._sum.total ?? 0) - (sum._sum.paidAmount ?? 0),
    }
  } else if (id === 'payments') {
    columns = [
      { key: 'number', label: 'Kuitansi' }, { key: 'date', label: 'Tanggal' },
      { key: 'invoice', label: 'Invoice' }, { key: 'client', label: 'Klien' },
      { key: 'method', label: 'Metode' }, { key: 'amount', label: 'Jumlah', type: 'money' },
    ]
    const where: Record<string, unknown> = range ? { paidAt: range } : {}
    const payments = await db().payment.findMany({
      where, orderBy: { paidAt: 'desc' },
      take: FETCH_LIMIT,
      select: {
        number: true, paidAt: true, method: true, amount: true,
        invoice: { select: { number: true, client: { select: { fullName: true } } } },
      },
    })
    assertWithinLimit(payments.length, def)
    rows = payments.map((p) => ({
      number: p.number, date: formatDate(p.paidAt), invoice: p.invoice.number,
      client: p.invoice.client.fullName, method: p.method, amount: p.amount,
    }))
    const sum = await db().payment.aggregate({ where, _sum: { amount: true } })
    totals = { amount: sum._sum.amount ?? 0 }
  } else if (id === 'receivables') {
    columns = [
      { key: 'number', label: 'Invoice' }, { key: 'client', label: 'Klien' },
      { key: 'due', label: 'Jatuh Tempo' }, { key: 'age', label: 'Umur (hari)', type: 'number' },
      { key: 'total', label: 'Total', type: 'money' }, { key: 'paid', label: 'Dibayar', type: 'money' },
      { key: 'remaining', label: 'Sisa', type: 'money' },
    ]
    const where: Record<string, unknown> = { status: { in: ['UNPAID', 'PARTIAL'] } }
    const invoices = await db().invoice.findMany({
      where, orderBy: { dueDate: 'asc' },
      take: FETCH_LIMIT,
      select: {
        number: true, dueDate: true, total: true, paidAmount: true,
        client: { select: { fullName: true } },
      },
    })
    assertWithinLimit(invoices.length, def)
    rows = invoices.map((i) => ({
      number: i.number, client: i.client.fullName,
      due: i.dueDate ? formatDate(i.dueDate) : '-',
      age: i.dueDate ? Math.max(0, Math.floor((Date.now() - i.dueDate.getTime()) / 86400000)) : 0,
      total: i.total, paid: i.paidAmount, remaining: i.total - i.paidAmount,
    }))
    const sum = await db().invoice.aggregate({
      where,
      _sum: { total: true, paidAmount: true },
    })
    totals = { remaining: (sum._sum.total ?? 0) - (sum._sum.paidAmount ?? 0) }
  } else if (id === 'staff-activity') {
    columns = [
      { key: 'user', label: 'Pengguna' }, { key: 'action', label: 'Aksi' },
      { key: 'count', label: 'Jumlah', type: 'number' }, { key: 'last', label: 'Terakhir' },
    ]
    const grouped = await db().auditLog.groupBy({
      by: ['username', 'action'],
      where: range ? { createdAt: range } : {},
      _count: { _all: true },
      _max: { createdAt: true },
    })
    rows = grouped
      .sort((a, b) => b._count._all - a._count._all)
      .map((g) => ({
        user: g.username, action: g.action, count: g._count._all,
        last: g._max.createdAt ? formatDate(g._max.createdAt) : '-',
      }))
  } else {
    columns = [
      { key: 'time', label: 'Waktu' }, { key: 'user', label: 'Pengguna' }, { key: 'action', label: 'Aksi' },
      { key: 'entity', label: 'Entitas' }, { key: 'entityId', label: 'ID' }, { key: 'hash', label: 'Hash' },
    ]
    const where: Record<string, unknown> = range ? { createdAt: range } : {}
    const logs = await db().auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: AUDIT_REPORT_ROWS,
      select: {
        createdAt: true, username: true, action: true,
        entity: true, entityId: true, hash: true,
      },
    })
    rows = logs.map((l) => ({
      time: formatDate(l.createdAt), user: l.username, action: l.action,
      entity: l.entity, entityId: l.entityId ? l.entityId.slice(0, 12) : '-',
      hash: l.hash.slice(0, 16),
    }))
    if (logs.length === AUDIT_REPORT_ROWS) rowTotal = await db().auditLog.count({ where })
  }

  return {
    id, title: def.title, subtitle: periodLabel(filters), orientation: def.orientation,
    signature: !!def.signature, columns, rows, totals, rowTotal,
    meta: {
      officeName: settings['office.name'] || 'Kantor Notaris & PPAT',
      notaryName: settings['office.notaryName'] || '',
      city: settings['office.city'] || '',
      address: settings['office.address'] || '',
      generatedAt: new Date().toISOString(),
      generatedBy,
      period: periodLabel(filters),
    },
  }
}
