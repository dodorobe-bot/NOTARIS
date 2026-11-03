import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, CalendarClock, FileSignature, FolderOpen, Pencil, Receipt, Trash2, Upload,
} from 'lucide-react'
import { call, useQuery } from '@/api'
import type { SessionInfo } from '@/types'
import {
  Alert, Button, Card, ConfirmDialog, DataTable, DescriptionList, EmptyState, Field, Modal,
  PageHeader, SectionTitle, Select, StatusBadge, Stepper, Tabs, Textarea, useToast, Badge,
} from '@/components/ui'
import {
  PRIORITIES, TRANSACTION_TYPES, WORKFLOW_LABELS, WORKFLOW_STATUSES, WORKFLOW_TRANSITIONS,
  labelOf,
} from '@shared/constants'
import { formatDate, formatDateTime } from '@shared/format'

const STEPS = WORKFLOW_STATUSES.filter((s) => s !== 'BATAL').map((s) => ({ status: s, label: WORKFLOW_LABELS[s] }))

export function TransactionDetail({ session }: { session: SessionInfo }) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const [tab, setTab] = useState('ringkasan')
  const [statusOpen, setStatusOpen] = useState(false)
  const [target, setTarget] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const { data, loading, error, reload } = useQuery<any>('transactions.get', { id })

  if (loading && !data) return <div className="flex h-64 items-center justify-center text-sm text-slate-500">Memuat transaksi…</div>
  if (error || !data) {
    return (
      <div className="space-y-4">
        <Button variant="secondary" onClick={() => navigate('/transaksi')}><ArrowLeft className="h-4 w-4" /> Kembali</Button>
        <Alert tone="danger" title="Transaksi tidak dapat dimuat">{error ?? 'Data tidak ditemukan.'}</Alert>
      </div>
    )
  }

  const trx = data
  const canManage = session.permissions.includes('transactions.manage')
  const transitions: string[] = WORKFLOW_TRANSITIONS[trx.status] ?? []
  const finite = ['SELESAI', 'BATAL'].includes(trx.status)

  async function changeStatus() {
    if (!target) return toast.error('Pilih status tujuan.')
    if (target === 'BATAL' && !note.trim()) return toast.error('Alasan pembatalan wajib diisi.')
    setBusy(true)
    try {
      await call('transactions.changeStatus', { id, status: target, note: note || null })
      toast.success(`Status transaksi diubah menjadi ${WORKFLOW_LABELS[target]}.`)
      setStatusOpen(false)
      setTarget('')
      setNote('')
      void reload(true)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await call('transactions.delete', { id })
      toast.success('Transaksi berhasil dihapus (soft delete) dan tetap tercatat pada audit.')
      navigate('/transaksi')
    } catch (err) {
      toast.error((err as Error).message)
      setDeleteOpen(false)
    } finally {
      setBusy(false)
    }
  }

  async function openDocument(docId: string) {
    try {
      await call('documents.openExternal', { id: docId })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <div className="space-y-5">
      <Link to="/transaksi" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-navy-800 dark:text-slate-400 dark:hover:text-slate-200">
        <ArrowLeft className="h-3.5 w-3.5" /> Daftar Transaksi
      </Link>

      <PageHeader
        eyebrow={<span className="font-mono">{trx.code}</span>}
        title={trx.title}
        subtitle={`${trx.client?.fullName ?? '—'} · ${labelOf(TRANSACTION_TYPES, trx.type)}${trx.serviceType ? ` · ${trx.serviceType}` : ''}`}
        actions={
          <>
            <StatusBadge status={trx.status} label={WORKFLOW_LABELS[trx.status]} />
            {canManage && !finite && <Button variant="gold" onClick={() => { setStatusOpen(true); setNote('') }}>Ubah Status</Button>}
            {canManage && !finite && (
              <Button variant="secondary" onClick={() => navigate(`/transaksi?edit=${trx.id}`)}>
                <Pencil className="h-4 w-4" /> Ubah
              </Button>
            )}
            {canManage && <Button variant="ghost" className="!text-red-600" onClick={() => setDeleteOpen(true)}><Trash2 className="h-4 w-4" /> Hapus</Button>}
          </>
        }
      />

      {trx.status === 'BATAL' && <Alert tone="danger" title="Transaksi dibatalkan">Transaksi ini ditutup dengan status batal. Riwayat dan alasannya tercatat pada audit log.</Alert>}

      <div className="flex flex-wrap gap-2">
        {session.permissions.includes('deeds.manage') && (
          <Button variant="secondary" className="!py-1.5 text-xs" onClick={() => navigate(`/akta?new=1&transactionId=${trx.id}&clientId=${trx.clientId}`)}>
            <FileSignature className="h-3.5 w-3.5" /> Buat Akta
          </Button>
        )}
        {session.permissions.includes('documents.manage') && (
          <Button variant="secondary" className="!py-1.5 text-xs" onClick={() => navigate(`/dokumen?upload=1&transactionId=${trx.id}&clientId=${trx.clientId}`)}>
            <Upload className="h-3.5 w-3.5" /> Unggah Dokumen
          </Button>
        )}
        {session.permissions.includes('finance.manage') && (
          <Button variant="secondary" className="!py-1.5 text-xs" onClick={() => navigate(`/keuangan?new=1&transactionId=${trx.id}&clientId=${trx.clientId}`)}>
            <Receipt className="h-3.5 w-3.5" /> Buat Invoice
          </Button>
        )}
      </div>

      <Card className="p-5">
        <SectionTitle title="Tahapan Workflow" subtitle="Status tidak dapat melompati tahapan; setiap perubahan dicatat dengan pengguna, waktu, dan catatan." />
        {trx.status === 'BATAL' ? (
          <Alert tone="danger">Transaksi berhenti pada tahap pembatalan.</Alert>
        ) : (
          <Stepper steps={STEPS} current={trx.status} />
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 pt-3">
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { key: 'ringkasan', label: 'Ringkasan' },
              { key: 'pihak', label: 'Pihak', count: trx.parties?.length ?? 0 },
              { key: 'dokumen', label: 'Dokumen', count: trx.documents?.length ?? 0 },
              { key: 'akta', label: 'Akta', count: trx.deeds?.length ?? 0 },
              { key: 'invoice', label: 'Invoice', count: trx.invoices?.length ?? 0 },
              { key: 'riwayat', label: 'Riwayat', count: trx.workflow?.length ?? 0 },
            ]}
          />
        </div>

        {tab === 'ringkasan' && (
          <div className="space-y-6 p-5">
            <DescriptionList
              columns={3}
              items={[
                { label: 'Kode Transaksi', value: <span className="font-mono text-xs">{trx.code}</span> },
                { label: 'Jenis', value: labelOf(TRANSACTION_TYPES, trx.type) },
                { label: 'Layanan', value: trx.serviceType ?? '—' },
                { label: 'Klien', value: <Link className="text-gold-600 hover:underline dark:text-gold-400" to={`/klien/${trx.clientId}`}>{trx.client?.fullName}</Link> },
                { label: 'Prioritas', value: <Badge tone={trx.priority === 'TINGGI' ? 'red' : 'neutral'}>{labelOf(PRIORITIES, trx.priority)}</Badge> },
                { label: 'Penanggung Jawab', value: trx.assignedTo?.fullName ?? '—' },
                { label: 'Dibuat Oleh', value: trx.createdBy?.fullName ?? '—' },
                { label: 'Dibuat', value: formatDateTime(trx.createdAt) },
                { label: 'Ditutup', value: trx.closedAt ? formatDateTime(trx.closedAt) : '—' },
              ]}
            />
            {trx.description && (
              <div>
                <SectionTitle title="Uraian" />
                <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-relaxed dark:bg-navy-900">{trx.description}</p>
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-3">
              <MiniList
                title="Jadwal Terkait"
                icon={<CalendarClock className="h-3.5 w-3.5" />}
                items={(trx.appointments ?? []).map((a: any) => ({ id: a.id, text: `${a.title} · ${formatDateTime(a.startAt)}` }))}
                empty="Tidak ada jadwal"
              />
              <MiniList
                title="Tenggat Aktif"
                icon={<CalendarClock className="h-3.5 w-3.5" />}
                items={(trx.deadlines ?? []).map((d: any) => ({ id: d.id, text: `${d.title} · ${formatDate(d.dueDate)}` }))}
                empty="Tidak ada tenggat"
              />
              <MiniList
                title="Tugas"
                icon={<FileSignature className="h-3.5 w-3.5" />}
                items={(trx.tasks ?? []).map((t: any) => ({ id: t.id, text: `${t.title} · ${t.status}` }))}
                empty="Tidak ada tugas"
              />
            </div>
          </div>
        )}

        {tab === 'pihak' && (
          <DataTable
            rows={trx.parties ?? []}
            virtualize
            columns={[
              { key: 'role', header: 'Peran' },
              { key: 'name', header: 'Nama' },
              { key: 'nik', header: 'NIK', render: (r) => <span className="font-mono text-xs">{r.nik ?? '—'}</span> },
              { key: 'phone', header: 'Telepon', render: (r) => r.phone ?? '—' },
              { key: 'address', header: 'Alamat', render: (r) => r.address ?? '—' },
            ]}
            empty={<EmptyState compact title="Belum ada pihak" description="Tambahkan melalui tombol Ubah." />}
          />
        )}

        {tab === 'dokumen' && (
          <DataTable
            rows={trx.documents ?? []}
            virtualize
            columns={[
              { key: 'title', header: 'Judul' },
              { key: 'category', header: 'Kategori', render: (r) => r.category?.name ?? '—' },
              { key: 'fileName', header: 'Berkas', render: (r) => <span className="font-mono text-[11px]">{r.fileName}</span> },
              { key: 'createdAt', header: 'Diunggah', render: (r) => formatDateTime(r.createdAt) },
              {
                key: 'action', header: '', align: 'right',
                render: (r) => <Button variant="ghost" className="!py-1 text-xs" onClick={() => void openDocument(r.id)}><FolderOpen className="h-3.5 w-3.5" /> Buka</Button>,
              },
            ]}
            empty={<EmptyState compact title="Belum ada dokumen" description="Unggah dokumen persyaratan melalui tombol di atas." />}
          />
        )}

        {tab === 'akta' && (
          <DataTable
            rows={trx.deeds ?? []}
            virtualize
            onRowClick={(r) => navigate(`/akta/${r.id}`)}
            columns={[
              { key: 'deedNumber', header: 'Nomor Akta', render: (r) => <span className="font-mono text-xs">{r.deedNumber}</span> },
              { key: 'type', header: 'Jenis', render: (r) => r.deedType?.name ?? '—' },
              { key: 'deedDate', header: 'Tanggal', render: (r) => formatDate(r.deedDate) },
              { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            ]}
            empty={<EmptyState compact title="Belum ada akta" />}
          />
        )}

        {tab === 'invoice' && (
          <DataTable
            rows={trx.invoices ?? []}
            virtualize
            onRowClick={(r) => navigate(`/keuangan/invoice/${r.id}`)}
            columns={[
              { key: 'number', header: 'Invoice', render: (r) => <span className="font-mono text-xs">{r.number}</span> },
              { key: 'issueDate', header: 'Terbit', render: (r) => formatDate(r.issueDate) },
              { key: 'total', header: 'Total', align: 'right', render: (r) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(r.total) },
              { key: 'paidAmount', header: 'Dibayar', align: 'right', render: (r) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(r.paidAmount) },
              { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            ]}
            empty={<EmptyState compact title="Belum ada invoice" />}
          />
        )}

        {tab === 'riwayat' && (
          <div className="p-5">
            <ol className="relative space-y-4 border-l border-slate-200 pl-5 dark:border-navy-800">
              {(trx.workflow ?? []).map((w: any) => (
                <li key={w.id} className="relative">
                  <span className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full bg-gold-500 ring-4 ring-white dark:ring-[#0E1E35]" />
                  <p className="text-sm font-semibold text-navy-900 dark:text-slate-100">
                    {w.fromStatus ? `${WORKFLOW_LABELS[w.fromStatus] ?? w.fromStatus} → ` : ''}{WORKFLOW_LABELS[w.toStatus] ?? w.toStatus}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {formatDateTime(w.createdAt)} · {w.byUser?.fullName ?? 'Sistem'}
                  </p>
                  {w.note && <p className="mt-1 rounded bg-slate-50 px-2 py-1 text-xs dark:bg-navy-900">{w.note}</p>}
                </li>
              ))}
              {(trx.workflow ?? []).length === 0 && <EmptyState compact title="Belum ada riwayat" />}
            </ol>
          </div>
        )}
      </Card>

      <Modal
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        title="Ubah Status Transaksi"
        subtitle={`Status saat ini: ${WORKFLOW_LABELS[trx.status]}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setStatusOpen(false)} disabled={busy}>Batal</Button>
            <Button onClick={() => void changeStatus()} loading={busy} disabled={!target}>Simpan Status</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Status Tujuan" required>
            <Select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Pilih status…</option>
              {transitions.map((s) => <option key={s} value={s}>{WORKFLOW_LABELS[s] ?? s}</option>)}
            </Select>
          </Field>
          <Field label="Catatan" hint={target === 'BATAL' ? 'Alasan pembatalan wajib diisi.' : 'Opsional, tersimpan pada riwayat dan audit.'} required={target === 'BATAL'}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Catatan perubahan status…" />
          </Field>
          {transitions.length === 0 && <Alert tone="warn">Tidak ada transisi status yang tersedia.</Alert>}
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void remove()}
        loading={busy}
        danger
        title="Hapus transaksi?"
        confirmLabel="Hapus Transaksi"
        description={<span>Transaksi <b>{trx.code}</b> akan dihapus secara lunak. Transaksi yang sudah memiliki akta atau invoice tidak dapat dihapus. Data tetap tercatat untuk audit.</span>}
      />
    </div>
  )
}

function MiniList({ title, icon, items, empty }: { title: string; icon: ReactNode; items: { id: string; text: string }[]; empty: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-navy-800">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{icon}{title}</p>
      {items.length === 0 ? <p className="text-xs text-slate-400">{empty}</p> : (
        <ul className="space-y-1 text-xs">
          {items.slice(0, 5).map((it) => <li key={it.id} className="truncate text-navy-800 dark:text-slate-300">{it.text}</li>)}
        </ul>
      )}
    </div>
  )
}
