import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, ScrollText } from 'lucide-react'
import { useDebounced, useQuery } from '@/api'
import {
  Alert, Badge, Button, Card, DataTable, EmptyState, IconButton, Modal, Pagination, SearchInput, Select,
  type BadgeTone,
} from '@/components/ui'
import {
  GOVERNMENT_AGENCIES, GOVERNMENT_SYNC_DIRECTIONS, GOVERNMENT_SYNC_STATUSES,
  governmentAgencyLabel, governmentSyncStatusLabel,
} from '@shared/government'
import { formatDateTime } from '@shared/format'
import { GovStatusBadge } from './parts'

const STATUS_TONE: Record<string, BadgeTone> = { PENDING: 'amber', SUCCESS: 'green', FAILED: 'red' }

export function SyncLogsTab() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [agency, setAgency] = useState('')
  const [status, setStatus] = useState('')
  const [detail, setDetail] = useState<any | null>(null)
  const debounced = useDebounced(search)

  const logs = useQuery<any>('government.syncLogs.list', {
    page, pageSize: 20, agency: agency || undefined, status: status || undefined, search: debounced || undefined,
  })

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Cari pesan log atau nomor pengajuan…" className="w-full sm:w-80" />
        <Select value={agency} onChange={(e) => { setAgency(e.target.value); setPage(1) }} className="w-full sm:w-40">
          <option value="">Semua instansi</option>
          {GOVERNMENT_AGENCIES.map((a) => <option key={a.value} value={a.value}>{governmentAgencyLabel(a.value)}</option>)}
        </Select>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="w-full sm:w-56">
          <option value="">Semua hasil</option>
          {GOVERNMENT_SYNC_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
        <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">{logs.data?.total ?? 0} catatan gateway</span>
      </Card>

      {logs.error && <Alert tone="danger" title="Gagal memuat riwayat sinkronisasi">{logs.error}</Alert>}

      <Card className="overflow-hidden">
        <DataTable
          rows={logs.data?.items ?? []}
          loading={logs.loading}
          onRowClick={(r) => r.submission && navigate(`/integrasi/${r.submission.id}`)}
          columns={[
            { key: 'createdAt', header: 'Waktu', width: 160, render: (r) => <span className="text-xs">{formatDateTime(r.createdAt)}</span> },
            { key: 'agency', header: 'Instansi', render: (r) => governmentAgencyLabel(r.agency) },
            {
              key: 'direction', header: 'Aktivitas',
              render: (r) => (
                <div className="min-w-0">
                  <Badge tone={r.direction === 'KREDENSIAL' ? 'purple' : 'neutral'}>
                    {GOVERNMENT_SYNC_DIRECTIONS.find((d) => d.value === r.direction)?.label ?? r.direction}
                  </Badge>
                  <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">{r.mode === 'SEMI_OTOMATIS' ? 'semi-otomatis' : r.mode}</p>
                </div>
              ),
            },
            {
              key: 'message', header: 'Catatan',
              render: (r) => (
                <div className="min-w-0">
                  <p className="truncate text-xs">{r.message}</p>
                  {r.createdBy && <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">oleh {r.createdBy.fullName}</p>}
                </div>
              ),
            },
            { key: 'status', header: 'Hasil', render: (r) => <Badge tone={STATUS_TONE[r.status] ?? 'gray'}>{governmentSyncStatusLabel(r.status)}</Badge> },
            {
              key: 'submission', header: 'Pengajuan',
              render: (r) => r.submission ? (
                <div className="min-w-0">
                  <p className="font-mono text-[11px] text-navy-900 dark:text-slate-200">{r.submission.number}</p>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{r.submission.title}</p>
                </div>
              ) : <span className="text-xs text-slate-400">Tingkat gateway</span>,
            },
            { key: 'internalStatus', header: 'Status internal', render: (r) => <GovStatusBadge status={r.submission?.internalStatus} /> },
            {
              key: 'actions', header: '', align: 'right', width: 56,
              render: (r) => (
                <div className="flex justify-end">
                  <IconButton label="Lihat detail catatan" onClick={(e) => { e.stopPropagation(); setDetail(r) }}><Eye className="h-4 w-4" /></IconButton>
                </div>
              ),
            },
          ]}
          empty={<EmptyState compact title="Belum ada catatan gateway" description="Setiap pembukaan portal, pencatatan nomor resmi, dan perubahan status meninggalkan satu baris log di sini." />}
        />
        {logs.data && (
          <Pagination page={logs.data.page} pageSize={logs.data.pageSize} total={logs.data.total} totalPages={logs.data.totalPages} onPage={setPage} />
        )}
      </Card>

      <Card className="p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-900 text-gold-400">
            <ScrollText className="h-4 w-4" />
          </span>
          <div className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            <p className="font-semibold text-navy-900 dark:text-slate-100">Isi log tidak dapat diubah atau dihapus</p>
            <p className="mt-1">
              Baris log gateway bersifat append-only melalui pemicu di basis data. Catatan berstatus{' '}
              <Badge tone="amber">{governmentSyncStatusLabel('PENDING')}</Badge> berarti langkah berikutnya masih menunggu
              tindakan manusia di portal resmi; status <Badge tone="green">{governmentSyncStatusLabel('SUCCESS')}</Badge>{' '}
              hanya dipakai untuk langkah yang benar-benar sudah selesai dicatat di aplikasi ini. Log tidak pernah
              membuktikan hasil dari instansi — bukti hasil tetap berupa nomor resmi dan berkas yang diunggah petugas.
            </p>
          </div>
        </div>
      </Card>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title="Detail catatan gateway"
        subtitle={detail ? formatDateTime(detail.createdAt) : undefined}
        size="lg"
        footer={<Button variant="secondary" onClick={() => setDetail(null)}>Tutup</Button>}
      >
        {detail && (
          <div className="space-y-3 text-xs">
            <div className="flex flex-wrap gap-2">
              <Badge tone="neutral">{governmentAgencyLabel(detail.agency)}</Badge>
              <Badge tone={STATUS_TONE[detail.status] ?? 'gray'}>{governmentSyncStatusLabel(detail.status)}</Badge>
              <Badge tone="gray">{detail.mode === 'SEMI_OTOMATIS' ? 'semi-otomatis' : detail.mode}</Badge>
            </div>
            <p className="rounded-lg bg-slate-50 p-3 leading-relaxed text-slate-700 dark:bg-navy-900 dark:text-slate-200">{detail.message}</p>
            {detail.detailJson && (
              <div>
                <p className="mb-1 font-semibold text-navy-900 dark:text-slate-100">Data pendukung catatan</p>
                <pre className="max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white p-3 font-mono text-[11px] leading-relaxed dark:border-navy-800 dark:bg-navy-950">
                  {formatDetail(detail.detailJson)}
                </pre>
              </div>
            )}
            {detail.submission && (
              <Button variant="ghost" onClick={() => { setDetail(null); navigate(`/integrasi/${detail.submission.id}`) }}>
                Buka pengajuan {detail.submission.number}
              </Button>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

function formatDetail(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}
