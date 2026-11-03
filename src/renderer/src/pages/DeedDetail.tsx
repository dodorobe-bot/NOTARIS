import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Archive, BookOpen, FileDown, FileSignature, FolderOpen, Pencil, Stamp,
} from 'lucide-react'
import { call, useQuery } from '@/api'
import type { SessionInfo } from '@/types'
import {
  Alert, Badge, Button, Card, DataTable, DescriptionList, EmptyState, Field, Modal,
  PageHeader, SectionTitle, Select, StatusBadge, Stepper, Tabs, Textarea, useToast,
} from '@/components/ui'
import {
  DEED_STATUS_LABELS, DEED_STATUS_TRANSITIONS,
} from '@shared/constants'
import { formatDateLong, formatDateTime } from '@shared/format'

const STEPS = ['DRAFT', 'REVIEW', 'APPROVED', 'SIGNED', 'REGISTERED', 'ARCHIVED'].map((s) => ({
  status: s, label: DEED_STATUS_LABELS[s],
}))
const APPROVAL_STATUSES = ['APPROVED', 'SIGNED', 'REGISTERED', 'ARCHIVED']

function parseWitnesses(json: string | null | undefined): string[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    return parsed.map((w: any) => (typeof w === 'string' ? w : w?.nama ?? w?.name ?? '')).filter(Boolean)
  } catch {
    return []
  }
}

