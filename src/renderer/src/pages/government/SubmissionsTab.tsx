import { useEffect, useMemo, useState } from 'react'
import { Eye, Plus } from 'lucide-react'
import { call, useDebounced, useQuery } from '@/api'
import {
  Alert, Badge, Button, Card, DataTable, EmptyState, Field, IconButton, Input, Modal,
  Pagination, SearchInput, Select, Textarea, useToast,
} from '@/components/ui'
import {
  GOVERNMENT_OFFICIAL_PORTALS, GOVERNMENT_STATUSES, GOVERNMENT_VIEW_CODES, GOVERNMENT_VIEW_GROUPS,
  governmentAgencyLabel, governmentStatusLabel,
} from '@shared/government'
import { formatDateTime } from '@shared/format'
import { DataFieldsEditor, GovStatusBadge, PortalAnchor, type FieldTemplate } from './parts'

type Agency = 'AHU' | 'BPN'

interface ServiceRow {
  id: string
  code: string
  name: string
  description: string | null
  category: string
  agency: Agency
  portalUrl: string
  checklist: string[]
  fields: FieldTemplate[]
  submissionCount: number
}

const emptyForm = {
  serviceId: '',
  title: '',
  description: '',
  clientId: '',
  transactionId: '',
  data: {} as Record<string, string>,
}

