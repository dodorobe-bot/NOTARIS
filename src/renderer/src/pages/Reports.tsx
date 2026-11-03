import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BarChart3, Download, FileSpreadsheet, FileText, Printer, RefreshCw } from 'lucide-react'
import { call, useQuery } from '@/api'
import type { SessionInfo } from '@/types'
import {
  Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader, SectionTitle, useToast,
} from '@/components/ui'
import { formatDateTime, formatNumber, formatRupiah } from '@shared/format'
import { truncationNotice } from '@shared/report-notice'

interface ReportColumn {
  key: string
  label: string
  type?: 'text' | 'money' | 'date' | 'number'
  width?: number
}

interface ReportResult {
  id: string
  title: string
  subtitle: string
  orientation: 'portrait' | 'landscape'
  signature: boolean
  columns: ReportColumn[]
  rows: Record<string, string | number | null>[]
  totals?: Record<string, number>
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

const PREVIEW_LIMIT = 200

export function Reports({ session }: { session: SessionInfo }) {
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const initialReport = useRef(params.get('report') ?? '').current
  const definitions = useQuery<any[]>('reports.definitions')
  const [selectedId, setSelectedId] = useState<string>(initialReport)
  const [year, setYear] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [result, setResult] = useState<ReportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null)
  const autoRef = useRef(false)

