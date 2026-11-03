import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'
import { dirs } from './paths'
import { escapeHtml, htmlToPdf, exportTimestamp, safeExportName, logExport } from './pdf'
import { formatRupiah, formatDateLong, formatDateTime } from '../../shared/format'
import { truncationNotice } from '../../shared/report-notice'
import type { ReportResult } from './reports'

function cell(value: string | number | null | undefined, type?: string): string {
  if (value === null || value === undefined || value === '') return '-'
  if (type === 'money') return formatRupiah(Number(value))
  return escapeHtml(value)
}

export function reportHtml(result: ReportResult): string {
  const notice = truncationNotice(result.rows.length, result.rowTotal)
  const rows = result.rows
    .map(
      (r) =>
        `<tr>${result.columns
          .map((c) => `<td class="${c.type === 'money' || c.type === 'number' ? 'num' : ''}">${cell(r[c.key], c.type)}</td>`)
          .join('')}</tr>`,
    )
    .join('')
  const totalRow = result.totals
    ? `<tr class="total">${result.columns
        .map((c, idx) => {
          if (idx === 0) return '<td>TOTAL</td>'
          const v = result.totals?.[c.key]
          return `<td class="${c.type === 'money' || c.type === 'number' ? 'num' : ''}">${v === undefined ? '' : c.type === 'money' ? formatRupiah(v) : v}</td>`
        })
        .join('')}</tr>`
    : ''
  const signature = result.signature
    ? `<div class="sign">
        <div>${escapeHtml(result.meta.city)}, ${formatDateLong(result.meta.generatedAt)}</div>
        <div class="role">Notaris/PPAT</div>
        <div class="space"></div>
        <div class="name">${escapeHtml(result.meta.notaryName || '................................')}</div>
      </div>`
    : ''
  return `<!doctype html><html lang="id"><head><meta charset="utf-8">
<title>${escapeHtml(result.title)}</title>
<style>
  @page { size: A4 ${result.orientation}; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color:#111827; font-size:10px; margin:0; }
  .head { border-bottom: 2px solid #C8A34A; padding-bottom:10px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:flex-end; }
  .brand { font-size:17px; font-weight:800; letter-spacing:.08em; color:#0B1D3A; }
  .brand small { display:block; font-size:8px; letter-spacing:.22em; color:#A9863A; font-weight:600; margin-top:2px; }
  .office { text-align:right; font-size:9px; color:#374151; line-height:1.5; max-width:48%; }
  .office b { color:#0B1D3A; font-size:11px; }
  h1 { font-size:14px; margin:0 0 2px; color:#0B1D3A; }
  .sub { color:#6b7280; margin-bottom:12px; font-size:9px; }
  table { width:100%; border-collapse:collapse; }
  th { background:#0B1D3A; color:#fff; text-align:left; padding:5px 6px; font-size:9px; font-weight:600; }
  td { border-bottom:1px solid #e5e7eb; padding:4px 6px; vertical-align:top; }
  tr:nth-child(even) td { background:#F7F8FB; }
  .num { text-align:right; white-space:nowrap; }
  tr.total td { font-weight:700; background:#FBF6E8 !important; border-top:1.5px solid #C8A34A; }
  .sign { margin-top:30px; width:220px; margin-left:auto; text-align:center; font-size:10px; line-height:1.6; }
  .sign .role { font-weight:600; color:#0B1D3A; }
  .sign .space { height:56px; }
  .sign .name { font-weight:700; text-decoration:underline; }
  .foot { margin-top:18px; font-size:8px; color:#9ca3af; }
  .empty { padding:24px; text-align:center; color:#6b7280; }
  .warn { border:1.5px solid #B45309; background:#FEF3C7; color:#78350F; padding:7px 10px; font-size:10px; font-weight:600; margin-bottom:10px; }
</style></head><body>
  <div class="head">
    <div class="brand">NOTARIS PRO<small>INTEGRATED NOTARY &amp; PPAT MANAGEMENT SYSTEM</small></div>
    <div class="office"><b>${escapeHtml(result.meta.officeName)}</b><br>${escapeHtml(result.meta.address)}<br>${escapeHtml(result.meta.city)}</div>
  </div>
  <h1>${escapeHtml(result.title)}</h1>
  <div class="sub">Periode: ${escapeHtml(result.subtitle)} &middot; Dicetak: ${formatDateTime(result.meta.generatedAt)} &middot; Oleh: ${escapeHtml(result.meta.generatedBy)}</div>
  ${notice ? `<div class="warn">${escapeHtml(notice)}</div>` : ''}
  ${rows.length === 0
    ? '<div class="empty">Tidak ada data pada periode ini.</div>'
    : `<table><thead><tr>${result.columns.map((c) => `<th style="width:${c.width ?? 'auto'}">${escapeHtml(c.label)}</th>`).join('')}</tr></thead><tbody>${rows}${totalRow}</tbody></table>`}
  ${signature}
  <div class="foot">Dokumen ini dihasilkan otomatis oleh NOTARIS PRO. Data bersumber dari basis data lokal kantor.</div>
</body></html>`
}

