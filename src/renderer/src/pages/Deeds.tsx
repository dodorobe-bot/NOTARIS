import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FileSignature, Pencil, Plus, Users2 } from 'lucide-react'
import { call, useDebounced, useQuery } from '@/api'
import type { SessionInfo } from '@/types'
import {
  Alert, Badge, Button, Card, DataTable, EmptyState, Field, IconButton, Input, Modal,
  PageHeader, Pagination, SearchInput, Select, StatusBadge, Tabs, Textarea, useToast,
} from '@/components/ui'
import {
  DEED_PARTY_ROLES, DEED_STATUSES, DEED_STATUS_LABELS,
} from '@shared/constants'
import { formatDate, toDateInput } from '@shared/format'

const EMPTY_PARTY = { role: 'PENGHADAP', name: '', nik: '', address: '', phone: '', notes: '' }

function emptyForm() {
  return {
    deedTypeId: '',
    deedDate: toDateInput(new Date()),
    clientId: '',
    transactionId: '',
    title: '',
    notaryId: '',
    draftMakerId: '',
    penghadap: '',
    komparisi: '',
    premis: '',
    isi: '',
    penutup: '',
    witnesses: '',
    notes: '',
    parties: [] as any[],
  }
}

export function Deeds({ session }: { session: SessionInfo }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const canManage = session.permissions.includes('deeds.manage')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [typeId, setTypeId] = useState('')
  const [year, setYear] = useState('')
  const debounced = useDebounced(search)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [form, setForm] = useState<any>(emptyForm())
  const [tab, setTab] = useState('data')
  const [errors, setErrors] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const query = useQuery<any>('deeds.list', {
    page, pageSize: 20, search: debounced, status: status || undefined,
    deedTypeId: typeId || undefined, year: year ? Number(year) : undefined,
  })
  const types = useQuery<any[]>('deeds.types')
  const clients = useQuery<any[]>('clients.options', {}, { enabled: formOpen })
  const transactions = useQuery<any[]>('transactions.options', {}, { enabled: formOpen })
  const accounts = useQuery<any[]>('app.accounts', {}, { enabled: formOpen })

  useEffect(() => {
    if (!canManage) return
    const editId = params.get('edit')
    if (editId) {
      void openEdit(editId)
      params.delete('edit')
      setParams(params, { replace: true })
      return
    }
    if (params.get('new') === '1') {
      setEditing(null)
      setForm({
        ...emptyForm(),
        clientId: params.get('clientId') ?? '',
        transactionId: params.get('transactionId') ?? '',
      })
      setErrors(null)
      setTab('data')
      setFormOpen(true)
      params.delete('new')
      params.delete('clientId')
      params.delete('transactionId')
      setParams(params, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm())
    setErrors(null)
    setTab('data')
    setFormOpen(true)
  }

  async function openEdit(id: string) {
    try {
      const deed = await call<any>('deeds.get', { id })
      let witnesses: string[] = []
      try {
        const parsed = deed.witnessesJson ? JSON.parse(deed.witnessesJson) : []
        witnesses = Array.isArray(parsed)
          ? parsed.map((w: any) => (typeof w === 'string' ? w : w?.nama ?? w?.name ?? '')).filter(Boolean)
          : []
      } catch {
        witnesses = []
      }
      setEditing(deed)
      setForm({
        deedTypeId: deed.deedTypeId,
        deedDate: toDateInput(deed.deedDate),
        clientId: deed.clientId,
        transactionId: deed.transactionId ?? '',
        title: deed.title ?? '',
        notaryId: deed.notaryId ?? '',
        draftMakerId: deed.draftMakerId ?? '',
        penghadap: deed.penghadap ?? '',
        komparisi: deed.komparisi ?? '',
        premis: deed.premis ?? '',
        isi: deed.isi ?? '',
        penutup: deed.penutup ?? '',
        witnesses: witnesses.join('\n'),
        notes: deed.notes ?? '',
        parties: (deed.parties ?? []).map((p: any) => ({
          role: p.role, name: p.name, nik: p.nik ?? '', address: p.address ?? '',
          phone: p.phone ?? '', notes: p.notes ?? '',
        })),
      })
      setErrors(null)
      setTab('data')
      setFormOpen(true)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function save() {
    if (!form.deedTypeId) return setErrors('Jenis akta wajib dipilih.')
    if (!form.clientId) return setErrors('Klien wajib dipilih.')
    if (!form.deedDate) return setErrors('Tanggal akta wajib diisi.')
    const witnesses = String(form.witnesses ?? '')
      .split(/[\n,]/)
      .map((w) => w.trim())
      .filter(Boolean)
    setBusy(true)
    setErrors(null)
    try {
      const payload: any = {
        deedTypeId: form.deedTypeId,
        deedDate: form.deedDate,
        clientId: form.clientId,
        transactionId: form.transactionId || null,
        title: form.title || null,
        notaryId: form.notaryId || null,
        draftMakerId: form.draftMakerId || null,
        penghadap: form.penghadap || null,
        komparisi: form.komparisi || null,
        premis: form.premis || null,
        isi: form.isi || null,
        penutup: form.penutup || null,
        witnessesJson: witnesses.length ? JSON.stringify(witnesses) : null,
        notes: form.notes || null,
        parties: (form.parties ?? []).filter((p: any) => p.name?.trim()).map((p: any) => ({
          role: p.role, name: p.name.trim(), nik: p.nik || null, address: p.address || null,
          phone: p.phone || null, notes: p.notes || null,
        })),
      }
      if (editing) {
        await call('deeds.update', { id: editing.id, ...payload })
        toast.success('Draft akta diperbarui dan revisi sebelumnya tersimpan pada riwayat.')
        setFormOpen(false)
        void query.reload(true)
      } else {
        const created = await call<any>('deeds.create', payload)
        toast.success(`Draft akta ${created.deedNumber} dibuat.`)
        setFormOpen(false)
        navigate(`/akta/${created.id}`)
      }
    } catch (err) {
      setErrors((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function updateParty(index: number, patch: Record<string, any>) {
    setForm((prev: any) => ({
      ...prev,
      parties: prev.parties.map((p: any, i: number) => (i === index ? { ...p, ...patch } : p)),
    }))
  }

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 8 }, (_, i) => currentYear - i)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operasional"
        title="Akta Notaris"
        subtitle="Draft, review, approval, penandatanganan, dan pencatatan akta. Isi akta yang telah ditandatangani terkunci dan tidak dapat diubah diam-diam."
        actions={canManage ? <Button onClick={openCreate}><Plus className="h-4 w-4" /> Akta Baru</Button> : undefined}
      />

      <Card className="p-3">
        <div className="grid gap-2 lg:grid-cols-[1fr_210px_190px_120px]">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Cari nomor akta, judul, klien, atau penghadap…" />
          <Select value={typeId} onChange={(e) => { setTypeId(e.target.value); setPage(1) }}>
            <option value="">Semua jenis akta</option>
            {(types.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
            <option value="">Semua status</option>
            {DEED_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
          <Select value={year} onChange={(e) => { setYear(e.target.value); setPage(1) }}>
            <option value="">Semua tahun</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </div>
      </Card>

      {query.error && <Alert tone="danger" title="Gagal memuat akta">{query.error}</Alert>}

      <Card className="overflow-hidden">
        <DataTable
          rows={query.data?.items ?? []}
          loading={query.loading}
          onRowClick={(row) => navigate(`/akta/${row.id}`)}
          columns={[
            { key: 'deedNumber', header: 'Nomor Akta', render: (r) => <span className="font-mono text-xs font-semibold">{r.deedNumber}</span> },
            {
              key: 'type', header: 'Jenis Akta',
              render: (r) => (
                <div>
                  <p className="font-medium">{r.deedType?.name}</p>
                  <p className="text-[11px] text-slate-500">{r.deedType?.category}</p>
                </div>
              ),
            },
            { key: 'client', header: 'Klien', render: (r) => r.client?.fullName ?? '—' },
            { key: 'deedDate', header: 'Tanggal', render: (r) => formatDate(r.deedDate) },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} label={DEED_STATUS_LABELS[r.status]} /> },
            { key: 'notary', header: 'Notaris/PPAT', render: (r) => r.notary?.fullName ?? <span className="text-amber-600">Belum ditetapkan</span> },
            { key: 'repertorium', header: 'Repertorium', render: (r) => r.repertorium ? <Badge tone="green">{String(r.repertorium.number).padStart(3, '0')}/{r.repertorium.year}</Badge> : <span className="text-slate-400">—</span> },
            {
              key: 'actions', header: '', align: 'right', width: 56,
              render: (r) => canManage && ['DRAFT', 'REVIEW'].includes(r.status) ? (
                <span onClick={(e) => e.stopPropagation()}>
                  <IconButton label="Ubah draft akta" onClick={() => void openEdit(r.id)}><Pencil className="h-4 w-4" /></IconButton>
                </span>
              ) : null,
            },
          ]}
          empty={<EmptyState title="Belum ada akta" description="Buat draft akta dari template. Nomor akta dihasilkan otomatis." action={canManage ? <Button onClick={openCreate}><FileSignature className="h-4 w-4" /> Akta Baru</Button> : undefined} />}
        />
        {query.data && (
          <Pagination page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} totalPages={query.data.totalPages} onPage={setPage} />
        )}
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Ubah Draft ${editing.deedNumber}` : 'Akta Baru'}
        subtitle="Isi akta, pihak, dan saksi. Nomor akta diberikan otomatis saat disimpan."
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={busy}>Batal</Button>
            <Button onClick={() => void save()} loading={busy}>{editing ? 'Simpan Revisi' : 'Simpan Draft'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          {errors && <Alert tone="danger">{errors}</Alert>}
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { key: 'data', label: 'Data Akta' },
              { key: 'isi', label: 'Isi Akta' },
              { key: 'pihak', label: 'Pihak', count: form.parties?.length ?? 0 },
            ]}
          />
          {tab === 'data' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Jenis Akta" required>
                <Select value={form.deedTypeId} onChange={(e) => setForm({ ...form, deedTypeId: e.target.value })}>
                  <option value="">Pilih jenis akta…</option>
                  {['NOTARIS', 'PPAT'].map((cat) => {
                    const list = (types.data ?? []).filter((t) => t.category === cat)
                    if (!list.length) return null
                    return (
                      <optgroup key={cat} label={cat}>
                        {list.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </optgroup>
                    )
                  })}
                </Select>
              </Field>
              <Field label="Tanggal Akta" required>
                <Input type="date" value={form.deedDate} onChange={(e) => setForm({ ...form, deedDate: e.target.value })} />
              </Field>
              <Field label="Klien" required>
                <Select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
                  <option value="">Pilih klien…</option>
                  {(clients.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.code} — {c.fullName}</option>)}
                </Select>
              </Field>
              <Field label="Transaksi Terkait" hint="Opsional, menghubungkan akta dengan transaksi kantor.">
                <Select value={form.transactionId} onChange={(e) => setForm({ ...form, transactionId: e.target.value })}>
                  <option value="">Tanpa transaksi</option>
                  {(transactions.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.code} — {t.title}</option>)}
                </Select>
              </Field>
              <Field label="Judul Akta" className="sm:col-span-2" hint="Kosongkan untuk memakai nama jenis akta.">
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={300} />
              </Field>
              <Field label="Notaris / PPAT Penanggung Jawab" hint="Wajib ditetapkan sebelum akta dapat ditandatangani.">
                <Select value={form.notaryId} onChange={(e) => setForm({ ...form, notaryId: e.target.value })}>
                  <option value="">Belum ditetapkan</option>
                  {(accounts.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.fullName} · {a.roleName}</option>)}
                </Select>
              </Field>
              <Field label="Penyusun Draft">
                <Select value={form.draftMakerId} onChange={(e) => setForm({ ...form, draftMakerId: e.target.value })}>
                  <option value="">Belum ditentukan</option>
                  {(accounts.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.fullName} · {a.roleName}</option>)}
                </Select>
              </Field>
              <Field label="Catatan Internal" className="sm:col-span-2">
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={2000} />
              </Field>
            </div>
          )}
          {tab === 'isi' && (
            <div className="space-y-4">
              <Alert tone="info">Isi akta dapat disusun bertahap. Setelah akta ditandatangani, isi terkunci dan perubahan hanya dapat dilakukan melalui mekanisme yang tercatat.</Alert>
              <Field label="Penghadap" hint="Uraian kehadiran para penghadap pada akta.">
                <Textarea value={form.penghadap} onChange={(e) => setForm({ ...form, penghadap: e.target.value })} className="min-h-[90px]" />
              </Field>
              <Field label="Komparisi">
                <Textarea value={form.komparisi} onChange={(e) => setForm({ ...form, komparisi: e.target.value })} className="min-h-[130px]" />
              </Field>
              <Field label="Premis">
                <Textarea value={form.premis} onChange={(e) => setForm({ ...form, premis: e.target.value })} className="min-h-[130px]" />
              </Field>
              <Field label="Isi Akta">
                <Textarea value={form.isi} onChange={(e) => setForm({ ...form, isi: e.target.value })} className="min-h-[220px]" />
              </Field>
              <Field label="Penutup">
                <Textarea value={form.penutup} onChange={(e) => setForm({ ...form, penutup: e.target.value })} className="min-h-[110px]" />
              </Field>
              <Field label="Saksi" hint="Satu nama per baris atau pisahkan dengan koma.">
                <Textarea value={form.witnesses} onChange={(e) => setForm({ ...form, witnesses: e.target.value })} className="min-h-[80px]" />
              </Field>
            </div>
          )}
          {tab === 'pihak' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500 dark:text-slate-400">Pihak yang disebut dalam akta dan perannya.</p>
                <Button variant="secondary" className="!py-1.5 text-xs" onClick={() => setForm({ ...form, parties: [...form.parties, { ...EMPTY_PARTY }] })}>
                  <Users2 className="h-3.5 w-3.5" /> Tambah Pihak
                </Button>
              </div>
              {form.parties.length === 0 && <EmptyState compact title="Belum ada pihak" />}
              {form.parties.map((p: any, index: number) => (
                <Card key={index} className="p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Peran">
                      <Select value={p.role} onChange={(e) => updateParty(index, { role: e.target.value })}>
                        {DEED_PARTY_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </Select>
                    </Field>
                    <Field label="Nama" required>
                      <Input value={p.name} onChange={(e) => updateParty(index, { name: e.target.value })} />
                    </Field>
                    <Field label="NIK">
                      <Input value={p.nik} onChange={(e) => updateParty(index, { nik: e.target.value })} />
                    </Field>
                    <Field label="Alamat">
                      <Input value={p.address} onChange={(e) => updateParty(index, { address: e.target.value })} />
                    </Field>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <Button variant="ghost" className="!py-1.5 text-xs" onClick={() => setForm({ ...form, parties: form.parties.filter((_: any, i: number) => i !== index) })}>Hapus pihak</Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
