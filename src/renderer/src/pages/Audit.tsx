import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, Hash, RefreshCw, ShieldCheck, ShieldAlert } from 'lucide-react'
import { call, useDebounced, useQuery } from '@/api'
import {
  Alert, Badge, Button, Card, DataTable, Input, Modal, PageHeader, Pagination,
  SearchInput, SectionTitle, Select, useToast,
} from '@/components/ui'
import { formatDateTime } from '@shared/format'

export function Audit() {
  const toast = useToast()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [action, setAction] = useState('')
  const [entity, setEntity] = useState('')
  const [username, setUsername] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const debounced = useDebounced(search)
  const query = useQuery<any>('audit.list', {
    page, pageSize: 25, search: debounced, action: action || undefined,
    entity: entity || undefined, username: username || undefined,
    from: from || undefined, to: to || undefined,
  })

  const [detail, setDetail] = useState<any | null>(null)
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<any | null>(null)
  const [verifyError, setVerifyError] = useState<string | null>(null)

  const filtersActive = !!(debounced || action || entity || username || from || to)
  const rows = useMemo(() => query.data?.items ?? [], [query.data])

  function resetFilters() {
    setSearch(''); setAction(''); setEntity(''); setUsername(''); setFrom(''); setTo(''); setPage(1)
  }

  async function verify() {
    setVerifying(true)
    setVerifyError(null)
    setVerifyResult(null)
    try {
      const res = await call<any>('audit.verify')
      setVerifyResult(res)
      if (res.ok) toast.success(res.detail)
      else toast.error(res.detail)
    } catch (err) {
      setVerifyError((err as Error).message)
    } finally {
      setVerifying(false)
    }
  }

  function pretty(v: unknown): string {
    if (v === null || v === undefined) return '—'
    try {
      return typeof v === 'string' ? JSON.stringify(JSON.parse(v), null, 2) : JSON.stringify(v, null, 2)
    } catch {
      return String(v)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sistem"
        title="Audit Log"
        subtitle="Jejak aktivitas pengguna dengan rantai hash SHA-256 yang dapat diverifikasi."
        actions={
          <>
            <Button variant="secondary" onClick={() => { setVerifyOpen(true); setVerifyResult(null); setVerifyError(null) }}>
              <ShieldCheck className="h-4 w-4" /> Verifikasi Rantai
            </Button>
            <Link to="/laporan?report=audit-log" className="btn-secondary"><BarChart3 className="h-4 w-4" /> Laporan Audit</Link>
          </>
        }
      />

      <Alert tone="info" title="Catatan tidak dapat diubah">
        <span className="text-xs">Audit log hanya dapat ditambah. Setiap entri menyimpan hash entri sebelumnya sehingga perubahan atau penghapusan diam-diam akan terdeteksi oleh verifikasi rantai.</span>
      </Alert>

      <Card className="overflow-hidden">
        <div className="grid gap-2 border-b border-slate-200 p-4 dark:border-navy-800 lg:grid-cols-12">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Cari pengguna, aksi, entitas, ID…" className="lg:col-span-3" />
          <Select value={action} onChange={(e) => { setAction(e.target.value); setPage(1) }} className="lg:col-span-2" aria-label="Saring aksi audit">
            <option value="">Semua aksi</option>
            {(query.data?.actions ?? []).map((a: string) => <option key={a} value={a}>{a}</option>)}
          </Select>
          <Select value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1) }} className="lg:col-span-2" aria-label="Saring entitas audit">
            <option value="">Semua entitas</option>
            {(query.data?.entities ?? []).map((e: string) => <option key={e} value={e}>{e}</option>)}
          </Select>
          <Input value={username} onChange={(e) => { setUsername(e.target.value); setPage(1) }} placeholder="Username" aria-label="Cari username" className="lg:col-span-2" />
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1) }} title="Dari tanggal" aria-label="Dari tanggal" className="lg:col-span-1" />
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1) }} title="Sampai tanggal" aria-label="Sampai tanggal" className="lg:col-span-1" />
          <Button variant="secondary" className="lg:col-span-1" onClick={resetFilters} disabled={!filtersActive}>Reset</Button>
        </div>

        <DataTable
          rows={rows}
          loading={query.loading}
          onRowClick={(row) => setDetail(row)}
          columns={[
            { key: 'createdAt', header: 'Waktu', render: (r) => <span className="whitespace-nowrap text-xs">{formatDateTime(r.createdAt)}</span> },
            { key: 'username', header: 'Pengguna', render: (r) => <span className="font-medium">{r.username}</span> },
            { key: 'action', header: 'Aksi', render: (r) => <Badge tone="neutral">{r.action}</Badge> },
            { key: 'entity', header: 'Entitas', render: (r) => r.entity },
            { key: 'entityId', header: 'ID Entitas', render: (r) => <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{r.entityId ? r.entityId.slice(0, 12) : '—'}</span> },
            { key: 'hash', header: 'Hash', render: (r) => <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{String(r.hash).slice(0, 16)}…</span> },
          ]}
        />
        {query.data && (
          <Pagination page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} totalPages={query.data.totalPages} onPage={setPage} />
        )}
      </Card>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title="Detail Audit"
        subtitle={detail ? `${detail.action} · ${detail.entity}` : undefined}
        size="lg"
        footer={<Button variant="secondary" onClick={() => setDetail(null)}>Tutup</Button>}
      >
        {detail && (
          <div className="space-y-4 text-sm">
            <div className="grid gap-2 sm:grid-cols-2">
              <InfoRow label="Waktu" value={formatDateTime(detail.createdAt)} />
              <InfoRow label="Pengguna" value={detail.username} />
              <InfoRow label="Aksi" value={detail.action} />
              <InfoRow label="Entitas" value={detail.entity} />
              <InfoRow label="ID Entitas" value={detail.entityId ?? '—'} mono />
            </div>
            <div>
              <SectionTitle title="Nilai Sebelum" />
              <pre className="max-h-40 overflow-auto rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-700 dark:bg-navy-950 dark:text-slate-300">{pretty(detail.before)}</pre>
            </div>
            <div>
              <SectionTitle title="Nilai Sesudah" />
              <pre className="max-h-40 overflow-auto rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-700 dark:bg-navy-950 dark:text-slate-300">{pretty(detail.after)}</pre>
            </div>
            <div>
              <SectionTitle title="Metadata" />
              <pre className="max-h-40 overflow-auto rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-700 dark:bg-navy-950 dark:text-slate-300">{pretty(detail.meta)}</pre>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 dark:border-navy-800">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-navy-900 dark:text-white"><Hash className="h-3.5 w-3.5" /> Rantai Hash</p>
              <p className="break-all font-mono text-[10px] text-slate-500 dark:text-slate-400">prev: {detail.prevHash ?? '—'}</p>
              <p className="break-all font-mono text-[10px] text-slate-500 dark:text-slate-400">hash: {detail.hash}</p>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={verifyOpen}
        onClose={() => setVerifyOpen(false)}
        title="Verifikasi Rantai Audit"
        subtitle="Memeriksa konsistensi hash seluruh entri audit."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setVerifyOpen(false)} disabled={verifying}>Tutup</Button>
            <Button variant="gold" onClick={() => void verify()} loading={verifying}><RefreshCw className="h-4 w-4" /> Mulai Verifikasi</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Alert tone="info">
            <span className="text-xs">Verifikasi membaca seluruh entri audit dan menghitung ulang rantai hash. Pada basis data yang sangat besar proses ini dapat memakan waktu. Maksimum 200.000 entri per verifikasi.</span>
          </Alert>
          {verifyError && <Alert tone="danger" title="Verifikasi gagal">{verifyError}</Alert>}
          {verifyResult && (
            <Alert tone={verifyResult.ok ? 'success' : 'danger'} title={verifyResult.ok ? 'Rantai audit utuh' : 'Rantai audit bermasalah'}>
              <div className="space-y-1 text-xs">
                <p>{verifyResult.detail}</p>
                <p>Diperiksa: <b>{verifyResult.checked}</b> · Total entri: <b>{verifyResult.total}</b>{verifyResult.brokenAt ? ` · Terputus pada #${verifyResult.brokenAt}` : ''}</p>
              </div>
            </Alert>
          )}
          {!verifyResult && !verifyError && (
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-navy-900/60 dark:text-slate-400">
              {verifyResult === null ? <ShieldAlert className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
              Tekan Mulai Verifikasi untuk memeriksa rantai hash.
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-navy-900/60">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-0.5 text-xs text-navy-900 dark:text-slate-200 ${mono ? 'break-all font-mono' : ''}`}>{value}</p>
    </div>
  )
}
