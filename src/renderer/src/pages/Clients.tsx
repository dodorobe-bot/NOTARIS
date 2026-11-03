import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Building2, Pencil, Plus, Trash2, UserRound } from 'lucide-react'
import { call, useDebounced, useQuery } from '@/api'
import type { SessionInfo } from '@/types'
import {
  Alert, Badge, Button, Card, ConfirmDialog, DataTable, EmptyState, Field, IconButton,
  Input, Modal, PageHeader, Pagination, SearchInput, Select, StatusBadge, Tabs, Textarea,
  useToast,
} from '@/components/ui'
import {
  CLIENT_STATUSES, CLIENT_TYPES, GENDERS, IDENTITY_TYPES, LEGAL_TYPES, labelOf,
} from '@shared/constants'
import { formatDate, toDateInput } from '@shared/format'

const EMPTY_IDENTITY = { docType: 'KTP', number: '', issuedAt: '', expiresAt: '', notes: '' }

function emptyClient() {
  return {
    type: 'PERORANGAN',
    fullName: '',
    nik: '',
    npwp: '',
    birthPlace: '',
    birthDate: '',
    gender: '',
    occupation: '',
    address: '',
    kelurahan: '',
    kecamatan: '',
    kabupaten: '',
    provinsi: '',
    postalCode: '',
    phone: '',
    email: '',
    status: 'AKTIF',
    internalNotes: '',
    identities: [] as any[],
    company: {
      companyName: '', legalType: 'PT', establishmentDeedNumber: '', establishmentDeedDate: '',
      establishmentNotary: '', domicile: '', companyNpwp: '', nib: '', pengurusJson: '',
      shareholdersJson: '', legalityNotes: '',
    },
  }
}