export async function exportReportPdf(result: ReportResult): Promise<{ filePath: string; fileName: string }> {
  const fileName = `${safeExportName(result.id)}-${exportTimestamp()}.pdf`
  const filePath = path.join(dirs.exports(), 'pdf', fileName)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  await htmlToPdf(reportHtml(result), filePath, { landscape: result.orientation === 'landscape' })
  logExport(filePath)
  return { filePath, fileName }
}

export function exportReportExcel(result: ReportResult): { filePath: string; fileName: string } {
  const notice = truncationNotice(result.rows.length, result.rowTotal)
  const header = result.columns.map((c) => c.label)
  const data = result.rows.map((r) =>
    result.columns.map((c) => {
      const v = r[c.key]
      return v === null || v === undefined ? '' : v
    }),
  )
  const aoa: (string | number)[][] = [
    [result.title],
    [`Periode: ${result.subtitle}`, '', `Dicetak: ${formatDateTime(result.meta.generatedAt)}`],
    ...(notice ? [[notice]] : []),
    [],
    header,
    ...data,
  ]
  if (result.totals) {
    const totalsRow = result.columns.map((c, idx) => {
      if (idx === 0) return 'TOTAL'
      const v = result.totals?.[c.key]
      return v === undefined ? '' : v
    })
    aoa.push(totalsRow as (string | number)[])
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = result.columns.map((c) => ({ wch: c.width ?? (c.type === 'money' ? 16 : 22) }))
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(1, header.length - 1) } }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, result.title.slice(0, 30) || 'Laporan')
  const fileName = `${safeExportName(result.id)}-${exportTimestamp()}.xlsx`
  const filePath = path.join(dirs.exports(), 'excel', fileName)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  XLSX.writeFile(wb, filePath)
  logExport(filePath)
  return { filePath, fileName }
}

export interface InvoicePdfInput {
  number: string
  issueDate: Date
  dueDate: Date | null
  status: string
  client: { fullName: string; code: string; address?: string | null; phone?: string | null }
  items: { description: string; quantity: number; unitPrice: number; amount: number; kind: string }[]
  subtotal: number
  discount: number
  taxPercent: number
  taxAmount: number
  total: number
  paidAmount: number
  notes?: string | null
  office: Record<string, string>
}

const INVOICE_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'DRAFT', UNPAID: 'BELUM DIBAYAR', PARTIAL: 'DIBAYAR SEBAGIAN', PAID: 'LUNAS', VOID: 'DIBATALKAN',
}