export function DeedDetail({ session }: { session: SessionInfo }) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const [tab, setTab] = useState('ringkasan')
  const [statusOpen, setStatusOpen] = useState(false)
  const [target, setTarget] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [generating, setGenerating] = useState<'draft' | 'minuta' | null>(null)
  const [snapshot, setSnapshot] = useState<any | null>(null)

  const { data, loading, error, reload } = useQuery<any>('deeds.get', { id })
  const revisions = useQuery<any[]>('deeds.revisions', { id }, { enabled: tab === 'revisi' })

  if (loading && !data) return <div className="flex h-64 items-center justify-center text-sm text-slate-500">Memuat akta…</div>
  if (error || !data) {
    return (
      <div className="space-y-4">
        <Button variant="secondary" onClick={() => navigate('/akta')}><ArrowLeft className="h-4 w-4" /> Kembali</Button>
        <Alert tone="danger" title="Akta tidak dapat dimuat">{error ?? 'Data tidak ditemukan.'}</Alert>
      </div>
    )
  }

  const deed = data
  const canManage = session.permissions.includes('deeds.manage')
  const canApprove = session.permissions.includes('deeds.approve')
  const editable = canManage && ['DRAFT', 'REVIEW'].includes(deed.status)
  const allTransitions: string[] = DEED_STATUS_TRANSITIONS[deed.status] ?? []
  const transitions = allTransitions.filter((s) => canApprove || !APPROVAL_STATUSES.includes(s))
  const witnesses = parseWitnesses(deed.witnessesJson)

  async function changeStatus() {
    if (!target) return toast.error('Pilih status tujuan.')
    if (target === 'CANCELLED' && !note.trim()) return toast.error('Alasan pembatalan wajib diisi.')
    setBusy(true)
    try {
      const updated = await call<any>('deeds.changeStatus', { id, status: target, note: note || null })
      toast.success(
        updated.repertoriumCreated
          ? 'Status akta diperbarui dan akta tercatat otomatis pada repertorium.'
          : `Status akta diubah menjadi ${DEED_STATUS_LABELS[target]}.`,
      )
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

  async function generate(variant: 'draft' | 'minuta') {
    setGenerating(variant)
    try {
      const result = await call<any>('deeds.generateDocument', { id, variant })
      toast.success(`${variant === 'minuta' ? 'Minuta' : 'Draft'} DOCX ${result.fileName} berhasil dibuat dari template.`)
      void reload(true)
      setTab('dokumen')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setGenerating(null)
    }
  }

  async function openDocument(docId: string) {
    try {
      await call('documents.openExternal', { id: docId })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function registerRepertorium() {
    setBusy(true)
    try {
      const created = await call<any>('deeds.repertorium.register', { deedId: deed.id, notes: 'Pencatatan manual dari halaman akta' })
      toast.success(`Akta tercatat pada repertorium nomor ${created.number}/${created.year}.`)
      void reload(true)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <Link to="/akta" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-navy-800 dark:text-slate-400 dark:hover:text-slate-200">
        <ArrowLeft className="h-3.5 w-3.5" /> Daftar Akta
      </Link>

      <PageHeader
        eyebrow={<span className="font-mono">{deed.deedNumber}</span>}
        title={deed.title ?? deed.deedType?.name}
        subtitle={`${deed.deedType?.name} · ${deed.client?.fullName} · ${formatDateLong(deed.deedDate)}`}
        actions={
          <>
            <StatusBadge status={deed.status} label={DEED_STATUS_LABELS[deed.status]} />
            {editable && <Button variant="secondary" onClick={() => navigate(`/akta?edit=${deed.id}`)}><Pencil className="h-4 w-4" /> Ubah</Button>}
            {canManage && transitions.length > 0 && (
              <Button variant="gold" onClick={() => { setStatusOpen(true); setNote('') }}>Ubah Status</Button>
            )}
            {canManage && (
              <Button variant="secondary" loading={generating === 'draft'} onClick={() => void generate('draft')}>
                <FileDown className="h-4 w-4" /> Draft DOCX
              </Button>
            )}
            {canManage && (
              <Button variant="secondary" loading={generating === 'minuta'} onClick={() => void generate('minuta')}>
                <FileSignature className="h-4 w-4" /> Minuta DOCX
              </Button>
            )}
          </>
        }
      />

      {deed.status === 'CANCELLED' && <Alert tone="danger" title="Akta dibatalkan">Akta ini dibatalkan. Alasan dan riwayat perubahan tercatat pada audit log.</Alert>}
      {['SIGNED', 'REGISTERED', 'ARCHIVED'].includes(deed.status) && (
        <Alert tone="info" title="Isi akta terkunci">Akta telah ditandatangani/dicatat sehingga isi tidak dapat diubah. Perubahan hanya melalui catatan resmi yang tercatat.</Alert>
      )}

      <Card className="p-5">
        <SectionTitle title="Tahapan Akta" subtitle="Draft → Review → Disetujui → Ditandatangani → Tercatat → Diarsipkan" />
        {deed.status === 'CANCELLED' ? <Alert tone="danger">Akta berhenti pada tahap pembatalan.</Alert> : <Stepper steps={STEPS} current={deed.status} />}
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 pt-3">
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { key: 'ringkasan', label: 'Ringkasan' },
              { key: 'isi', label: 'Isi Akta' },
              { key: 'pihak', label: 'Pihak', count: deed.parties?.length ?? 0 },
              { key: 'revisi', label: 'Revisi', count: deed.revisions?.length ?? 0 },
              { key: 'dokumen', label: 'Dokumen', count: deed.documents?.length ?? 0 },
              { key: 'riwayat', label: 'Riwayat', count: deed.workflow?.length ?? 0 },
              { key: 'pencatatan', label: 'Pencatatan' },
            ]}
          />
        </div>

        {tab === 'ringkasan' && (
          <div className="space-y-6 p-5">
            <DescriptionList
              columns={3}
              items={[
                { label: 'Nomor Akta', value: <span className="font-mono text-xs">{deed.deedNumber}</span> },
                { label: 'Tanggal Akta', value: formatDateLong(deed.deedDate) },
                { label: 'Jenis Akta', value: deed.deedType?.name ?? '—' },
                { label: 'Kategori', value: <Badge tone={deed.deedType?.category === 'PPAT' ? 'blue' : 'gold'}>{deed.deedType?.category}</Badge> },
                { label: 'Klien', value: <Link className="text-gold-600 hover:underline dark:text-gold-400" to={`/klien/${deed.clientId}`}>{deed.client?.fullName}</Link> },
                { label: 'Transaksi', value: deed.transaction ? <Link className="text-gold-600 hover:underline dark:text-gold-400" to={`/transaksi/${deed.transaction.id}`}>{deed.transaction.code}</Link> : '—' },
                { label: 'Notaris/PPAT', value: deed.notary?.fullName ?? <span className="text-amber-600">Belum ditetapkan</span> },
                { label: 'Penyusun Draft', value: deed.draftMaker?.fullName ?? '—' },
                { label: 'Ditandatangani', value: deed.signedAt ? formatDateTime(deed.signedAt) : '—' },
              ]}
            />
            {deed.notes && (
              <div>
                <SectionTitle title="Catatan Internal" />
                <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm dark:bg-navy-900">{deed.notes}</p>
              </div>
            )}
            {witnesses.length > 0 && (
              <div>
                <SectionTitle title="Saksi" />
                <div className="flex flex-wrap gap-2">{witnesses.map((w) => <Badge key={w} tone="neutral">{w}</Badge>)}</div>
              </div>
            )}
          </div>
        )}

        {tab === 'isi' && (
          <div className="space-y-5 p-5 text-sm">
            {[
              { title: 'Penghadap', value: deed.penghadap },
              { title: 'Komparisi', value: deed.komparisi },
              { title: 'Premis', value: deed.premis },
              { title: 'Isi Akta', value: deed.isi },
              { title: 'Penutup', value: deed.penutup },
            ].map((block) => (
              <section key={block.title}>
                <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-gold-700 dark:text-gold-400">{block.title}</h3>
                <p className="whitespace-pre-wrap leading-relaxed text-navy-800 dark:text-slate-200">{block.value || <span className="text-slate-400">Belum diisi.</span>}</p>
              </section>
            ))}
          </div>
        )}

        {tab === 'pihak' && (
          <DataTable
            rows={deed.parties ?? []}
            virtualize
            columns={[
              { key: 'role', header: 'Peran' },
              { key: 'name', header: 'Nama' },
              { key: 'nik', header: 'NIK', render: (r) => <span className="font-mono text-xs">{r.nik ?? '—'}</span> },
              { key: 'address', header: 'Alamat', render: (r) => r.address ?? '—' },
            ]}
            empty={<EmptyState compact title="Belum ada pihak" />}
          />
        )}

        {tab === 'revisi' && (
          <div className="p-5">
            <Alert tone="info" title="Riwayat revisi tidak dapat dihapus">Setiap penyimpanan perubahan draft menyimpan snapshot isi sebelumnya beserta pengguna dan waktunya.</Alert>
            <div className="mt-3">
              <DataTable
                rows={revisions.data ?? []}
                virtualize
                loading={revisions.loading}
                columns={[
                  { key: 'revisionNo', header: 'Revisi', render: (r) => <b>#{r.revisionNo}</b> },
                  { key: 'createdAt', header: 'Waktu', render: (r) => formatDateTime(r.createdAt) },
                  { key: 'changeNote', header: 'Catatan', render: (r) => r.changeNote ?? '—' },
                  {
                    key: 'action', header: '', align: 'right',
                    render: (r) => <Button variant="ghost" className="!py-1 text-xs" onClick={() => setSnapshot(r.snapshot ?? {})}>Lihat Snapshot</Button>,
                  },
                ]}
                empty={<EmptyState compact title="Belum ada revisi" description="Revisi tercatat saat draft diubah." />}
              />
            </div>
          </div>
        )}

        {tab === 'dokumen' && (
          <div className="space-y-3 p-3">
            {canManage && (
              <div className="flex flex-wrap gap-2 px-2">
                <Button variant="secondary" className="!py-1.5 text-xs" loading={generating === 'draft'} onClick={() => void generate('draft')}>
                  <FileDown className="h-3.5 w-3.5" /> Buat / Perbarui Draft DOCX
                </Button>
                <Button variant="secondary" className="!py-1.5 text-xs" loading={generating === 'minuta'} onClick={() => void generate('minuta')}>
                  <FileSignature className="h-3.5 w-3.5" /> Buat / Perbarui Minuta DOCX
                </Button>
              </div>
            )}
            <DataTable
              rows={deed.documents ?? []}
              virtualize
              columns={[
                { key: 'title', header: 'Judul' },
                { key: 'category', header: 'Kategori', render: (r) => r.category?.name ?? '—' },
                { key: 'version', header: 'Versi', render: (r) => <Badge tone="neutral">v{r.version}</Badge> },
                { key: 'fileName', header: 'Berkas', render: (r) => <span className="font-mono text-[11px]">{r.fileName}</span> },
                { key: 'createdAt', header: 'Dibuat', render: (r) => formatDateTime(r.createdAt) },
                {
                  key: 'action', header: '', align: 'right',
                  render: (r) => <Button variant="ghost" className="!py-1 text-xs" onClick={() => void openDocument(r.id)}><FolderOpen className="h-3.5 w-3.5" /> Buka</Button>,
                },
              ]}
              empty={<EmptyState compact title="Belum ada dokumen akta" description="Buat draft dari template DOCX atau unggah melalui menu Dokumen." />}
            />
          </div>
        )}

        {tab === 'riwayat' && (
          <div className="p-5">
            <ol className="relative space-y-4 border-l border-slate-200 pl-5 dark:border-navy-800">
              {(deed.workflow ?? []).map((w: any) => (
                <li key={w.id} className="relative">
                  <span className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full bg-gold-500 ring-4 ring-white dark:ring-[#0E1E35]" />
                  <p className="text-sm font-semibold text-navy-900 dark:text-slate-100">
                    {w.fromStatus ? `${DEED_STATUS_LABELS[w.fromStatus] ?? w.fromStatus} → ` : ''}{DEED_STATUS_LABELS[w.toStatus] ?? w.toStatus}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{formatDateTime(w.createdAt)} · {w.byUser?.fullName ?? 'Sistem'}</p>
                  {w.note && <p className="mt-1 rounded bg-slate-50 px-2 py-1 text-xs dark:bg-navy-900">{w.note}</p>}
                </li>
              ))}
              {(deed.workflow ?? []).length === 0 && <EmptyState compact title="Belum ada riwayat" />}
            </ol>
          </div>
        )}

        {tab === 'pencatatan' && (
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-4 dark:border-navy-800">
              <SectionTitle title="Repertorium" subtitle="Nomor urut pencatatan akta per tahun" />
              {deed.repertorium ? (
                <div className="space-y-2 text-sm">
                  <p className="text-2xl font-bold text-navy-900 dark:text-white">{String(deed.repertorium.number).padStart(3, '0')}<span className="text-sm font-medium text-slate-400">/{deed.repertorium.year}</span></p>
                  <p className="text-xs text-slate-500">Dicatat {formatDateTime(deed.repertorium.registeredAt)}</p>
                  {deed.repertorium.notes && <p className="rounded bg-slate-50 p-2 text-xs dark:bg-navy-900">{deed.repertorium.notes}</p>}
                  <Link to="/repertorium" className="inline-flex items-center gap-1 text-xs font-semibold text-gold-600 hover:underline dark:text-gold-400"><BookOpen className="h-3.5 w-3.5" /> Buka Repertorium</Link>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500">Akta belum tercatat pada repertorium. Pencatatan otomatis terjadi saat status menjadi <b>Tercatat</b>.</p>
                  {canManage && <Button variant="secondary" className="!py-1.5 text-xs" loading={busy} onClick={() => void registerRepertorium()}>Catat Sekarang</Button>}
                </div>
              )}
            </div>
            <div className="rounded-lg border border-slate-200 p-4 dark:border-navy-800">
              <SectionTitle title="Protokol Notaris" subtitle="Register minuta, salinan, dan arsip" />
              {deed.protocol ? (
                <div className="space-y-1 text-sm">
                  <p className="font-semibold text-navy-900 dark:text-white">Register {String(deed.protocol.registerNumber).padStart(3, '0')}/{deed.protocol.year}</p>
                  <p className="text-xs text-slate-500">Jenis: {deed.protocol.protocolType} · Lokasi: {deed.protocol.location ?? '—'}</p>
                  <p className="text-xs text-slate-500">Disetor {formatDateTime(deed.protocol.depositedAt)}</p>
                  <Link to="/protokol" className="inline-flex items-center gap-1 text-xs font-semibold text-gold-600 hover:underline dark:text-gold-400"><Archive className="h-3.5 w-3.5" /> Buka Protokol</Link>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500">Belum ada catatan protokol untuk akta ini.</p>
                  {session.permissions.includes('protocol.manage') && (
                    <Button variant="secondary" className="!py-1.5 text-xs" onClick={() => navigate(`/protokol?new=1&deedId=${deed.id}`)}><Stamp className="h-3.5 w-3.5" /> Catat Protokol</Button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      <Modal
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        title="Ubah Status Akta"
        subtitle={`Status saat ini: ${DEED_STATUS_LABELS[deed.status]}`}
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
              {transitions.map((s) => <option key={s} value={s}>{DEED_STATUS_LABELS[s]}</option>)}
            </Select>
          </Field>
          {!canApprove && allTransitions.some((s) => APPROVAL_STATUSES.includes(s)) && (
            <Alert tone="warn">Persetujuan dan penandatanganan hanya dapat dilakukan oleh pengguna dengan hak <b>Review & approval akta</b>.</Alert>
          )}
          {target === 'SIGNED' && !deed.notaryId && (
            <Alert tone="danger">Notaris/PPAT penanggung jawab belum ditetapkan. Tetapkan melalui tombol Ubah terlebih dahulu.</Alert>
          )}
          {target === 'REGISTERED' && (
            <Alert tone="info">Saat status menjadi Tercatat, akta otomatis memperoleh nomor repertorium tahun berjalan.</Alert>
          )}
          <Field label="Catatan" hint={target === 'CANCELLED' ? 'Alasan pembatalan wajib diisi.' : 'Opsional, tersimpan pada riwayat dan audit.'} required={target === 'CANCELLED'}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {transitions.length === 0 && <Alert tone="warn">Tidak ada transisi status yang tersedia untuk peran Anda.</Alert>}
        </div>
      </Modal>

      <Modal open={!!snapshot} onClose={() => setSnapshot(null)} title="Snapshot Revisi" subtitle="Isi akta sebelum perubahan disimpan" size="lg">
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-[11px] leading-relaxed dark:bg-navy-900">
          {snapshot ? JSON.stringify(snapshot, null, 2) : ''}
        </pre>
      </Modal>
    </div>
  )
}