  useEffect(() => {
    if (!params.get('report')) return
    const next = new URLSearchParams(params)
    next.delete('report')
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!definitions.data?.length) return
    if (!selectedId) {
      setSelectedId(definitions.data[0].id)
      return
    }
    if (!initialReport || autoRef.current) return
    if (!definitions.data.some((d: any) => d.id === initialReport)) return
    autoRef.current = true
    void generate(initialReport)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definitions.data, selectedId])

  function payload(reportId = selectedId) {
    return {
      id: reportId,
      year: year ? Number(year) : undefined,
      from: from || undefined,
      to: to || undefined,
    }
  }

  async function generate(reportId = selectedId) {
    if (!reportId) return
    setLoading(true)
    setError(null)
    try {
      const res = await call<ReportResult>('reports.generate', payload(reportId))
      setResult(res)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function exportReport(kind: 'pdf' | 'excel') {
    if (!result) return
    setExporting(kind)
    try {
      const res = await call<{ fileName: string }>(
        kind === 'pdf' ? 'reports.exportPdf' : 'reports.exportExcel',
        payload(result.id),
      )
      toast.success(`${kind === 'pdf' ? 'PDF' : 'Excel'} disimpan: ${res.fileName}`)
      await call('app.openFolder', { target: 'exports' }).catch(() => undefined)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setExporting(null)
    }
  }

  function resetPeriod() {
    setYear('')
    setFrom('')
    setTo('')
  }

  function renderCell(value: string | number | null, col: ReportColumn) {
    if (value === null || value === undefined || value === '') return '—'
    if (col.type === 'money') return formatRupiah(Number(value))
    if (col.type === 'number') return formatNumber(Number(value))
    return String(value)
  }

  const definitionsList: any[] = definitions.data ?? []
  const active = definitionsList.find((d) => d.id === selectedId)
  const previewRows = result?.rows.slice(0, PREVIEW_LIMIT) ?? []
  const truncatedNotice = result ? truncationNotice(result.rows.length, result.rowTotal) : ''

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administrasi"
        title="Laporan"
        subtitle="Sebelas laporan operasional dan keuangan, siap diekspor ke PDF dan Excel."
        actions={
          <Button variant="secondary" onClick={() => void generate()} disabled={!selectedId} loading={loading}>
            <RefreshCw className="h-4 w-4" /> Tampilkan
          </Button>
        }
      />

      {definitions.error && <Alert tone="danger" title="Gagal memuat daftar laporan">{definitions.error}</Alert>}

      <div className="grid gap-4 xl:grid-cols-4">
        <Card className="overflow-hidden xl:col-span-1">
          <div className="border-b border-slate-200 px-4 py-3 dark:border-navy-800">
            <SectionTitle title="Jenis Laporan" subtitle="Pilih satu laporan untuk dipratinjau" />
          </div>
          <div className="max-h-[34rem] overflow-y-auto p-2">
            {definitionsList.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => { setSelectedId(d.id); setResult(null); setError(null) }}
                className={`mb-1 w-full rounded-lg px-3 py-2.5 text-left transition ${
                  selectedId === d.id
                    ? 'bg-navy-900 text-white dark:bg-navy-800'
                    : 'hover:bg-slate-50 dark:hover:bg-navy-900/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{d.title}</span>
                  {d.signature && <Badge tone={selectedId === d.id ? 'gold' : 'neutral'}>Ttd</Badge>}
                </div>
                <p className={`mt-0.5 text-[11px] leading-snug ${selectedId === d.id ? 'text-navy-200' : 'text-slate-500 dark:text-slate-400'}`}>{d.description}</p>
              </button>
            ))}
            {definitionsList.length === 0 && !definitions.loading && <EmptyState compact title="Daftar laporan kosong" />}
          </div>
        </Card>

        <div className="space-y-4 xl:col-span-3">
          <Card className="p-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Tahun" hint="Tahun mengutamakan filter periode.">
                <Input type="number" min={1900} max={2200} value={year} onChange={(e) => setYear(e.target.value)} placeholder="Semua" />
              </Field>
              <Field label="Dari Tanggal">
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label="Sampai Tanggal">
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
              <div className="flex items-end">
                <Button variant="secondary" className="w-full" onClick={resetPeriod}>Reset Periode</Button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button variant="gold" onClick={() => void generate()} loading={loading} disabled={!selectedId}>
                <BarChart3 className="h-4 w-4" /> Pratinjau {active?.title ?? 'Laporan'}
              </Button>
              <Button variant="secondary" onClick={() => void exportReport('pdf')} loading={exporting === 'pdf'} disabled={!result}>
                <FileText className="h-4 w-4" /> Ekspor PDF
              </Button>
              <Button variant="secondary" onClick={() => void exportReport('excel')} loading={exporting === 'excel'} disabled={!result}>
                <FileSpreadsheet className="h-4 w-4" /> Ekspor Excel
              </Button>
              <span className="ml-auto text-[11px] text-slate-500 dark:text-slate-400">
                <Printer className="mr-1 inline h-3.5 w-3.5" />PDF disimpan di folder ekspor aplikasi
              </span>
            </div>
          </Card>

          {error && <Alert tone="danger" title="Laporan gagal dibuat">{error}</Alert>}

          {!result && !loading && !error && (
            <Card>
              <EmptyState
                title="Belum ada pratinjau"
                description="Pilih jenis laporan dan periode, lalu tekan Pratinjau. Ekspor PDF/Excel tersedia setelah pratinjau dimuat."
                action={active ? <Button variant="gold" onClick={() => void generate()}><BarChart3 className="h-4 w-4" /> Tampilkan</Button> : undefined}
              />
            </Card>
          )}

          {loading && (
            <Card className="p-5">
              <div className="mb-3 h-5 w-56 animate-pulse rounded bg-slate-200 dark:bg-navy-800" />
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-8 animate-pulse rounded bg-slate-100 dark:bg-navy-800" />
                ))}
              </div>
            </Card>
          )}

          {result && !loading && (
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-navy-800">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold-600 dark:text-gold-400">{result.meta.officeName}</p>
                  <h2 className="mt-1 text-lg font-bold text-navy-900 dark:text-white">{result.title}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{result.subtitle} · {result.rows.length} baris · dicetak {formatDateTime(result.meta.generatedAt)} oleh {result.meta.generatedBy}</p>
                  {result.signature && <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Laporan ini memuat kolom tanda tangan pejabat berwenang.</p>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="neutral">{result.orientation === 'landscape' ? 'Lanskap' : 'Potret'}</Badge>
                  {result.signature && <Badge tone="gold">Tanda Tangan</Badge>}
                  {result.totals && <Badge tone="green">Berisi Total</Badge>}
                  {truncatedNotice && <Badge tone="amber">Dipotong</Badge>}
                </div>
              </div>

              {truncatedNotice && <div className="px-5 pt-4"><Alert tone="warn">{truncatedNotice}</Alert></div>}

              {result.rows.length === 0 ? (
                <EmptyState title="Tidak ada data" description="Tidak ada catatan yang cocok dengan periode/filter laporan ini." />
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="table-head">
                          {result.columns.map((c) => (
                            <th key={c.key} className={`whitespace-nowrap px-3 py-2.5 text-left ${c.type === 'money' || c.type === 'number' ? 'text-right' : ''}`}>
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, idx) => (
                          <tr key={idx} className="border-t border-slate-100 text-navy-800 dark:border-navy-800/80 dark:text-slate-200">
                            {result.columns.map((c) => (
                              <td key={c.key} className={`px-3 py-2 ${c.type === 'money' || c.type === 'number' ? 'whitespace-nowrap text-right tabular-nums' : ''}`}>
                                {renderCell(row[c.key], c)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                      {result.totals && (
                        <tfoot>
                          <tr className="border-t-2 border-navy-200 bg-slate-50 font-bold text-navy-900 dark:border-navy-700 dark:bg-navy-900/60 dark:text-white">
                            {result.columns.map((c, idx) => (
                              <td key={c.key} className={`px-3 py-2.5 ${c.type === 'money' || c.type === 'number' ? 'whitespace-nowrap text-right tabular-nums' : ''}`}>
                                {idx === 0 ? 'TOTAL' : result.totals && result.totals[c.key] !== undefined
                                  ? (c.type === 'money' ? formatRupiah(result.totals[c.key]) : formatNumber(result.totals[c.key]))
                                  : ''}
                              </td>
                            ))}
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                  {result.rows.length > PREVIEW_LIMIT && (
                    <div className="border-t border-slate-200 px-5 py-2 text-[11px] text-slate-500 dark:border-navy-800 dark:text-slate-400">
                      Pratinjau dibatasi {PREVIEW_LIMIT} baris dari {result.rows.length}. Gunakan Ekspor PDF/Excel untuk data lengkap.
                    </div>
                  )}
                </>
              )}
            </Card>
          )}

          {session.permissions.includes('reports.view') && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              <Download className="mr-1 inline h-3.5 w-3.5" />Setiap ekspor tercatat di audit log beserta jenis laporan dan jumlah baris.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
