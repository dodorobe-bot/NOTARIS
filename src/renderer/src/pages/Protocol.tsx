import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Archive, FileSpreadsheet, Plus } from 'lucide-react'
import { call, useDebounced, useQuery } from '@/api'
import type { SessionInfo } from '@/types'
import {
  Alert, Badge, Button, Card, DataTable, EmptyState, Field, Input, Modal, PageHeader,
  Pagination, SearchInput, Select, StatCard, Textarea, useToast,
} from '@/components/ui'
import { formatDate } from '@shared/format'

const PROTOCOL_TYPES = [
  { value: 'MINUTA', label: 'Minuta Akta' },
  { value: 'SALINAN', label: 'Salinan Akta' },
  { value: 'ARSIP', label: 'Arsip' },
]

export function Protocol({ session }: { session: SessionInfo }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const canManage = session.permissions.includes('protocol.manage')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [year, setYear] = useState('')
  const debounced = useDebounced(search)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<any>({
    deedId: '', year: String(new Date().getFullYear()), protocolType: 'MINUTA', location: '', notes: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const query = useQuery<any>('protocol.list', {
    page, pageSize: 25, search: debounced, year: year ? Number(year) : undefined,
  })
  const deeds = useQuery<any>('deeds.list', { page: 1, pageSize: 200 }, { enabled: open })

  useEffect(() => {
    if (!canManage) return
    if (params.get('new') === '1') {
      setForm({
        deedId: params.get('deedId') ?? '',
        year: String(new Date().getFullYear()),
        protocolType: 'MINUTA', location: '', notes: '',
      })
      setError(null)
      setOpen(true)
      params.delete('new')
      params.delete('deedId')
      setParams(params, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save() {
    const y = Number(form.year)
    if (!y || y < 1900 || y > 2200) return setError('Tahun register tidak valid.')
    setBusy(true)
    setError(null)
    try {
      const created = await call<any>('protocol.create', {
        deedId: form.deedId || null,
        year: y,
        protocolType: form.protocolType,
        location: form.location || null,
        notes: form.notes || null,
      })
      toast.success(`Protokol tercatat dengan nomor register ${String(created.registerNumber).padStart(3, '0')}/${created.year}.`)
      setOpen(false)
      void query.reload(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 8 }, (_, i) => currentYear - i)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administrasi"
        title="Protokol Notaris"
        subtitle="Register penyimpanan minuta, salinan, dan arsip akta beserta lokasi penyimpanannya."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/laporan?report=protocol')}><FileSpreadsheet className="h-4 w-4" /> Laporan & Ekspor</Button>
            {canManage && <Button onClick={() => { setError(null); setOpen(true) }}><Plus className="h-4 w-4" /> Catat Protokol</Button>}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Total Register" value={query.data?.total ?? '—'} hint="Seluruh tahun" icon={<Archive />} tone="navy" />
        <StatCard label="Tahun Aktif" value={year || 'Semua'} tone="gold" />
        <StatCard label="Jenis Protokol" value="Minuta · Salinan · Arsip" tone="blue" />
      </div>

      <Card className="p-3">
        <div className="grid gap-2 md:grid-cols-[1fr_180px]">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Cari nomor akta, lokasi, atau catatan…" />
          <Select value={year} onChange={(e) => { setYear(e.target.value); setPage(1) }} aria-label="Saring tahun protokol">
            <option value="">Semua tahun</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </div>
      </Card>

      {query.error && <Alert tone="danger" title="Gagal memuat protokol">{query.error}</Alert>}

      <Card className="overflow-hidden">
        <DataTable
          rows={query.data?.items ?? []}
          loading={query.loading}
          columns={[
            { key: 'registerNumber', header: 'No. Register', render: (r) => <span className="font-mono text-xs font-bold">{String(r.registerNumber).padStart(3, '0')}<span className="font-normal text-slate-400">/{r.year}</span></span> },
            { key: 'protocolType', header: 'Jenis', render: (r) => <Badge tone={r.protocolType === 'MINUTA' ? 'gold' : r.protocolType === 'SALINAN' ? 'blue' : 'neutral'}>{r.protocolType}</Badge> },
            {
              key: 'deed', header: 'Akta',
              render: (r) => r.deed ? (
                <button type="button" className="text-left" onClick={() => navigate(`/akta/${r.deed.id}`)}>
                  <p className="font-mono text-xs font-semibold text-gold-600 hover:underline dark:text-gold-400">{r.deed.deedNumber}</p>
                  <p className="max-w-[260px] truncate text-[11px] text-slate-500">{r.deed.title}</p>
                </button>
              ) : <span className="text-slate-400">Tanpa akta</span>,
            },
            { key: 'location', header: 'Lokasi Penyimpanan', render: (r) => r.location ?? '—' },
            { key: 'depositedAt', header: 'Tanggal Setor', render: (r) => formatDate(r.depositedAt) },
            { key: 'createdBy', header: 'Dicatat Oleh', render: (r) => r.createdBy?.fullName ?? '—' },
            { key: 'notes', header: 'Catatan', render: (r) => r.notes ?? '—' },
          ]}
          empty={<EmptyState title="Belum ada catatan protokol" description="Catat minuta, salinan, atau arsip akta yang disimpan sesuai ketentuan." action={canManage ? <Button onClick={() => { setError(null); setOpen(true) }}><Plus className="h-4 w-4" /> Catat Protokol</Button> : undefined} />}
        />
        {query.data && (
          <Pagination page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} totalPages={query.data.totalPages} onPage={setPage} />
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Catat Protokol Notaris"
        subtitle="Nomor register dan nomor urut dibuat otomatis per tahun."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>Batal</Button>
            <Button onClick={() => void save()} loading={busy}>Simpan</Button>
          </>
        }
      >
        <div className="space-y-3">
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="Akta">
            <Select value={form.deedId} onChange={(e) => setForm({ ...form, deedId: e.target.value })}>
              <option value="">Tanpa akta terkait</option>
              {(deeds.data?.items ?? []).map((d: any) => <option key={d.id} value={d.id}>{d.deedNumber} — {d.client?.fullName}</option>)}
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tahun" required>
              <Input type="number" min="1900" max="2200" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
            </Field>
            <Field label="Jenis Protokol" required>
              <Select value={form.protocolType} onChange={(e) => setForm({ ...form, protocolType: e.target.value })}>
                {PROTOCOL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Lokasi Penyimpanan">
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Mis. Lemari A, Rak 2" />
          </Field>
          <Field label="Catatan">
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={1000} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