export function Clients({ session }: { session: SessionInfo }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const canManage = session.permissions.includes('clients.manage')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const debounced = useDebounced(search)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [initialTab, setInitialTab] = useState('utama')
  const [deleting, setDeleting] = useState<any | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<any>(emptyClient())
  const [formError, setFormError] = useState<string | null>(null)

  const query = useQuery<any>('clients.list', { page, pageSize: 20, search: debounced, type: type || undefined, status: status || undefined })

  useEffect(() => {
    const editId = params.get('edit')
    if (editId && canManage) {
      void openEdit({ id: editId })
      params.delete('edit')
      setParams(params, { replace: true })
      return
    }
    if (params.get('new') === '1' && canManage) {
      openCreate()
      params.delete('new')
      setParams(params, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openCreate() {
    setEditing(null)
    setForm(emptyClient())
    setFormError(null)
    setInitialTab('utama')
    setFormOpen(true)
  }

  async function openEdit(row: any) {
    try {
      const detail = await call<any>('clients.get', { id: row.id })
      setEditing(detail)
      setFormError(null)
      setInitialTab('utama')
      setForm({
        ...emptyClient(),
        ...detail,
        birthDate: toDateInput(detail.birthDate),
        gender: detail.gender ?? '',
        identities: (detail.identities ?? []).map((i: any) => ({
          id: i.id, docType: i.docType, number: i.number ?? '', issuedAt: toDateInput(i.issuedAt),
          expiresAt: toDateInput(i.expiresAt), notes: i.notes ?? '', documentId: i.documentId,
        })),
        company: detail.company
          ? { ...emptyClient().company, ...detail.company, establishmentDeedDate: toDateInput(detail.company.establishmentDeedDate) }
          : emptyClient().company,
      })
      setFormOpen(true)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function save() {
    if (form.fullName.trim().length < 2) return setFormError('Nama lengkap minimal 2 karakter.')
    if (form.type === 'BADAN_HUKUM' && !form.company?.companyName?.trim()) {
      setInitialTab('badan-hukum')
      return setFormError('Nama perusahaan wajib diisi untuk badan hukum.')
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setFormError('Format email tidak valid.')
    setBusy(true)
    setFormError(null)
    const payload: any = {
      type: form.type,
      fullName: form.fullName.trim(),
      nik: form.nik || null,
      npwp: form.npwp || null,
      birthPlace: form.birthPlace || null,
      birthDate: form.birthDate || null,
      gender: form.type === 'PERORANGAN' ? (form.gender || null) : null,
      occupation: form.occupation || null,
      address: form.address || null,
      kelurahan: form.kelurahan || null,
      kecamatan: form.kecamatan || null,
      kabupaten: form.kabupaten || null,
      provinsi: form.provinsi || null,
      postalCode: form.postalCode || null,
      phone: form.phone || null,
      email: form.email || null,
      status: form.status,
      internalNotes: form.internalNotes || null,
      identities: (form.identities ?? []).filter((i: any) => i.number || i.notes).map((i: any) => ({
        docType: i.docType, number: i.number || null, issuedAt: i.issuedAt || null,
        expiresAt: i.expiresAt || null, notes: i.notes || null, documentId: i.documentId ?? null,
      })),
      company: form.type === 'BADAN_HUKUM' ? {
        ...form.company,
        establishmentDeedDate: form.company.establishmentDeedDate || null,
        companyNpwp: form.company.companyNpwp || null,
        nib: form.company.nib || null,
        pengurusJson: form.company.pengurusJson || null,
        shareholdersJson: form.company.shareholdersJson || null,
        legalityNotes: form.company.legalityNotes || null,
      } : null,
    }
    try {
      if (editing) {
        await call('clients.update', { ...payload, id: editing.id })
        toast.success('Data klien diperbarui.')
      } else {
        await call('clients.create', payload)
        toast.success('Klien baru berhasil ditambahkan.')
      }
      setFormOpen(false)
      await query.reload(true)
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!deleting) return
    setBusy(true)
    try {
      await call('clients.delete', { id: deleting.id })
      toast.success('Klien diarsipkan (soft delete).')
      setDeleting(null)
      await query.reload(true)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const rows = query.data?.items ?? []
  const columns = useMemo(
    () => [
      { key: 'code', header: 'Kode', render: (r: any) => <span className="font-mono text-[11px] text-slate-500">{r.code}</span> },
      {
        key: 'name', header: 'Nama / Perusahaan',
        render: (r: any) => (
          <div className="flex items-center gap-2">
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${r.type === 'BADAN_HUKUM' ? 'bg-gold-500/15 text-gold-700 dark:text-gold-300' : 'bg-navy-100 text-navy-700 dark:bg-navy-800 dark:text-navy-200'}`}>
              {r.type === 'BADAN_HUKUM' ? <Building2 className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-navy-900 dark:text-slate-100">{r.type === 'BADAN_HUKUM' ? r.company?.companyName ?? r.fullName : r.fullName}</p>
              <p className="truncate text-[10px] text-slate-500">{r.email || r.phone || '—'}</p>
            </div>
          </div>
        ),
      },
      { key: 'type', header: 'Jenis', render: (r: any) => <Badge tone={r.type === 'BADAN_HUKUM' ? 'gold' : 'blue'}>{r.type === 'BADAN_HUKUM' ? `Badan Hukum · ${r.company?.legalType ?? ''}` : 'Perorangan'}</Badge> },
      { key: 'nik', header: 'NIK / NPWP', render: (r: any) => <span className="text-xs text-slate-600 dark:text-slate-300">{r.nik || r.npwp || '—'}</span> },
      { key: 'city', header: 'Kota', render: (r: any) => <span className="text-xs">{r.kabupaten || r.provinsi || '—'}</span> },
      { key: 'counts', header: 'Transaksi / Akta', align: 'center' as const, render: (r: any) => <span className="text-xs">{r._count?.transactions ?? 0} / {r._count?.deeds ?? 0}</span> },
      { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} label={labelOf(CLIENT_STATUSES, r.status)} /> },
      { key: 'createdAt', header: 'Terdaftar', render: (r: any) => <span className="text-xs text-slate-500">{formatDate(r.createdAt)}</span> },
      {
        key: 'actions', header: '', align: 'right' as const,
        render: (r: any) => (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {canManage && <IconButton label="Ubah klien" onClick={() => void openEdit(r)}><Pencil className="h-3.5 w-3.5" /></IconButton>}
            {canManage && <IconButton label="Arsipkan klien" className="hover:!text-red-600" onClick={() => setDeleting(r)}><Trash2 className="h-3.5 w-3.5" /></IconButton>}
          </div>
        ),
      },
    ],
    [canManage],
  )

  return (
    <div>
      <PageHeader
        eyebrow="Operasional"
        title="Klien"
        subtitle="Data perorangan dan badan hukum beserta identitas serta legalitasnya."
        actions={canManage ? <Button onClick={openCreate}><Plus className="h-4 w-4" /> Klien Baru</Button> : undefined}
      />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-4 dark:border-navy-800">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Cari nama, kode, NIK, NPWP, telepon…" className="w-full sm:w-80" />
          <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1) }} className="w-40">
            <option value="">Semua jenis</option>
            {CLIENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="w-40">
            <option value="">Semua status</option>
            {CLIENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
          <span className="ml-auto text-xs text-slate-500">{query.data?.total ?? 0} klien</span>
        </div>
        {query.error && <div className="p-4"><Alert tone="danger">{query.error}</Alert></div>}
        <DataTable
          columns={columns}
          rows={rows}
          loading={query.loading}
          onRowClick={(r) => navigate(`/klien/${r.id}`)}
          empty={<EmptyState title="Belum ada klien" description="Daftarkan klien pertama kantor Anda untuk memulai." action={canManage ? <Button onClick={openCreate}><Plus className="h-4 w-4" /> Klien Baru</Button> : undefined} />}
        />
        <Pagination page={query.data?.page ?? 1} pageSize={query.data?.pageSize ?? 20} total={query.data?.total ?? 0} totalPages={query.data?.totalPages ?? 1} onPage={setPage} />
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Ubah Klien — ${editing.code}` : 'Klien Baru'}
        subtitle="Data klien tersimpan lokal dan tercatat dalam audit log."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={busy}>Batal</Button>
            <Button onClick={save} loading={busy}>Simpan klien</Button>
          </>
        }
      >
        <Tabs
          active={initialTab}
          onChange={setInitialTab}
          tabs={[
            { key: 'utama', label: 'Data Utama' },
            { key: 'identitas', label: 'Identitas', count: form.identities?.length ?? 0 },
            { key: 'badan-hukum', label: 'Badan Hukum' },
            { key: 'catatan', label: 'Catatan Internal' },
          ]}
        />
        <div className="mt-4 space-y-4">
          {initialTab === 'utama' && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Jenis Klien" required>
                  <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                    {CLIENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </Select>
                </Field>
                <Field label="Status">
                  <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {CLIENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </Select>
                </Field>
              </div>
              <Field label={form.type === 'BADAN_HUKUM' ? 'Nama Badan Hukum (sesuai akta)' : 'Nama Lengkap'} required>
                <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="NIK"><Input value={form.nik} onChange={(e) => setForm({ ...form, nik: e.target.value })} inputMode="numeric" /></Field>
                <Field label="NPWP"><Input value={form.npwp} onChange={(e) => setForm({ ...form, npwp: e.target.value })} /></Field>
                {form.type === 'PERORANGAN' && (
                  <>
                    <Field label="Tempat Lahir"><Input value={form.birthPlace} onChange={(e) => setForm({ ...form, birthPlace: e.target.value })} /></Field>
                    <Field label="Tanggal Lahir"><Input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} /></Field>
                    <Field label="Jenis Kelamin">
                      <Select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                        <option value="">Tidak ditentukan</option>
                        {GENDERS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                      </Select>
                    </Field>
                    <Field label="Pekerjaan"><Input value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })} /></Field>
                  </>
                )}
                <Field label="Telepon"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="08xx-xxxx-xxxx" /></Field>
                <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              </div>
              <Field label="Alamat"><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Kelurahan/Desa"><Input value={form.kelurahan} onChange={(e) => setForm({ ...form, kelurahan: e.target.value })} /></Field>
                <Field label="Kecamatan"><Input value={form.kecamatan} onChange={(e) => setForm({ ...form, kecamatan: e.target.value })} /></Field>
                <Field label="Kabupaten/Kota"><Input value={form.kabupaten} onChange={(e) => setForm({ ...form, kabupaten: e.target.value })} /></Field>
                <Field label="Provinsi"><Input value={form.provinsi} onChange={(e) => setForm({ ...form, provinsi: e.target.value })} /></Field>
              </div>
              <Field label="Kode Pos"><Input className="w-32" value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} inputMode="numeric" /></Field>
            </>
          )}

          {initialTab === 'identitas' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500 dark:text-slate-400">Dokumen identitas (KTP, NPWP, paspor, dan lainnya). Berkas scan dapat diunggah melalui menu Dokumen lalu ditautkan di sini.</p>
                <Button variant="secondary" onClick={() => setForm({ ...form, identities: [...form.identities, { ...EMPTY_IDENTITY }] })}>
                  <Plus className="h-4 w-4" /> Tambah
                </Button>
              </div>
              {form.identities.length === 0 ? (
                <EmptyState compact title="Belum ada identitas" description="Tambahkan KTP atau dokumen identitas lainnya." />
              ) : (
                form.identities.map((row: any, idx: number) => (
                  <div key={idx} className="rounded-lg border border-slate-200 p-3 dark:border-navy-800">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Identitas {idx + 1}</span>
                      <IconButton label="Hapus identitas" onClick={() => setForm({ ...form, identities: form.identities.filter((_: any, i: number) => i !== idx) })}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Jenis Dokumen">
                        <Select value={row.docType} onChange={(e) => updateIdentity(idx, { docType: e.target.value })}>
                          {IDENTITY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </Select>
                      </Field>
                      <Field label="Nomor"><Input value={row.number} onChange={(e) => updateIdentity(idx, { number: e.target.value })} /></Field>
                      <Field label="Tanggal Terbit"><Input type="date" value={row.issuedAt} onChange={(e) => updateIdentity(idx, { issuedAt: e.target.value })} /></Field>
                      <Field label="Berlaku Sampai"><Input type="date" value={row.expiresAt} onChange={(e) => updateIdentity(idx, { expiresAt: e.target.value })} /></Field>
                    </div>
                    <Field label="Catatan" className="mt-2"><Input value={row.notes} onChange={(e) => updateIdentity(idx, { notes: e.target.value })} /></Field>
                  </div>
                ))
              )}
            </div>
          )}

          {initialTab === 'badan-hukum' && (
            <div className="space-y-3">
              {form.type !== 'BADAN_HUKUM' && (
                <Alert tone="info">Ubah jenis klien menjadi <b>Badan Hukum</b> pada tab Data Utama untuk mengisi bagian ini.</Alert>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nama Perusahaan" required><Input disabled={form.type !== 'BADAN_HUKUM'} value={form.company.companyName} onChange={(e) => setCompany({ companyName: e.target.value })} /></Field>
                <Field label="Bentuk Badan Hukum">
                  <Select disabled={form.type !== 'BADAN_HUKUM'} value={form.company.legalType} onChange={(e) => setCompany({ legalType: e.target.value })}>
                    {LEGAL_TYPES.map((l) => <option key={l} value={l}>{l}</option>)}
                  </Select>
                </Field>
                <Field label="Nomor Akta Pendirian"><Input disabled={form.type !== 'BADAN_HUKUM'} value={form.company.establishmentDeedNumber} onChange={(e) => setCompany({ establishmentDeedNumber: e.target.value })} /></Field>
                <Field label="Tanggal Akta Pendirian"><Input type="date" disabled={form.type !== 'BADAN_HUKUM'} value={form.company.establishmentDeedDate} onChange={(e) => setCompany({ establishmentDeedDate: e.target.value })} /></Field>
                <Field label="Notaris Pendirian"><Input disabled={form.type !== 'BADAN_HUKUM'} value={form.company.establishmentNotary} onChange={(e) => setCompany({ establishmentNotary: e.target.value })} /></Field>
                <Field label="NPWP Perusahaan"><Input disabled={form.type !== 'BADAN_HUKUM'} value={form.company.companyNpwp} onChange={(e) => setCompany({ companyNpwp: e.target.value })} /></Field>
                <Field label="NIB"><Input disabled={form.type !== 'BADAN_HUKUM'} value={form.company.nib} onChange={(e) => setCompany({ nib: e.target.value })} /></Field>
                <Field label="Kedudukan / Domisili"><Input disabled={form.type !== 'BADAN_HUKUM'} value={form.company.domicile} onChange={(e) => setCompany({ domicile: e.target.value })} /></Field>
              </div>
              <Field label="Pengurus (JSON)" hint='Contoh: [{"nama":"Budi","jabatan":"Direktur"}]'>
                <Textarea disabled={form.type !== 'BADAN_HUKUM'} value={form.company.pengurusJson} onChange={(e) => setCompany({ pengurusJson: e.target.value })} />
              </Field>
              <Field label="Pemegang Saham (JSON)" hint='Contoh: [{"nama":"Budi","saham":60},{"nama":"Ani","saham":40}]'>
                <Textarea disabled={form.type !== 'BADAN_HUKUM'} value={form.company.shareholdersJson} onChange={(e) => setCompany({ shareholdersJson: e.target.value })} />
              </Field>
              <Field label="Catatan Legalitas"><Textarea disabled={form.type !== 'BADAN_HUKUM'} value={form.company.legalityNotes} onChange={(e) => setCompany({ legalityNotes: e.target.value })} /></Field>
            </div>
          )}

          {initialTab === 'catatan' && (
            <Field label="Catatan Internal" hint="Tidak ditampilkan pada dokumen yang dicetak.">
              <Textarea className="min-h-[180px]" value={form.internalNotes} onChange={(e) => setForm({ ...form, internalNotes: e.target.value })} />
            </Field>
          )}

          {formError && <Alert tone="danger">{formError}</Alert>}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="Arsipkan klien?"
        description={<>Klien <b>{deleting?.fullName}</b> akan dihapus secara lunak. Riwayat transaksi dan akta tetap tersimpan untuk audit. Klien dengan akta terkait tidak dapat diarsipkan.</>}
        confirmLabel="Ya, arsipkan"
        danger
        loading={busy}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </div>
  )

  function updateIdentity(index: number, patch: Record<string, any>) {
    setForm((prev: any) => ({
      ...prev,
      identities: prev.identities.map((i: any, idx: number) => (idx === index ? { ...i, ...patch } : i)),
    }))
  }

  function setCompany(patch: Record<string, any>) {
    setForm((prev: any) => ({ ...prev, company: { ...prev.company, ...patch } }))
  }
}
