import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Briefcase, Pencil, Plus, Users2 } from 'lucide-react'
import { call, useDebounced, useQuery } from '@/api'
import type { SessionInfo } from '@/types'
import {
  Alert, Badge, Button, Card, DataTable, EmptyState, Field, IconButton, Input, Modal,
  PageHeader, Pagination, SearchInput, Select, StatusBadge, Tabs, Textarea, useToast,
} from '@/components/ui'
import {
  DEED_PARTY_ROLES, PPAT_SERVICE_TYPES, PRIORITIES, TRANSACTION_TYPES, WORKFLOW_LABELS,
  WORKFLOW_STATUSES, labelOf,
} from '@shared/constants'
import { formatDate } from '@shared/format'

const EMPTY_PARTY = { role: 'PENGHADAP', name: '', nik: '', address: '', phone: '', notes: '' }

function emptyForm(type = 'NOTARIS') {
  return {
    clientId: '',
    type,
    serviceType: '',
    title: '',
    description: '',
    priority: 'NORMAL',
    assignedToId: '',
    parties: [] as any[],
  }
}

export function Transactions({ session }: { session: SessionInfo }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const canManage = session.permissions.includes('transactions.manage')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const debounced = useDebounced(search)
  const [formOpen, setFormOpen] = useState(false)
  const [tab, setTab] = useState('utama')
  const [editing, setEditing] = useState<any | null>(null)
  const [form, setForm] = useState<any>(emptyForm())
  const [errors, setErrors] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const query = useQuery<any>('transactions.list', {
    page, pageSize: 20, search: debounced, type: type || undefined, status: status || undefined,
  })
  const clients = useQuery<any[]>('clients.options', {}, { enabled: formOpen })
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
    const presetType = params.get('type')
    if (params.get('new') === '1') {
      setEditing(null)
      setForm({ ...emptyForm(presetType === 'PPAT' ? 'PPAT' : 'NOTARIS'), clientId: params.get('clientId') ?? '' })
      setErrors(null)
      setTab('utama')
      setFormOpen(true)
      params.delete('new')
      params.delete('clientId')
      params.delete('type')
      setParams(params, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm())
    setErrors(null)
    setTab('utama')
    setFormOpen(true)
  }

  async function openEdit(id: string) {
    try {
      const trx = await call<any>('transactions.get', { id })
      setEditing(trx)
      setForm({
        clientId: trx.clientId,
        type: trx.type,
        serviceType: trx.serviceType ?? '',
        title: trx.title,
        description: trx.description ?? '',
        priority: trx.priority,
        assignedToId: trx.assignedToId ?? '',
        parties: (trx.parties ?? []).map((p: any) => ({
          role: p.role, name: p.name, nik: p.nik ?? '', address: p.address ?? '',
          phone: p.phone ?? '', notes: p.notes ?? '', clientId: p.clientId ?? null,
        })),
      })
      setErrors(null)
      setTab('utama')
      setFormOpen(true)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function save() {
    if (!form.clientId) return setErrors('Klien wajib dipilih.')
    if (form.title.trim().length < 2) return setErrors('Judul transaksi minimal 2 karakter.')
    const parties = (form.parties ?? []).filter((p: any) => p.name?.trim())
    setBusy(true)
    setErrors(null)
    try {
      const payload: any = {
        clientId: form.clientId,
        type: form.type,
        serviceType: form.serviceType || null,
        title: form.title.trim(),
        description: form.description || null,
        priority: form.priority,
        assignedToId: form.assignedToId || null,
        parties: parties.map((p: any) => ({
          role: p.role, name: p.name.trim(), nik: p.nik || null, address: p.address || null,
          phone: p.phone || null, notes: p.notes || null, clientId: p.clientId ?? null,
        })),
      }
      if (editing) {
        await call('transactions.update', { id: editing.id, ...payload })
        toast.success('Transaksi berhasil diperbarui.')
      } else {
        const created = await call<any>('transactions.create', payload)
        toast.success(`Transaksi ${created.code} berhasil dibuat.`)
        setFormOpen(false)
        navigate(`/transaksi/${created.id}`)
        return
      }
      setFormOpen(false)
      void query.reload(true)
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

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operasional"
        title="Transaksi"
        subtitle="Registrasi perkara notaris dan PPAT beserta tahapan workflow, pihak, dokumen, dan penagihan."
        actions={canManage ? <Button onClick={openCreate}><Plus className="h-4 w-4" /> Transaksi Baru</Button> : undefined}
      />

      <Card className="p-3">
        <div className="grid gap-2 md:grid-cols-[1fr_170px_200px]">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Cari kode, judul, atau nama klien…" />
          <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1) }}>
            <option value="">Semua jenis</option>
            {TRANSACTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
            <option value="">Semua status</option>
            {WORKFLOW_STATUSES.map((s) => <option key={s} value={s}>{WORKFLOW_LABELS[s]}</option>)}
          </Select>
        </div>
      </Card>

      {query.error && <Alert tone="danger" title="Gagal memuat transaksi">{query.error}</Alert>}

      <Card className="overflow-hidden">
        <DataTable
          rows={query.data?.items ?? []}
          loading={query.loading}
          onRowClick={(row) => navigate(`/transaksi/${row.id}`)}
          columns={[
            { key: 'code', header: 'Kode', width: 130, render: (r) => <span className="font-mono text-xs font-semibold">{r.code}</span> },
            {
              key: 'title', header: 'Transaksi',
              render: (r) => (
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.title}</p>
                  <p className="truncate text-[11px] text-slate-500">{r.client?.fullName}</p>
                </div>
              ),
            },
            { key: 'type', header: 'Jenis', render: (r) => <Badge tone={r.type === 'PPAT' ? 'blue' : 'gold'}>{labelOf(TRANSACTION_TYPES, r.type)}</Badge> },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} label={WORKFLOW_LABELS[r.status]} /> },
            { key: 'priority', header: 'Prioritas', render: (r) => <Badge tone={r.priority === 'TINGGI' ? 'red' : r.priority === 'RENDAH' ? 'gray' : 'neutral'}>{labelOf(PRIORITIES, r.priority)}</Badge> },
            { key: 'assignedTo', header: 'PIC', render: (r) => r.assignedTo?.fullName ?? '—' },
            { key: 'counts', header: 'Kelengkapan', render: (r) => <span className="text-[11px] text-slate-500">{r._count?.deeds ?? 0} akta · {r._count?.documents ?? 0} dok · {r._count?.invoices ?? 0} inv</span> },
            { key: 'createdAt', header: 'Dibuat', render: (r) => formatDate(r.createdAt) },
            {
              key: 'actions', header: '', align: 'right', width: 56,
              render: (r) => canManage ? (
                <span onClick={(e) => e.stopPropagation()}>
                  <IconButton label="Ubah transaksi" onClick={() => void openEdit(r.id)}><Pencil className="h-4 w-4" /></IconButton>
                </span>
              ) : null,
            },
          ]}
          empty={<EmptyState title="Belum ada transaksi" description="Mulai dengan registrasi transaksi baru untuk klien yang sudah terdaftar." action={canManage ? <Button onClick={openCreate}><Plus className="h-4 w-4" /> Transaksi Baru</Button> : undefined} />}
        />
        {query.data && (
          <Pagination
            page={query.data.page}
            pageSize={query.data.pageSize}
            total={query.data.total}
            totalPages={query.data.totalPages}
            onPage={setPage}
          />
        )}
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Ubah Transaksi ${editing.code}` : 'Transaksi Baru'}
        subtitle="Data transaksi dan pihak-pihak yang terlibat"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={busy}>Batal</Button>
            <Button onClick={() => void save()} loading={busy}>{editing ? 'Simpan Perubahan' : 'Simpan Transaksi'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          {errors && <Alert tone="danger">{errors}</Alert>}
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[{ key: 'utama', label: 'Data Transaksi' }, { key: 'pihak', label: 'Pihak-pihak', count: form.parties?.length ?? 0 }]}
          />
          {tab === 'utama' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Klien" required className="sm:col-span-2">
                <Select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
                  <option value="">Pilih klien…</option>
                  {(clients.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.code} — {c.fullName}</option>
                  ))}
                </Select>
                {clients.data?.length === 0 && <p className="mt-1 text-[11px] text-amber-600">Belum ada klien. Daftarkan klien terlebih dahulu.</p>}
              </Field>
              <Field label="Jenis Transaksi" required>
                <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, serviceType: '' })}>
                  {TRANSACTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
              </Field>
              <Field label="Jenis Layanan" hint={form.type === 'PPAT' ? 'Layanan PPAT sesuai permohonan klien' : 'Contoh: Perjanjian, Kuasa, Legalisasi'}>
                {form.type === 'PPAT' ? (
                  <Select value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value })}>
                    <option value="">Pilih layanan PPAT…</option>
                    {PPAT_SERVICE_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </Select>
                ) : (
                  <Input value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value })} placeholder="Jenis layanan notaris" />
                )}
              </Field>
              <Field label="Judul Transaksi" required className="sm:col-span-2">
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Mis. Akta Jual Beli Tanah dan Bangunan" maxLength={250} />
              </Field>
              <Field label="Prioritas">
                <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </Select>
              </Field>
              <Field label="Penanggung Jawab">
                <Select value={form.assignedToId} onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}>
                  <option value="">Belum ditentukan</option>
                  {(accounts.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.fullName} · {a.roleName}</option>)}
                </Select>
              </Field>
              <Field label="Uraian" className="sm:col-span-2">
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Keterangan tambahan mengenai transaksi…" maxLength={3000} />
              </Field>
            </div>
          )}
          {tab === 'pihak' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500 dark:text-slate-400">Catat penghadap, penjual/pembeli, pemberi/penerima hak, saksi, atau kuasa.</p>
                <Button variant="secondary" className="!py-1.5 text-xs" onClick={() => setForm({ ...form, parties: [...form.parties, { ...EMPTY_PARTY }] })}>
                  <Users2 className="h-3.5 w-3.5" /> Tambah Pihak
                </Button>
              </div>
              {form.parties.length === 0 && <EmptyState compact title="Belum ada pihak" description="Pihak dapat ditambahkan kapan saja sebelum atau selama proses." />}
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
                    <Field label="Telepon">
                      <Input value={p.phone} onChange={(e) => updateParty(index, { phone: e.target.value })} />
                    </Field>
                    <Field label="Alamat" className="sm:col-span-2">
                      <Input value={p.address} onChange={(e) => updateParty(index, { address: e.target.value })} />
                    </Field>
                    <Field label="Catatan" className="sm:col-span-2">
                      <Input value={p.notes} onChange={(e) => updateParty(index, { notes: e.target.value })} />
                    </Field>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <Button variant="ghost" className="!py-1.5 text-xs" onClick={() => setForm({ ...form, parties: form.parties.filter((_: any, i: number) => i !== index) })}>
                      Hapus pihak
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
          {!editing && (
            <p className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <Briefcase className="h-3.5 w-3.5" /> Nomor transaksi dibuat otomatis oleh sistem setelah data disimpan.
            </p>
          )}
        </div>
      </Modal>
    </div>
  )
}
