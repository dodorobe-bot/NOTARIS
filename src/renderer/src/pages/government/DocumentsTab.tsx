import { useState } from 'react'
import { DownloadCloud, Eye, FolderOpen, ShieldCheck } from 'lucide-react'
import { call, useDebounced, useQuery } from '@/api'
import { useNavigate } from 'react-router-dom'
import {
  Alert, Badge, Button, Card, DataTable, EmptyState, IconButton, Modal, Pagination, SearchInput, Select, useToast,
} from '@/components/ui'
import { GOVERNMENT_AGENCIES, GOVERNMENT_FILE_KINDS, governmentStatusLabel } from '@shared/government'
import { formatBytes, formatDateTime } from '@shared/format'
import { GovStatusBadge } from './parts'

export function DocumentsTab() {
  const toast = useToast()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [agency, setAgency] = useState('')
  const [kind, setKind] = useState('')
  const [preview, setPreview] = useState<any | null>(null)
  const debounced = useDebounced(search)

  const files = useQuery<any>('government.files.list', {
    page, pageSize: 20, agency: agency || undefined, kind: kind || undefined, search: debounced || undefined,
  })

  async function openPreview(id: string) {
    try {
      const result = await call<any>('government.files.preview', { id })
      setPreview({ ...result, id })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function download(id: string) {
    try {
      const res = await call<any>('government.files.download', { id })
      if (!res.canceled) toast.success(`Berkas disalin ke ${res.filePath}`)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function openExternal(id: string) {
    try {
      await call('government.files.openExternal', { id })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Cari nama berkas, catatan, atau nomor pengajuan…" className="w-full sm:w-80" />
        <Select value={agency} onChange={(e) => { setAgency(e.target.value); setPage(1) }} className="w-full sm:w-40">
          <option value="">Semua instansi</option>
          {GOVERNMENT_AGENCIES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </Select>
        <Select value={kind} onChange={(e) => { setKind(e.target.value); setPage(1) }} className="w-full sm:w-48">
          <option value="">Semua jenis berkas</option>
          {GOVERNMENT_FILE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </Select>
        <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">{files.data?.total ?? 0} berkas pemerintah</span>
      </Card>

      {files.error && <Alert tone="danger" title="Gagal memuat berkas">{files.error}</Alert>}

      <Card className="overflow-hidden">
        <DataTable
          rows={files.data?.items ?? []}
          loading={files.loading}
          onRowClick={(r) => navigate(`/integrasi/${r.submissionId}`)}
          columns={[
            {
              key: 'fileName', header: 'Berkas',
              render: (r) => (
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.fileName}</p>
                  <p className="truncate font-mono text-[11px] text-slate-500">{r.checksum.slice(0, 20)}…</p>
                </div>
              ),
            },
            { key: 'kind', header: 'Jenis', render: (r) => <Badge tone={r.kind === 'HASIL_LAYANAN' ? 'green' : r.kind === 'BUKTI_PENGAJUAN' ? 'blue' : 'neutral'}>{r.kindLabel}</Badge> },
            {
              key: 'submission', header: 'Pengajuan',
              render: (r) => (
                <div className="min-w-0">
                  <p className="font-mono text-[11px] text-navy-900 dark:text-slate-200">{r.submission?.number}</p>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{r.submission?.title}</p>
                </div>
              ),
            },
            { key: 'agency', header: 'Instansi', render: (r) => r.submission?.agency ?? '—' },
            { key: 'internalStatus', header: 'Status', render: (r) => <GovStatusBadge status={r.submission?.internalStatus} /> },
            { key: 'sizeBytes', header: 'Ukuran', align: 'right', render: (r) => formatBytes(r.sizeBytes) },
            { key: 'createdAt', header: 'Dicatat', render: (r) => <div><p className="text-xs">{formatDateTime(r.createdAt)}</p><p className="text-[11px] text-slate-500">{r.uploadedBy?.fullName ?? '—'}</p></div> },
            {
              key: 'actions', header: '', align: 'right', width: 120,
              render: (r) => (
                <div className="flex justify-end gap-0.5">
                  <IconButton label="Pratinjau" onClick={(e) => { e.stopPropagation(); void openPreview(r.id) }}><Eye className="h-4 w-4" /></IconButton>
                  <IconButton label="Buka dengan aplikasi" onClick={(e) => { e.stopPropagation(); void openExternal(r.id) }}><FolderOpen className="h-4 w-4" /></IconButton>
                  <IconButton label="Unduh salinan" onClick={(e) => { e.stopPropagation(); void download(r.id) }}><DownloadCloud className="h-4 w-4" /></IconButton>
                </div>
              ),
            },
          ]}
          empty={<EmptyState compact title="Belum ada berkas pemerintah" description="Berkas muncul setelah dilampirkan pada kartu pengajuan." />}
        />
        {files.data && (
          <Pagination page={files.data.page} pageSize={files.data.pageSize} total={files.data.total} totalPages={files.data.totalPages} onPage={setPage} />
        )}
      </Card>

      <Card className="p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-900 text-gold-400">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            <p className="font-semibold text-navy-900 dark:text-slate-100">Berkas tidak dapat dihapus diam-diam</p>
            <p className="mt-1">
              Setiap berkas disimpan dengan checksum SHA-256 dan tercatat pada log gateway. Mengeluarkan berkas hanya
              menandainya dari daftar; berkas fisik di penyimpanan dan jejak audit tetap ada. Setelah pengajuan berstatus{' '}
              {governmentStatusLabel('SELESAI')}, {governmentStatusLabel('DITOLAK')} atau{' '}
              {governmentStatusLabel('DIBATALKAN')}, daftar berkas ikut terkunci dan tidak dapat diubah lagi.
            </p>
          </div>
        </div>
      </Card>

      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.fileName ?? 'Pratinjau berkas'}
        subtitle={preview ? [preview.mimeType, preview.sourceBytes ? formatBytes(preview.sourceBytes) : null, preview.thumbnail ? `thumbnail ${preview.width}×${preview.height}` : null].filter(Boolean).join(' · ') : undefined}
        size="lg"
        footer={
          <>
            {preview?.id && <Button variant="secondary" onClick={() => void openExternal(preview.id)}><FolderOpen className="h-4 w-4" /> Buka Aplikasi</Button>}
            {preview?.id && <Button variant="secondary" onClick={() => void download(preview.id)}><DownloadCloud className="h-4 w-4" /> Unduh</Button>}
            <Button onClick={() => setPreview(null)}>Tutup</Button>
          </>
        }
      >
        {!preview ? null : preview.kind === 'image' && preview.dataUrl ? (
          <div className="flex justify-center rounded-lg bg-slate-100 p-3 dark:bg-navy-900">
            <img src={preview.dataUrl} alt={preview.fileName} className="max-h-[65vh] object-contain" />
          </div>
        ) : preview.kind === 'pdf' && preview.dataUrl ? (
          <iframe title={preview.fileName} src={preview.dataUrl} className="h-[70vh] w-full rounded-lg border border-slate-200 dark:border-navy-800" />
        ) : (
          <Alert tone={preview.kind === 'missing' ? 'danger' : 'warn'} title={preview.kind === 'missing' ? 'Berkas tidak ditemukan' : 'Pratinjau tidak tersedia'}>
            {preview.reason ?? 'Gunakan Buka Aplikasi atau Unduh untuk membuka berkas ini.'}
          </Alert>
        )}
      </Modal>
    </div>
  )
}
