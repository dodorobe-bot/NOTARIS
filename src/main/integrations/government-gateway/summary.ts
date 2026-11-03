import path from 'node:path'
import { dirs } from '../../lib/paths'
import { escapeHtml, exportTimestamp, htmlToPdf, safeExportName } from '../../lib/pdf'
import { getSettings } from '../../lib/settings'
import { governmentAgencyLabel, governmentStatusLabel } from '../../../shared/government'

export interface SummaryFileRow {
  fileName: string
  kindLabel: string
  checksum: string
}

export interface SummaryInput {
  id: string
  number: string
  agency: string
  serviceName: string
  title: string
  description?: string | null
  internalStatus: string
  officialStatus?: string | null
  externalRef?: string | null
  clientName?: string | null
  transactionCode?: string | null
  createdByName?: string | null
  createdAt: string
  data: Record<string, string>
  files: SummaryFileRow[]
}

const DISCLAIMER =
  'Lembar ini adalah dokumen internal NOTARIS PRO untuk persiapan pengajuan manual pada portal resmi. ' +
  'Bukan formulir, tanda terima, atau bukti pengajuan dari instansi pemerintah.'

export function buildSummaryHtml(input: SummaryInput, office: Record<string, string>): string {
  const rows = Object.entries(input.data)
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join('')
  const fileRows = input.files.length
    ? input.files
        .map(
          (f) =>
            `<tr><td>${escapeHtml(f.kindLabel)}</td><td>${escapeHtml(f.fileName)}</td><td class="mono">${escapeHtml(
              f.checksum.slice(0, 16),
            )}…</td></tr>`,
        )
        .join('')
    : '<tr><td colspan="3" class="empty">Belum ada berkas dilampirkan.</td></tr>'

  return `<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8"><title>Lembar Persiapan ${escapeHtml(input.number)}</title>
<style>
  body { font-family: "Segoe UI", Arial, sans-serif; color: #0F172A; margin: 0; }
  h1 { font-size: 17px; margin: 0 0 2px; letter-spacing: .04em; }
  .sub { font-size: 11px; color: #475569; margin-bottom: 14px; }
  .head { border-bottom: 2px solid #C8A34A; padding-bottom: 8px; margin-bottom: 12px; }
  .office { font-size: 11px; color: #334155; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; margin-bottom: 14px; }
  th, td { border: 1px solid #CBD5E1; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #F1F5F9; width: 32%; font-weight: 600; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .1em; color: #1D4ED8; margin: 16px 0 6px; }
  .mono { font-family: Consolas, monospace; font-size: 10.5px; }
  .empty { color: #64748B; font-style: italic; }
  .note { border: 1px dashed #C8A34A; background: #FFFBEB; padding: 8px 10px; font-size: 10.5px; color: #78350F; }
</style></head><body>
<div class="head">
  <h1>LEMBAR PERSIAPAN PENGAJUAN PEMERINTAH</h1>
  <div class="sub">${escapeHtml(input.number)} · ${escapeHtml(governmentAgencyLabel(input.agency))} · ${escapeHtml(input.serviceName)}</div>
  <div class="office">
    <b>${escapeHtml(office['office.name'] || 'Kantor belum diisi')}</b><br>
    ${escapeHtml(office['office.address'] || '')} ${office['office.city'] ? `— ${escapeHtml(office['office.city'])}` : ''}<br>
    ${office['office.phone'] ? `Telp ${escapeHtml(office['office.phone'])} · ` : ''}${office['office.email'] ? `Email ${escapeHtml(office['office.email'])}` : ''}
  </div>
</div>
<h2>Data Pengajuan</h2>
<table>
  <tr><th>Perihal</th><td>${escapeHtml(input.title)}</td></tr>
  ${input.description ? `<tr><th>Uraian</th><td>${escapeHtml(input.description)}</td></tr>` : ''}
  ${input.clientName ? `<tr><th>Klien</th><td>${escapeHtml(input.clientName)}</td></tr>` : ''}
  ${input.transactionCode ? `<tr><th>Transaksi</th><td>${escapeHtml(input.transactionCode)}</td></tr>` : ''}
  <tr><th>Status internal</th><td>${escapeHtml(governmentStatusLabel(input.internalStatus))}</td></tr>
  <tr><th>Status resmi</th><td class="${input.officialStatus ? '' : 'empty'}">${escapeHtml(input.officialStatus || 'Belum dicatat')}</td></tr>
  <tr><th>Nomor resmi</th><td class="${input.externalRef ? '' : 'empty'}">${escapeHtml(input.externalRef || 'Belum diterima')}</td></tr>
  ${rows || '<tr><td colspan="2" class="empty">Belum ada data isian.</td></tr>'}
</table>
<h2>Berkas Yang Dicatat</h2>
<table>
  <tr><th style="width:26%">Jenis</th><th>Nama berkas</th><th style="width:22%">Checksum SHA-256</th></tr>
  ${fileRows}
</table>
<p class="sub">Dibuat ${escapeHtml(new Date().toISOString())} oleh ${escapeHtml(input.createdByName || '—')}.</p>
<div class="note">${escapeHtml(DISCLAIMER)}</div>
</body></html>`
}

/** Menulis PDF lembar persiapan ke folder tmp; pemanggil menyimpan salinan resmi. */
export async function renderSummaryPdf(input: SummaryInput): Promise<string> {
  const office = await getSettings()
  const html = buildSummaryHtml(input, office)
  const outPath = path.join(
    dirs.tmp(),
    `gov-summary-${safeExportName(input.number)}-${exportTimestamp()}-${Math.random().toString(36).slice(2)}.pdf`,
  )
  await htmlToPdf(html, outPath)
  return outPath
}

export { DISCLAIMER as SUMMARY_DISCLAIMER }