export function SubmissionsTab({
  agency, view, canManage, onOpen,
}: {
  agency: Agency
  view: 'PERSIAPAN' | 'BERJALAN'
  canManage: boolean
  onOpen: (id: string) => void
}) {
  const toast = useToast()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [activeView, setActiveView] = useState<string>(view)
  const [status, setStatus] = useState('')
  const [serviceId, setServiceId] = useState('')
  const debounced = useDebounced(search)

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<any>(emptyForm)
  const [errors, setErrors] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const services = useQuery<ServiceRow[]>('government.services', { agency })
  const list = useQuery<any>('government.submissions.list', {
    page,
    pageSize: 20,
    agency,
    view: activeView,
    internalStatus: status || undefined,
    serviceId: serviceId || undefined,
    search: debounced,
  })
  const clients = useQuery<any[]>('clients.options', {}, { enabled: createOpen })
  const transactions = useQuery<any[]>('transactions.options', {}, { enabled: createOpen })

  useEffect(() => {
    setActiveView(view)
    setPage(1)
  }, [view, agency])

  const selected: ServiceRow | undefined = useMemo(
    () => (services.data ?? []).find((s) => s.id === form.serviceId),
    [services.data, form.serviceId],
  )

  function openCreate() {
    const first = services.data?.[0]
    setForm({ ...emptyForm, serviceId: first?.id ?? '', data: {} })
    setErrors(null)
    setCreateOpen(true)
  }

  async function submit() {
    if (!form.serviceId) return setErrors('Pilih layanan yang akan diajukan.')
    if (!form.title?.trim()) return setErrors('Perihal pengajuan wajib diisi.')
    setBusy(true)
    setErrors(null)
    try {
      const created = await call<any>('government.submissions.create', {
        agency,
        serviceId: form.serviceId,
        title: form.title.trim(),
        description: form.description || null,
        clientId: form.clientId || null,
        transactionId: form.transactionId || null,
        data: form.data ?? {},
      })
      toast.success(`Pengajuan ${created.number} tersimpan sebagai draft internal.`)
      setCreateOpen(false)
      onOpen(created.id)
    } catch (err) {
      setErrors((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const agencyLabel = governmentAgencyLabel(agency)
  const portalUrl = GOVERNMENT_OFFICIAL_PORTALS[agency]

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <SearchInput
          value={search}
          onChange={(v) => { setSearch(v); setPage(1) }}
          placeholder={`Cari nomor, perihal, klien, atau nomor resmi ${agencyLabel}…`}
          className="w-full sm:w-80"
        />
        <Select value={activeView} onChange={(e) => { setActiveView(e.target.value); setStatus(''); setPage(1) }} className="w-full sm:w-44">
          {GOVERNMENT_VIEW_CODES.map((v) => <option key={v} value={v}>{GOVERNMENT_VIEW_GROUPS[v].label}</option>)}
        </Select>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="w-full sm:w-44">
          <option value="">Semua status internal</option>
          {GOVERNMENT_STATUSES.map((s) => <option key={s} value={s}>{governmentStatusLabel(s)}</option>)}
        </Select>
        <Select value={serviceId} onChange={(e) => { setServiceId(e.target.value); setPage(1) }} className="w-full sm:w-56">
          <option value="">Semua layanan</option>
          {(services.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs text-slate-500 sm:inline dark:text-slate-400">{list.data?.total ?? 0} pengajuan</span>
          <PortalAnchor url={portalUrl} label={`Portal ${agencyLabel}`} className="!py-1.5 text-xs" />
          {canManage && (
            <Button onClick={openCreate} disabled={!services.data?.length}>
              <Plus className="h-4 w-4" /> Buat Pengajuan
            </Button>
          )}
        </div>
      </Card>

      {list.error && <Alert tone="danger" title="Gagal memuat pengajuan">{list.error}</Alert>}

      <Card className="overflow-hidden">
        <DataTable
          rows={list.data?.items ?? []}
          loading={list.loading}
          onRowClick={(r) => onOpen(r.id)}
          columns={[
            { key: 'number', header: 'Nomor', width: 130, render: (r) => <span className="font-mono text-xs font-semibold text-navy-900 dark:text-slate-100">{r.number}</span> },
            {
              key: 'title', header: 'Perihal & layanan',
              render: (r) => (
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.title}</p>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{r.service?.name}</p>
                </div>
              ),
            },
            { key: 'client', header: 'Klien', render: (r) => r.client ? <span className="text-xs">{r.client.fullName}</span> : <span className="text-slate-400">—</span> },
            { key: 'internalStatus', header: 'Internal', render: (r) => <GovStatusBadge status={r.internalStatus} /> },
            { key: 'officialStatus', header: 'Status resmi', render: (r) => r.officialStatus || <span className="text-slate-400">Belum dicatat</span> },
            { key: 'externalRef', header: 'Nomor resmi', render: (r) => r.externalRef ? <Badge tone="gold">{r.externalRef}</Badge> : <span className="text-slate-400">—</span> },
            { key: '_count', header: 'Berkas', align: 'right', render: (r) => <span className="tabular-nums text-xs">{r._count?.files ?? 0}</span> },
            { key: 'createdAt', header: 'Dibuat', render: (r) => <span className="text-[11px] text-slate-500">{formatDateTime(r.createdAt)}</span> },
            {
              key: 'actions', header: '', align: 'right', width: 60,
              render: (r) => (
                <IconButton label="Buka kartu pengajuan" onClick={(e) => { e.stopPropagation(); onOpen(r.id) }}>
                  <Eye className="h-4 w-4" />
                </IconButton>
              ),
            },
          ]}
          empty={
            <EmptyState
              title={debounced || status || serviceId ? 'Tidak ada pengajuan yang cocok' : `Belum ada pengajuan ${agencyLabel}`}
              description={canManage
                ? 'Buat pengajuan untuk menyiapkan data, melampirkan berkas, lalu mencatat nomor dan status dari portal resmi.'
                : 'Pengajuan yang dibuat staf akan tampil di sini.'}
              action={canManage ? <Button onClick={openCreate}><Plus className="h-4 w-4" /> Buat Pengajuan</Button> : undefined}
            />
          }
        />
        {list.data && (
          <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} totalPages={list.data.totalPages} onPage={setPage} />
        )}
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={`Buat Pengajuan ${agencyLabel}`}
        subtitle="Data disiapkan lokal. Pengisian dan pengajuan tetap dilakukan operator pada portal resmi."
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={busy}>Batal</Button>
            <Button onClick={() => void submit()} loading={busy}>Simpan Draft</Button>
          </>
        }
      >
        <div className="space-y-4">
          {errors && <Alert tone="danger">{errors}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Layanan" required className="sm:col-span-2">
              <Select
                value={form.serviceId}
                onChange={(e) => setForm({ ...form, serviceId: e.target.value, data: {} })}
              >
                <option value="">Pilih layanan…</option>
                {(services.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            {selected && (
              <div className="rounded-lg border border-slate-200 px-3 py-2 text-[11px] leading-relaxed text-slate-600 sm:col-span-2 dark:border-navy-800 dark:text-slate-300">
                <p className="font-semibold text-navy-900 dark:text-slate-100">Checklist persiapan</p>
                <ul className="mt-1 grid gap-0.5 sm:grid-cols-2">
                  {selected.checklist.map((c) => <li key={c}>• {c}</li>)}
                </ul>
              </div>
            )}
            <Field label="Perihal pengajuan" required className="sm:col-span-2">
              <Input value={form.title} maxLength={300} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="mis. Pengesahan pendirian PT Contoh Mandiri" />
            </Field>
            <Field label="Klien">
              <Select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
                <option value="">Tidak ditautkan</option>
                {(clients.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.code} — {c.fullName}</option>)}
              </Select>
            </Field>
            <Field label="Transaksi">
              <Select value={form.transactionId} onChange={(e) => setForm({ ...form, transactionId: e.target.value })}>
                <option value="">Tidak ditautkan</option>
                {(transactions.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.code} — {t.title}</option>)}
              </Select>
            </Field>
            <Field label="Uraian" className="sm:col-span-2">
              <Textarea value={form.description} maxLength={2000} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold text-navy-900 dark:text-slate-100">Data isian portal</p>
            {selected ? (
              <DataFieldsEditor fields={selected.fields} values={form.data} onChange={(data) => setForm({ ...form, data })} />
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">Pilih layanan terlebih dahulu.</p>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}