export function invoiceHtml(inv: InvoicePdfInput): string {
  const rows = inv.items
    .map(
      (it, i) =>
        `<tr><td>${i + 1}</td><td>${escapeHtml(it.description)}</td><td class="num">${it.quantity}</td><td class="num">${formatRupiah(it.unitPrice)}</td><td class="num">${formatRupiah(it.amount)}</td></tr>`,
    )
    .join('')
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Invoice ${escapeHtml(inv.number)}</title>
<style>
  body { font-family:'Segoe UI',Arial,sans-serif; color:#111827; font-size:11px; margin:0; }
  .top { display:flex; justify-content:space-between; border-bottom:3px solid #C8A34A; padding-bottom:14px; }
  .brand { font-size:22px; font-weight:800; letter-spacing:.1em; color:#0B1D3A; }
  .brand small { display:block; font-size:8px; letter-spacing:.25em; color:#A9863A; }
  .office { text-align:right; color:#374151; line-height:1.6; }
  h1 { font-size:26px; letter-spacing:.18em; color:#0B1D3A; margin:26px 0 2px; }
  .meta { display:flex; justify-content:space-between; margin:18px 0 24px; gap:24px; }
  .box { background:#F4F6FA; border:1px solid #e5e7eb; border-radius:6px; padding:12px 14px; width:50%; line-height:1.7; }
  .box b { color:#0B1D3A; }
  table { width:100%; border-collapse:collapse; }
  th { background:#0B1D3A; color:#fff; text-align:left; padding:8px 10px; font-size:10px; }
  td { border-bottom:1px solid #e5e7eb; padding:8px 10px; }
  .num { text-align:right; white-space:nowrap; }
  .totals { width:300px; margin-left:auto; margin-top:12px; }
  .totals td { border:none; padding:5px 10px; }
  .totals .grand td { border-top:2px solid #0B1D3A; font-weight:700; font-size:13px; color:#0B1D3A; }
  .status { display:inline-block; padding:4px 10px; border-radius:999px; background:#FBF6E8; color:#85682C; font-weight:700; font-size:9px; letter-spacing:.08em; border:1px solid #E2CB8C; }
  .sign { margin-top:44px; text-align:right; line-height:1.8; }
  .sign .space { height:60px; }
  .foot { margin-top:30px; font-size:8px; color:#9ca3af; border-top:1px solid #e5e7eb; padding-top:8px; }
</style></head><body>
  <div class="top">
    <div class="brand">NOTARIS PRO<small>NOTARY &amp; PPAT OFFICE</small></div>
    <div class="office"><b>${escapeHtml(inv.office['office.name'])}</b><br>${escapeHtml(inv.office['office.address'])}<br>${escapeHtml(inv.office['office.city'])}<br>${escapeHtml(inv.office['office.phone'])}</div>
  </div>
  <h1>INVOICE</h1>
  <div style="display:flex;justify-content:space-between;align-items:center;">
    <div style="color:#6b7280;">${escapeHtml(inv.number)}</div>
    <div class="status">${INVOICE_STATUS_LABEL[inv.status] ?? inv.status}</div>
  </div>
  <div class="meta">
    <div class="box"><b>Ditagihkan kepada</b><br>${escapeHtml(inv.client.fullName)}<br>${escapeHtml(inv.client.code)}<br>${escapeHtml(inv.client.address ?? '')}<br>${escapeHtml(inv.client.phone ?? '')}</div>
    <div class="box"><b>Detail Invoice</b><br>Tanggal: ${formatDateLong(inv.issueDate)}<br>Jatuh tempo: ${inv.dueDate ? formatDateLong(inv.dueDate) : '-'}<br>Total: ${formatRupiah(inv.total)}<br>Dibayar: ${formatRupiah(inv.paidAmount)}</div>
  </div>
  <table><thead><tr><th style="width:30px">No</th><th>Uraian</th><th class="num" style="width:70px">Qty</th><th class="num" style="width:120px">Harga</th><th class="num" style="width:130px">Jumlah</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <table class="totals">
    <tr><td>Subtotal</td><td class="num">${formatRupiah(inv.subtotal)}</td></tr>
    <tr><td>Diskon</td><td class="num">- ${formatRupiah(inv.discount)}</td></tr>
    <tr><td>Pajak (${inv.taxPercent}%)</td><td class="num">${formatRupiah(inv.taxAmount)}</td></tr>
    <tr class="grand"><td>Total</td><td class="num">${formatRupiah(inv.total)}</td></tr>
    <tr><td>Sisa tagihan</td><td class="num">${formatRupiah(inv.total - inv.paidAmount)}</td></tr>
  </table>
  ${inv.notes ? `<p style="margin-top:20px;color:#374151;"><b>Catatan:</b> ${escapeHtml(inv.notes)}</p>` : ''}
  <div class="sign">${escapeHtml(inv.office['office.city'] ?? '')}, ${formatDateLong(new Date())}<br>Notaris/PPAT<div class="space"></div><b>${escapeHtml(inv.office['office.notaryName'] ?? '')}</b></div>
  <div class="foot">Invoice ini dihasilkan oleh NOTARIS PRO. Pembayaran sah apabila disertai kuitansi resmi kantor.</div>
</body></html>`
}

export async function exportInvoicePdf(inv: InvoicePdfInput): Promise<{ filePath: string; fileName: string }> {
  const fileName = `invoice-${safeExportName(inv.number)}-${exportTimestamp()}.pdf`
  const filePath = path.join(dirs.exports(), 'pdf', fileName)
  await htmlToPdf(invoiceHtml(inv), filePath)
  logExport(filePath)
  return { filePath, fileName }
}
