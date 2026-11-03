import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Landmark, MapPin, Pencil, Plus, Receipt, ShieldCheck, Trash2 } from 'lucide-react'
import { call, useDebounced, useQuery } from '@/api'
import type { SessionInfo } from '@/types'
import {
  Alert, Badge, Button, Card, ConfirmDialog, DataTable, EmptyState, Field, IconButton, Input,
  Modal, PageHeader, Pagination, SearchInput, SectionTitle, Select, StatCard, StatusBadge,
  Tabs, Textarea, useToast,
} from '@/components/ui'
import {
  PPAT_SERVICE_TYPES, RIGHT_TYPES, WORKFLOW_LABELS, labelOf,
} from '@shared/constants'
import { formatDate, toDateInput } from '@shared/format'

const EMPTY_CERT = { number: '', type: 'HAK_MILIK', issuedAt: '', expiryAt: '', ownerName: '', notes: '' }

function emptyProperty() {
  return {
    transactionId: '', certificateNumber: '', rightType: 'HAK_MILIK', landArea: '', buildingArea: '',
    address: '', kelurahan: '', kecamatan: '', kabupaten: '', provinsi: '', ownerName: '', nop: '',
    njop: 0, transactionPrice: 0, notes: '', certificates: [] as any[],
  }
}

export function Ppat({ session }: { session: SessionInfo }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const canManage = session.permissions.includes('ppat.manage')
  const [tab, setTab] = useState('objek')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [rightType, setRightType] = useState('')
  const debounced = useDebounced(search)
  const [txPage, setTxPage] = useState(1)
  const [txSearch, setTxSearch] = useState('')
  const [txStatus, setTxStatus] = useState('')
  const txDebounced = useDebounced(txSearch)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [form, setForm] = useState<any>(emptyProperty())
  const [errors, setErrors] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState<any | null>(null)

  const summary = useQuery<any>('ppat.summary')
  const properties = useQuery<any>('ppat.properties.list', {
    page, pageSize: 20, search: debounced, rightType: rightType || undefined,
  })
  const transactions = useQuery<any>('transactions.list', {
    page: txPage, pageSize: 20, search: txDebounced, type: 'PPAT', status: txStatus || undefined,
  })
  const txOptions = useQuery<any[]>('transactions.options', {}, { enabled: formOpen })

  useEffect(() => {
    if (!canManage) return
    if (params.get('new') === '1') {
      openCreate()
      params.delete('new')
      setParams(params, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openCreate() {
    setEditing(null)
    setForm(emptyProperty())
    setErrors(null)
    setFormOpen(true)
  }

  function openEdit(row: any) {
    setEditing(row)
    setForm({
      transactionId: row.transactionId ?? '',
      certificateNumber: row.certificateNumber ?? '',
      rightType: row.rightType ?? 'HAK_MILIK',
      landArea: row.landArea ?? '',
      buildingArea: row.buildingArea ?? '',
      address: row.address ?? '',
      kelurahan: row.kelurahan ?? '',
      kecamatan: row.kecamatan ?? '',
      kabupaten: row.kabupaten ?? '',
      provinsi: row.provinsi ?? '',
      ownerName: row.ownerName ?? '',
      nop: row.nop ?? '',
      njop: row.njop ?? 0,
      transactionPrice: row.transactionPrice ?? 0,
      notes: row.notes ?? '',
      certificates: (row.certificates ?? []).map((c: any) => ({
        number: c.number, type: c.type, issuedAt: toDateInput(c.issuedAt), expiryAt: toDateInput(c.expiryAt),
        ownerName: c.ownerName ?? '', notes: c.notes ?? '',
      })),
    })
    setErrors(null)
    setFormOpen(true)
  }

  async function save() {
    if (!form.certificateNumber?.trim() && form.certificates.every((c: any) => !c.number?.trim())) {
      return setErrors('Nomor sertifikat atau minimal satu sertifikat wajib diisi.')
    }
    setBusy(true)
    setErrors(null)
    try {
      const payload: any = {
        transactionId: form.transactionId || null,
        certificateNumber: form.certificateNumber || null,
        rightType: form.rightType || null,
        landArea: form.landArea === '' ? null : Number(form.landArea),
        buildingArea: form.buildingArea === '' ? null : Number(form.buildingArea),
        address: form.address || null,
        kelurahan: form.kelurahan || null,
        kecamatan: form.kecamatan || null,
        kabupaten: form.kabupaten || null,
        provinsi: form.provinsi || null,
        ownerName: form.ownerName || null,
        nop: form.nop || null,
        njop: Number(form.njop) || 0,
        transactionPrice: Number(form.transactionPrice) || 0,
        notes: form.notes || null,
        certificates: (form.certificates ?? []).filter((c: any) => c.number?.trim()).map((c: any) => ({
          number: c.number.trim(), type: c.type, issuedAt: c.issuedAt || null, expiryAt: c.expiryAt || null,
          ownerName: c.ownerName || null, notes: c.notes || null,
        })),
      }
      if (editing) {
        await call('ppat.properties.update', { id: editing.id, ...payload })
        toast.success('Objek tanah diperbarui.')
      } else {
        await call('ppat.properties.create', payload)
        toast.success('Objek tanah berhasil dicatat.')
      }
      setFormOpen(false)
      void properties.reload(true)
      void summary.reload(true)
    } catch (err) {
      setErrors((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!deleting) return
    setBusy(true)
    try {
      await call('ppat.properties.delete', { id: deleting.id })
      toast.success('Objek tanah dihapus dan perubahan tercatat pada audit.')
      setDeleting(null)
      void properties.reload(true)
      void summary.reload(true)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function updateCert(index: number, patch: Record<string, any>) {
    setForm((prev: any) => ({
      ...prev,
      certificates: prev.certificates.map((c: any, i: number) => (i === index ? { ...c, ...patch } : c)),
    }))
  }

  const s = summary.data

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operasional"
        title="Akta & Layanan PPAT"
        subtitle="AJB, APHT, SKMHT, hibah, APHB, tukar menukar, dan layanan pertanahan lain beserta objek tanah dan sertifikatnya."
        actions={
          <>
            {session.permissions.includes('transactions.manage') && (
              <Button variant="secondary" onClick={() => navigate('/transaksi?new=1&type=PPAT')}><Landmark className="h-4 w-4" /> Transaksi PPAT Baru</Button>
            )}
            {canManage && <Button onClick={openCreate}><Plus className="h-4 w-4" /> Objek Tanah Baru</Button>}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Proses PPAT Aktif" value={summary.loading ? '—' : s?.ppatProcess ?? 0} hint="Transaksi PPAT belum selesai" icon={<Landmark />} tone="navy" />
        <StatCard label="Objek Tanah" value={summary.loading ? '—' : s?.totalProperties ?? 0} hint="Seluruh objek terdaftar" icon={<MapPin />} tone="gold" />
        <StatCard label="Sertifikat" value={summary.loading ? '—' : s?.totalCertificates ?? 0} hint="Sertifikat hak atas tanah" icon={<ShieldCheck />} tone="blue" />
        <StatCard label="Tenggat Aktif" value={summary.loading ? '—' : s?.activeDeadlines ?? 0} hint="Perlu tindak lanjut" icon={<Receipt />} tone="red" />
      </div>

      {(s?.byService ?? []).length > 0 && (
        <Card className="p-5">
          <SectionTitle title="Distribusi Layanan PPAT" subtitle="Jumlah transaksi menurut jenis layanan" />
          <div className="flex flex-wrap gap-2">
            {s.byService.map((x: any) => (
              <Badge key={x.serviceType} tone="blue">{labelOf(PPAT_SERVICE_TYPES, x.serviceType)} · {x.count}</Badge>
            ))}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="px-4 pt-3">
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { key: 'objek', label: 'Objek Tanah & Sertifikat', count: properties.data?.total ?? 0 },
              { key: 'transaksi', label: 'Transaksi PPAT', count: transactions.data?.total ?? 0 },
            ]}
          />
        </div>

        {tab === 'objek' && (
          <>
            <div className="grid gap-2 p-3 md:grid-cols-[1fr_220px]">
              <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Cari sertifikat, pemilik, alamat, NOP, transaksi…" />
              <Select value={rightType} onChange={(e) => { setRightType(e.target.value); setPage(1) }}>
                <option value="">Semua jenis hak</option>
                {RIGHT_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </Select>
            </div>
            {properties.error && <div className="px-3 pb-3"><Alert tone="danger">{properties.error}</Alert></div>}
            <DataTable
              rows={properties.data?.items ?? []}
              loading={properties.loading}
              columns={[
                {
                  key: 'certificateNumber', header: 'Sertifikat / Objek',
                  render: (r) => (
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-semibold">{r.certificateNumber ?? '—'}</p>
                      <p className="truncate text-[11px] text-slate-500">{labelOf(RIGHT_TYPES, r.rightType)} · {r.address ?? 'Alamat belum diisi'}</p>
                    </div>
                  ),
                },
                { key: 'ownerName', header: 'Pemilik', render: (r) => r.ownerName ?? '—' },
                { key: 'area', header: 'Luas', align: 'right', render: (r) => `${r.landArea ?? 0} m²${r.buildingArea ? ` / ${r.buildingArea} m²` : ''}` },
                { key: 'price', header: 'Nilai Transaksi', align: 'right', render: (r) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(r.transactionPrice ?? 0) },
                {
                  key: 'transaction', header: 'Transaksi',
                  render: (r) => r.transaction ? (
                    <button type="button" className="text-left text-xs font-semibold text-gold-600 hover:underline dark:text-gold-400" onClick={() => navigate(`/transaksi/${r.transaction.id}`)}>
                      {r.transaction.code}
                      <span className="block font-normal text-slate-500">{r.transaction.client?.fullName}</span>
                    </button>
                  ) : <span className="text-slate-400">Tidak tertaut</span>,
                },
                { key: 'certificates', header: 'Sertifikat', render: (r) => <Badge tone="neutral">{r.certificates?.length ?? 0}</Badge> },
                {
                  key: 'actions', header: '', align: 'right', width: 96,
                  render: (r) => canManage ? (
                    <div className="flex justify-end gap-1">
                      <IconButton label="Ubah objek tanah" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></IconButton>
                      <IconButton label="Hapus objek tanah" onClick={() => setDeleting(r)}><Trash2 className="h-4 w-4 text-red-500" /></IconButton>
                    </div>
                  ) : null,
                },
              ]}
              empty={<EmptyState title="Belum ada objek tanah" description="Catat objek tanah dan sertifikat untuk layanan PPAT." action={canManage ? <Button onClick={openCreate}><Plus className="h-4 w-4" /> Objek Tanah Baru</Button> : undefined} />}
            />
            {properties.data && (
              <Pagination page={properties.data.page} pageSize={properties.data.pageSize} total={properties.data.total} totalPages={properties.data.totalPages} onPage={setPage} />
            )}
          </>
        )}

        {tab === 'transaksi' && (
          <>
            <div className="grid gap-2 p-3 md:grid-cols-[1fr_220px]">
              <SearchInput value={txSearch} onChange={(v) => { setTxSearch(v); setTxPage(1) }} placeholder="Cari kode transaksi PPAT atau klien…" />
              <Select value={txStatus} onChange={(e) => { setTxStatus(e.target.value); setTxPage(1) }}>
                <option value="">Semua status</option>
                {Object.entries(WORKFLOW_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <DataTable
              rows={transactions.data?.items ?? []}
              loading={transactions.loading}
              onRowClick={(r) => navigate(`/transaksi/${r.id}`)}
              columns={[
                { key: 'code', header: 'Kode', render: (r) => <span className="font-mono text-xs font-semibold">{r.code}</span> },
                { key: 'title', header: 'Transaksi', render: (r) => <div><p className="font-medium">{r.title}</p><p className="text-[11px] text-slate-500">{r.client?.fullName}</p></div> },
                { key: 'serviceType', header: 'Layanan', render: (r) => r.serviceType ? labelOf(PPAT_SERVICE_TYPES, r.serviceType) : '—' },
                { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} label={WORKFLOW_LABELS[r.status]} /> },
                { key: 'createdAt', header: 'Dibuat', render: (r) => formatDate(r.createdAt) },
              ]}
              empty={<EmptyState title="Belum ada transaksi PPAT" description="Buat transaksi PPAT untuk memulai layanan pertanahan." action={session.permissions.includes('transactions.manage') ? <Button onClick={() => navigate('/transaksi?new=1&type=PPAT')}><Plus className="h-4 w-4" /> Transaksi PPAT Baru</Button> : undefined} />}
            />
            {transactions.data && (
              <Pagination page={transactions.data.page} pageSize={transactions.data.pageSize} total={transactions.data.total} totalPages={transactions.data.totalPages} onPage={setTxPage} />
            )}
          </>
        )}
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Ubah Objek Tanah' : 'Objek Tanah Baru'}
        subtitle="Data objek pertanahan dan sertifikat yang menjadi dasar layanan PPAT."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={busy}>Batal</Button>
            <Button onClick={() => void save()} loading={busy}>{editing ? 'Simpan Perubahan' : 'Simpan Objek'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          {errors && <Alert tone="danger">{errors}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Transaksi Terkait" hint="Opsional. Hubungkan objek dengan transaksi PPAT.">
              <Select value={form.transactionId} onChange={(e) => setForm({ ...form, transactionId: e.target.value })}>
                <option value="">Tanpa transaksi</option>
                {(txOptions.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.code} — {t.title}</option>)}
              </Select>
            </Field>
            <Field label="Jenis Hak">
              <Select value={form.rightType} onChange={(e) => setForm({ ...form, rightType: e.target.value })}>
                {RIGHT_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </Select>
            </Field>
            <Field label="Nomor Sertifikat">
              <Input value={form.certificateNumber} onChange={(e) => setForm({ ...form, certificateNumber: e.target.value })} placeholder="Mis. 1234/SHM/2020" />
            </Field>
            <Field label="Nama Pemilik">
              <Input value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
            </Field>
            <Field label="Luas Tanah (m²)">
              <Input type="number" min="0" step="0.01" value={form.landArea} onChange={(e) => setForm({ ...form, landArea: e.target.value })} />
            </Field>
            <Field label="Luas Bangunan (m²)">
              <Input type="number" min="0" step="0.01" value={form.buildingArea} onChange={(e) => setForm({ ...form, buildingArea: e.target.value })} />
            </Field>
            <Field label="Alamat Objek" className="sm:col-span-2">
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Field>
            <Field label="Kelurahan / Desa">
              <Input value={form.kelurahan} onChange={(e) => setForm({ ...form, kelurahan: e.target.value })} />
            </Field>
            <Field label="Kecamatan">
              <Input value={form.kecamatan} onChange={(e) => setForm({ ...form, kecamatan: e.target.value })} />
            </Field>
            <Field label="Kabupaten / Kota">
              <Input value={form.kabupaten} onChange={(e) => setForm({ ...form, kabupaten: e.target.value })} />
            </Field>
            <Field label="Provinsi">
              <Input value={form.provinsi} onChange={(e) => setForm({ ...form, provinsi: e.target.value })} />
            </Field>
            <Field label="NOP">
              <Input value={form.nop} onChange={(e) => setForm({ ...form, nop: e.target.value })} />
            </Field>
            <Field label="NJOP (Rp)">
              <Input type="number" min="0" value={form.njop} onChange={(e) => setForm({ ...form, njop: Number(e.target.value) })} />
            </Field>
            <Field label="Nilai Transaksi (Rp)" className="sm:col-span-2">
              <Input type="number" min="0" value={form.transactionPrice} onChange={(e) => setForm({ ...form, transactionPrice: Number(e.target.value) })} />
            </Field>
            <Field label="Catatan" className="sm:col-span-2">
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 dark:border-navy-800">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Daftar Sertifikat</p>
              <Button variant="secondary" className="!py-1.5 text-xs" onClick={() => setForm({ ...form, certificates: [...form.certificates, { ...EMPTY_CERT }] })}>
                <Plus className="h-3.5 w-3.5" /> Tambah Sertifikat
              </Button>
            </div>
            {form.certificates.length === 0 && <p className="text-xs text-slate-400">Belum ada sertifikat. Nomor sertifikat di atas dapat digunakan tanpa daftar rinci.</p>}
            {form.certificates.map((c: any, index: number) => (
              <div key={index} className="mb-3 rounded-lg bg-slate-50 p-3 dark:bg-navy-900">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nomor Sertifikat" required>
                    <Input value={c.number} onChange={(e) => updateCert(index, { number: e.target.value })} />
                  </Field>
                  <Field label="Jenis Hak">
                    <Select value={c.type} onChange={(e) => updateCert(index, { type: e.target.value })}>
                      {RIGHT_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </Select>
                  </Field>
                  <Field label="Tanggal Terbit">
                    <Input type="date" value={c.issuedAt} onChange={(e) => updateCert(index, { issuedAt: e.target.value })} />
                  </Field>
                  <Field label="Tanggal Berakhir">
                    <Input type="date" value={c.expiryAt} onChange={(e) => updateCert(index, { expiryAt: e.target.value })} />
                  </Field>
                  <Field label="Pemilik">
                    <Input value={c.ownerName} onChange={(e) => updateCert(index, { ownerName: e.target.value })} />
                  </Field>
                  <Field label="Catatan">
                    <Input value={c.notes} onChange={(e) => updateCert(index, { notes: e.target.value })} />
                  </Field>
                </div>
                <div className="mt-2 flex justify-end">
                  <Button variant="ghost" className="!py-1.5 text-xs" onClick={() => setForm({ ...form, certificates: form.certificates.filter((_: any, i: number) => i !== index) })}>Hapus</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => void remove()}
        loading={busy}
        danger
        title="Hapus objek tanah?"
        confirmLabel="Hapus Objek"
        description={<span>Objek <b>{deleting?.certificateNumber ?? 'tanpa nomor'}</b> akan dihapus permanen dari daftar objek. Riwayat audit tetap menyimpan jejak penghapusan.</span>}
      />
    </div>
  )
}
