import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, FileSpreadsheet, PenLine } from 'lucide-react'
import { call, useDebounced, useQuery } from '@/api'
import type { SessionInfo } from '@/types'
import {
  Alert, Badge, Button, Card, DataTable, EmptyState, Field, Modal, PageHeader, Pagination,
  SearchInput, Select, StatCard, Textarea, useToast,
} from '@/components/ui'
import { formatDate, formatDateTime } from '@shared/format'

export function Repertorium({ session }: { session: SessionInfo }) {
  const navigate = useNavigate()
  const toast = useToast()
  const canManage = session.permissions.includes('deeds.manage')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [year, setYear] = useState('')
  const debounced = useDebounced(search)
  const [open, setOpen] = useState(false)
  const [deedId, setDeedId] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const query = useQuery<any>('deeds.repertorium.list', {
    page, pageSize: 25, search: debounced, year: year ? Number(year) : undefined,
  })
  const deeds = useQuery<any>('deeds.list', { page: 1, pageSize: 200, status: 'SIGNED' }, { enabled: open })

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 8 }, (_, i) => currentYear - i)
  const available = (deeds.data?.items ?? []).filter((d: any) => !d.repertorium)

  async function register() {
    if (!deedId) return setError('Pilih akta yang akan dicatat.')
    setBusy(true)
    setError(null)
    try {
      const created = await call<any>('deeds.repertorium.register', { deedId, notes: notes || null })
      toast.success(`Akta tercatat pada repertorium nomor ${String(created.number).padStart(3, '0')}/${created.year}.`)
      setOpen(false)
      setDeedId('')
      setNotes('')
      void query.reload(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administrasi"
        title="Repertorium Akta"
        subtitle="Nomor urut pencatatan akta per tahun. Pencatatan otomatis terjadi saat status akta menjadi Tercatat; pencatatan manual tetap tercatat pada audit."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/laporan?report=repertorium')}><FileSpreadsheet className="h-4 w-4" /> Laporan & Ekspor</Button>
            {canManage && <Button onClick={() => { setOpen(true); setError(null) }}><PenLine className="h-4 w-4" /> Catat Manual</Button>}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Total Repertorium" value={query.data?.total ?? '—'} hint="Seluruh tahun" icon={<BookOpen />} tone="navy" />
        <StatCard label="Filter Tahun" value={year || 'Semua'} hint="Gunakan filter untuk tahun tertentu" tone="gold" />
        <StatCard label="Sumber" value="Otomatis saat Tercatat" hint="Dapat juga dicatat manual oleh staf berwenang" tone="blue" />
      </div>

      <Card className="p-3">
        <div className="grid gap-2 md:grid-cols-[1fr_180px]">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Cari nomor akta, klien, atau jenis akta…" />
          <Select value={year} onChange={(e) => { setYear(e.target.value); setPage(1) }}>
            <option value="">Semua tahun</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </div>
      </Card>

      {query.error && <Alert tone="danger" title="Gagal memuat repertorium">{query.error}</Alert>}

      <Card className="overflow-hidden">
        <DataTable
          rows={query.data?.items ?? []}
          loading={query.loading}
          onRowClick={(r) => navigate(`/akta/${r.deedId}`)}
          columns={[
            { key: 'number', header: 'No. Repertorium', render: (r) => <span className="font-mono text-xs font-bold">{String(r.number).padStart(3, '0')}<span className="font-normal text-slate-400">/{r.year}</span></span> },
            { key: 'deedNumber', header: 'Nomor Akta', render: (r) => <span className="font-mono text-xs">{r.deed?.deedNumber}</span> },
            { key: 'deedDate', header: 'Tanggal Akta', render: (r) => formatDate(r.deed?.deedDate) },
            { key: 'type', header: 'Jenis Akta', render: (r) => <div><p>{r.deed?.deedType?.name}</p><p className="text-[11px] text-slate-500">{r.deed?.deedType?.category}</p></div> },
            { key: 'client', header: 'Penghadap / Klien', render: (r) => r.deed?.client?.fullName ?? '—' },
            { key: 'notary', header: 'Notaris/PPAT', render: (r) => r.deed?.notary?.fullName ?? '—' },
            { key: 'registeredAt', header: 'Dicatat', render: (r) => <Badge tone="neutral">{formatDateTime(r.registeredAt)}</Badge> },
            { key: 'notes', header: 'Keterangan', render: (r) => r.notes ?? '—' },
          ]}
          empty={<EmptyState title="Belum ada pencatatan repertorium" description="Akta akan tercatat otomatis saat statusnya menjadi Tercatat, atau dicatat manual oleh staf berwenang." />}
        />
        {query.data && (
          <Pagination page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} totalPages={query.data.totalPages} onPage={setPage} />
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Catat Repertorium Manual"
        subtitle="Pilih akta yang sudah ditandatangani dan belum memiliki nomor repertorium."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>Batal</Button>
            <Button onClick={() => void register()} loading={busy} disabled={!deedId}>Catat</Button>
          </>
        }
      >
        <div className="space-y-3">
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="Akta" required>
            <Select value={deedId} onChange={(e) => setDeedId(e.target.value)}>
              <option value="">Pilih akta…</option>
              {available.map((d: any) => (
                <option key={d.id} value={d.id}>{d.deedNumber} — {d.client?.fullName} ({d.deedType?.name})</option>
              ))}
            </Select>
            {deeds.data && available.length === 0 && <p className="mt-1 text-[11px] text-amber-600">Tidak ada akta berstatus Ditandatangani yang belum tercatat.</p>}
          </Field>
          <Field label="Keterangan">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Catatan pencatatan manual…" maxLength={1000} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
