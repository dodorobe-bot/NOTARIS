import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, CalendarPlus, Check, Download, DownloadCloud, Eye, FilePlus2, FolderOpen, History, Link2,
  Lock, Plus, RefreshCw, Trash2, Upload, X,
} from 'lucide-react'
import { call, useQuery } from '@/api'
import type { SessionInfo } from '@/types'
import {
  Alert, Badge, Button, Card, ConfirmDialog, DataTable, DescriptionList, EmptyState, Field,
  IconButton, Input, Modal, PageHeader, Select, Spinner, Stepper, Textarea, cn, useToast,
} from '@/components/ui'
import {
  GOVERNMENT_FILE_KINDS, GOVERNMENT_OFFICIAL_SOURCES, GOVERNMENT_REFERENCE_TYPES,
  governmentAgencyLabel, governmentOfficialSourceLabel, governmentStatusLabel,
} from '@shared/government'
import { formatBytes, formatDateTime } from '@shared/format'
import { DataFieldsEditor, GOV_STEPS, GovStatusBadge, MissingList, OnlineBadge, PortalAnchor, useOnline } from './government/parts'

interface PickedFile { path: string; name: string; sizeBytes: number; mimeType: string }

const emptyRef = { type: 'NOMOR_PERMOHONAN', value: '', issuedAt: '', source: 'PORTAL', notes: '' }
const emptyOfficial = { officialStatus: '', source: 'PORTAL', note: '' }
const emptyEdit = { title: '', description: '', clientId: '', transactionId: '', data: {} as Record<string, string> }

export function GovernmentDetail({ session }: { session: SessionInfo }) {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const online = useOnline()
  const canManage = session.permissions.includes('government.manage')

  const detail = useQuery<any>('government.submissions.get', { id }, { enabled: !!id })
  const sub = detail.data

  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState<any>(emptyEdit)
  const [refOpen, setRefOpen] = useState(false)
  const [refForm, setRefForm] = useState<any>(emptyRef)
  const [officialOpen, setOfficialOpen] = useState(false)
  const [officialForm, setOfficialForm] = useState<any>(emptyOfficial)
  const [fileOpen, setFileOpen] = useState(false)
  const [fileForm, setFileForm] = useState<any>({ kind: 'DOKUMEN_PENDUKUNG', picked: null, notes: '' })
  const [preview, setPreview] = useState<any | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [confirm, setConfirm] = useState<{ title: string; description: string; run: () => Promise<void> } | null>(null)
  const [errors, setErrors] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const clients = useQuery<any[]>('clients.options', {}, { enabled: editOpen })
  const transactions = useQuery<any[]>('transactions.options', {}, { enabled: editOpen })

  async function run(action: () => Promise<unknown>, success?: string) {
    setBusy(true)
    setErrors(null)
    try {
      await action()
      if (success) toast.success(success)
      await detail.reload(true)
    } catch (err) {
      setErrors((err as Error).message)
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function changeStatus(to: string) {
    await run(
      () => call('government.submissions.changeStatus', { id, toStatus: to, source: 'MANUAL', note: null, officialStatus: null }),
      `Status internal menjadi "${governmentStatusLabel(to)}".`,
    )
  }

  async function saveEdit() {
    if (!editForm.title?.trim()) return setErrors('Perihal pengajuan wajib diisi.')
    await run(async () => {
      await call('government.submissions.update', {
        id,
        title: editForm.title.trim(),
        description: editForm.description || null,
        clientId: editForm.clientId || null,
        transactionId: editForm.transactionId || null,
        data: editForm.data ?? {},
      })
      setEditOpen(false)
    }, 'Data persiapan pengajuan diperbarui.')
  }

  async function saveReference() {
    if (!refForm.value?.trim()) return setErrors('Nomor resmi wajib diisi.')
    await run(async () => {
      await call('government.submissions.addReference', {
        submissionId: id,
        type: refForm.type,
        value: refForm.value.trim(),
        issuedAt: refForm.issuedAt || null,
        source: refForm.source,
        notes: refForm.notes || null,
      })
      setRefForm(emptyRef)
      setRefOpen(false)
    }, 'Nomor resmi dicatat dan tidak dapat diubah lagi.')
  }

  async function saveOfficial() {
    if (!officialForm.officialStatus?.trim()) return setErrors('Status resmi wajib diisi.')
    await run(async () => {
      await call('government.submissions.recordOfficialStatus', {
        id,
        officialStatus: officialForm.officialStatus.trim(),
        source: officialForm.source,
        note: officialForm.note || null,
      })
      setOfficialForm(emptyOfficial)
      setOfficialOpen(false)
    }, 'Status resmi dicatat terpisah dari status internal.')
  }

  async function pickFile() {
    try {
      const file = await call<PickedFile | null>('government.files.pick')
      if (!file) return
      setFileForm((f: any) => ({ ...f, picked: file }))
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function addFile() {
    if (!fileForm.picked) return setErrors('Pilih berkas terlebih dahulu.')
    await run(async () => {
      await call('government.files.add', {
        submissionId: id,
        kind: fileForm.kind,
        tempPath: fileForm.picked.path,
        originalName: fileForm.picked.name,
        notes: fileForm.notes || null,
      })
      setFileForm({ kind: fileForm.kind, picked: null, notes: '' })
      setFileOpen(false)
    }, 'Berkas dilampirkan dan dicatat pada audit.')
  }

  async function openFilePreview(fileId: string) {
    setBusy(true)
    try {
      const result = await call<any>('government.files.preview', { id: fileId })
      setPreview({ ...result, id: fileId })
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function openFileExternal(fileId: string) {
    try {
      await call('government.files.openExternal', { id: fileId })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function downloadFile(fileId: string) {
    try {
      const res = await call<any>('government.files.download', { id: fileId })
      if (!res.canceled) toast.success(`Berkas disalin ke ${res.filePath}`)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function exportSummary() {
    setBusy(true)
    setErrors(null)
    try {
      const result = await call<any>('government.submissions.exportSummary', { id })
      if (result.canceled) toast.info('Ekspor dibatalkan.')
      else toast.success(`Lembar persiapan disimpan di ${result.filePath}`)
      await detail.reload(true)
    } catch (err) {
      setErrors((err as Error).message)
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (detail.error) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/integrasi')}><ArrowLeft className="h-4 w-4" /> Kembali</Button>
        <Alert tone="danger" title="Pengajuan tidak dapat dimuat">{detail.error}</Alert>
      </div>
    )
  }

  if (!sub) return <div className="flex h-64 items-center justify-center"><Spinner className="h-6 w-6" /></div>

  const steps = [...GOV_STEPS, { status: sub.internalStatus, label: governmentStatusLabel(sub.internalStatus) }]
  const uniqueSteps = steps.filter((s, i, arr) => arr.findIndex((x) => x.status === s.status) === i)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`Integrasi Pemerintah · ${governmentAgencyLabel(sub.agency)}`}
        title={sub.title}
        subtitle={`${sub.number} · ${sub.service.name}`}
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate('/integrasi')}><ArrowLeft className="h-4 w-4" /> Kembali</Button>
            <PortalAnchor
              url={sub.portalUrl}
              label={`Buka Portal ${governmentAgencyLabel(sub.agency)}`}
              onOpened={() => void call('government.submissions.portalOpened', { id, online: navigator.onLine }).then(() => detail.reload(true)).catch((e) => toast.error((e as Error).message))}
            />
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <OnlineBadge online={online} />
        <Badge tone="neutral">Mode: {sub.service.mode === 'SEMI_OTOMATIS' ? 'semi-otomatis' : sub.service.mode}</Badge>
        <Badge tone="gray"><Link2 className="mr-1 h-3 w-3" />API resmi belum tersedia</Badge>
        {sub.isFinal && <Badge tone="red"><Lock className="mr-1 h-3 w-3" />Terkunci</Badge>}
      </div>

      {errors && <Alert tone="danger">{errors}</Alert>}

      <Card className="p-4">
        <Stepper steps={uniqueSteps} current={sub.internalStatus} />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-navy-800">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Status internal</p>
            <div className="mt-1"><GovStatusBadge status={sub.internalStatus} /></div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Diperbarui {sub.lastStatusAt ? formatDateTime(sub.lastStatusAt) : 'belum pernah'}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-navy-800">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Status resmi</p>
            <p className="mt-1 text-sm font-semibold text-navy-900 dark:text-white">{sub.officialStatus || 'Belum dicatat'}</p>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {sub.externalRef ? `Nomor resmi ${sub.externalRef}` : 'Nomor resmi belum diterima'} · sumber {sub.officialSourceLabel.toLowerCase()}
            </p>
          </div>
        </div>

        {canManage && !sub.isFinal && (
          <div className="mt-4 border-t border-slate-200 pt-4 dark:border-navy-800">
            <p className="text-xs font-semibold text-navy-900 dark:text-slate-100">Pindahkan status internal</p>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Tombol aktif bila seluruh syarat bukti sudah terpenuhi; syarat yang kurang ditampilkan di bawah tombol.
            </p>
            <div className="mt-2 flex flex-wrap items-start gap-2">
              {(sub.transitions as any[]).map((t) => (
                <div key={t.to} className="max-w-xs">
                  <Button
                    variant={t.missing.length ? 'secondary' : 'primary'}
                    disabled={busy || t.missing.length > 0}
                    onClick={() => void changeStatus(t.to)}
                    title={t.missing.length ? 'Belum lengkap' : `Catat sebagai ${t.label}`}
                  >
                    <Check className="h-4 w-4" /> {t.label}
                  </Button>
                  <MissingList items={t.missing} />
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setOfficialOpen(true)} disabled={busy || sub.isFinal}>
                <RefreshCw className="h-4 w-4" /> Catat status resmi
              </Button>
              <Button variant="secondary" onClick={() => setRefOpen(true)} disabled={busy || sub.isFinal}>
                <CalendarPlus className="h-4 w-4" /> Catat nomor resmi
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setEditForm({
                    title: sub.title,
                    description: sub.description ?? '',
                    clientId: sub.clientId ?? '',
                    transactionId: sub.transactionId ?? '',
                    data: sub.data ?? {},
                  })
                  setEditOpen(true)
                }}
                disabled={busy || sub.isFinal}
              >
                <FilePlus2 className="h-4 w-4" /> Ubah data persiapan
              </Button>
            </div>
          </div>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-navy-900 dark:text-slate-100">Checklist layanan</h2>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Persiapan mandiri {governmentAgencyLabel(sub.agency)} — {sub.checklist.length} butir. Tidak ada pengambilan data otomatis dari portal.
                </p>
              </div>
              <Button variant="secondary" onClick={() => void exportSummary()} disabled={busy}>
                <Download className="h-4 w-4" /> Ekspor Lembar Persiapan
              </Button>
            </div>
            <ul className="grid gap-1 text-xs text-slate-600 sm:grid-cols-2 dark:text-slate-300">
              {(sub.checklist as string[]).map((c) => (
                <li key={c} className="flex items-start gap-1.5">
                  <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" />{c}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-navy-900 dark:text-slate-100">Data pengajuan</h2>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">{Object.keys(sub.data ?? {}).length} isian terisi</span>
            </div>
            {Object.keys(sub.data ?? {}).length ? (
              <DescriptionList items={Object.entries(sub.data as Record<string, string>).map(([key, value]) => ({ label: key, value }))} />
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">Belum ada data isian. Gunakan "Ubah data persiapan" untuk mengisi nilai yang dibaca dari portal.</p>
            )}
            <div className="mt-4 border-t border-slate-200 pt-3 dark:border-navy-800">
              <DescriptionList
                columns={3}
                items={[
                  { label: 'Klien', value: sub.client?.fullName ?? '—' },
                  { label: 'Transaksi', value: sub.transaction?.code ?? '—' },
                  { label: 'Diajukan pada portal', value: sub.submittedAt ? formatDateTime(sub.submittedAt) : 'belum' },
                ]}
              />
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <h2 className="text-sm font-bold text-navy-900 dark:text-slate-100">Berkas pengajuan</h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {sub.files.length} berkas aktif · dukungan {sub.state.supportingFiles} · bukti {sub.state.evidenceFiles} · hasil {sub.state.resultFiles}
                </p>
              </div>
              {canManage && (
                <Button variant="gold" onClick={() => setFileOpen(true)} disabled={busy || sub.isFinal}>
                  <Upload className="h-4 w-4" /> Tambah Berkas
                </Button>
              )}
            </div>
            <DataTable
              rows={sub.files}
              virtualize
              rowKey={(r) => r.id}
              columns={[
                { key: 'fileName', header: 'Berkas', render: (r) => <div className="min-w-0"><p className="truncate font-medium">{r.fileName}</p><p className="truncate font-mono text-[11px] text-slate-500">{r.checksum.slice(0, 16)}…</p></div> },
                { key: 'kind', header: 'Jenis', render: (r) => <Badge tone={r.kind === 'HASIL_LAYANAN' ? 'green' : r.kind === 'BUKTI_PENGAJUAN' ? 'blue' : 'neutral'}>{r.kindLabel}</Badge> },
                { key: 'sizeBytes', header: 'Ukuran', align: 'right', render: (r) => formatBytes(r.sizeBytes) },
                { key: 'createdAt', header: 'Dicatat', render: (r) => <span className="text-[11px] text-slate-500">{formatDateTime(r.createdAt)}</span> },
                { key: 'uploadedBy', header: 'Oleh', render: (r) => r.uploadedBy?.fullName ?? '—' },
                {
                  key: 'actions', header: '', align: 'right', width: 140,
                  render: (r) => (
                    <div className="flex justify-end gap-0.5">
                      <IconButton label="Pratinjau berkas" onClick={() => void openFilePreview(r.id)}><Eye className="h-4 w-4" /></IconButton>
                      <IconButton label="Unduh salinan" onClick={() => void downloadFile(r.id)}><DownloadCloud className="h-4 w-4" /></IconButton>
                      {canManage && (
                        <IconButton
                          label="Keluarkan berkas dari daftar"
                          disabled={busy || sub.isFinal}
                          onClick={() => setConfirm({
                            title: 'Keluarkan berkas dari daftar?',
                            description: 'Berkas ditandai tidak terpakai; berkas fisik dan jejak audit tetap tersimpan dan tidak dapat dihapus diam-diam.',
                            run: async () => { await call('government.files.remove', { id: r.id }) },
                          })}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </IconButton>
                      )}
                    </div>
                  ),
                },
              ]}
              empty={<EmptyState compact title="Belum ada berkas" description="Unggah dokumen pendukung, bukti pengajuan, dan hasil layanan resmi." />}
            />
          </Card>

          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-navy-900 dark:text-slate-100">Nomor & referensi resmi</h2>
              {canManage && (
                <Button variant="secondary" onClick={() => setRefOpen(true)} disabled={busy || sub.isFinal}>
                  <Plus className="h-4 w-4" /> Tambah Referensi
                </Button>
              )}
            </div>
            {sub.references.length ? (
              <ul className="space-y-2">
                {(sub.references as any[]).map((ref) => (
                  <li key={ref.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-navy-800">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-navy-900 dark:text-slate-100">{ref.value}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {GOVERNMENT_REFERENCE_TYPES.find((t) => t.value === ref.type)?.label} · {governmentOfficialSourceLabel(ref.source).toLowerCase()}
                        {ref.issuedAt ? ` · terbit ${formatDateTime(ref.issuedAt)}` : ''}
                        {ref.notes ? ` · ${ref.notes}` : ''}
                      </p>
                    </div>
                    <span className="text-[11px] text-slate-400">{formatDateTime(ref.createdAt)} · {ref.createdBy?.fullName ?? '—'}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">Belum ada nomor resmi tercatat.</p>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-navy-900 dark:text-slate-100">Riwayat status</h2>
              <Button variant="ghost" onClick={() => setHistoryOpen(true)}><History className="h-4 w-4" /> Semua</Button>
            </div>
            <ol className="mt-3 space-y-2">
              {(sub.statusHistory as any[]).slice(0, 6).map((h) => (
                <li key={h.id} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-navy-800">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={h.scope === 'OFFICIAL' ? 'blue' : 'neutral'}>{h.scope === 'OFFICIAL' ? 'Resmi' : 'Internal'}</Badge>
                    <span className="text-xs font-semibold text-navy-900 dark:text-slate-100">
                      {h.scope === 'OFFICIAL' ? h.officialStatus : `${governmentStatusLabel(h.fromStatus)} → ${governmentStatusLabel(h.toStatus)}`}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {formatDateTime(h.createdAt)} · {h.changedBy?.fullName ?? '—'} · {governmentOfficialSourceLabel(h.source).toLowerCase()}
                  </p>
                  {h.note && <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">{h.note}</p>}
                </li>
              ))}
            </ol>
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-bold text-navy-900 dark:text-slate-100">Log gateway terbaru</h2>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Setiap tindakan pada pengajuan ini tercatat dan bersifat append-only.</p>
            <ul className="mt-3 space-y-2">
              {(sub.syncLogs as any[]).slice(0, 8).map((log) => (
                <li key={log.id} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-navy-800">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={log.status === 'SUCCESS' ? 'green' : log.status === 'FAILED' ? 'red' : 'amber'}>
                      {log.status === 'PENDING' ? 'Menunggu' : log.status === 'SUCCESS' ? 'Tercatat' : 'Gagal'}
                    </Badge>
                    <span className="text-[10px] text-slate-400">{formatDateTime(log.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">{log.message}</p>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-bold text-navy-900 dark:text-slate-100">Kesiapan</h2>
            <dl className="mt-2 space-y-1.5 text-[11px]">
              {[
                ['Data isian', sub.state.dataFields],
                ['Dokumen pendukung', sub.state.supportingFiles],
                ['Bukti pengajuan', sub.state.evidenceFiles],
                ['Hasil layanan', sub.state.resultFiles],
                ['Referensi resmi', sub.references.length],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
                  <dd className={cn('font-bold tabular-nums', Number(value) > 0 ? 'text-navy-900 dark:text-slate-100' : 'text-slate-400')}>{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Ubah Data Persiapan"
        subtitle={`Identitas pengajuan (${sub.number}) dan layanan tidak dapat diubah.`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)} disabled={busy}>Batal</Button>
            <Button onClick={() => void saveEdit()} loading={busy}>Simpan</Button>
          </>
        }
      >
        <div className="space-y-4">
          {errors && <Alert tone="danger">{errors}</Alert>}
          <Field label="Perihal" required>
            <Input value={editForm.title} maxLength={300} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Klien">
              <Select value={editForm.clientId} onChange={(e) => setEditForm({ ...editForm, clientId: e.target.value })}>
                <option value="">Tidak ditautkan</option>
                {(clients.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.code} — {c.fullName}</option>)}
              </Select>
            </Field>
            <Field label="Transaksi">
              <Select value={editForm.transactionId} onChange={(e) => setEditForm({ ...editForm, transactionId: e.target.value })}>
                <option value="">Tidak ditautkan</option>
                {(transactions.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.code} — {t.title}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Uraian">
            <Textarea value={editForm.description} maxLength={2000} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
          </Field>
          <div>
            <p className="mb-2 text-xs font-semibold text-navy-900 dark:text-slate-100">Data isian portal</p>
            <DataFieldsEditor fields={sub.fields} values={editForm.data} onChange={(data) => setEditForm({ ...editForm, data })} />
          </div>
        </div>
      </Modal>

      <Modal
        open={refOpen}
        onClose={() => setRefOpen(false)}
        title="Catat Nomor Resmi"
        subtitle="Nomor yang terbit dari portal resmi atau surat resmi. Setelah tercatat, referensi tidak dapat diubah atau dihapus."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRefOpen(false)} disabled={busy}>Batal</Button>
            <Button onClick={() => void saveReference()} loading={busy}>Catat Referensi</Button>
          </>
        }
      >
        <div className="space-y-4">
          {errors && <Alert tone="danger">{errors}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Jenis nomor" required>
              <Select value={refForm.type} onChange={(e) => setRefForm({ ...refForm, type: e.target.value })}>
                {GOVERNMENT_REFERENCE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </Field>
            <Field label="Sumber pencatatan" required>
              <Select value={refForm.source} onChange={(e) => setRefForm({ ...refForm, source: e.target.value })}>
                {GOVERNMENT_OFFICIAL_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </Field>
            <Field label="Nomor" required className="sm:col-span-2">
              <Input value={refForm.value} maxLength={150} onChange={(e) => setRefForm({ ...refForm, value: e.target.value })} placeholder="mis. AHU-0123456.AH.01.01.TAHUN 2026" />
            </Field>
            <Field label="Tanggal terbit">
              <Input type="date" value={refForm.issuedAt} onChange={(e) => setRefForm({ ...refForm, issuedAt: e.target.value })} />
            </Field>
            <Field label="Catatan">
              <Input value={refForm.notes} maxLength={500} onChange={(e) => setRefForm({ ...refForm, notes: e.target.value })} />
            </Field>
          </div>
        </div>
      </Modal>

      <Modal
        open={officialOpen}
        onClose={() => setOfficialOpen(false)}
        title="Catat Status Resmi"
        subtitle="Status dari portal/surat resmi dicatat terpisah dan tidak mengubah status internal."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOfficialOpen(false)} disabled={busy}>Batal</Button>
            <Button onClick={() => void saveOfficial()} loading={busy}>Simpan Catatan</Button>
          </>
        }
      >
        <div className="space-y-4">
          {errors && <Alert tone="danger">{errors}</Alert>}
          <Field label="Status resmi" required hint="Salin persis keterangan portal, mis. «Menunggu verifikasi dokumen»." >
            <Input value={officialForm.officialStatus} maxLength={120} onChange={(e) => setOfficialForm({ ...officialForm, officialStatus: e.target.value })} />
          </Field>
          <Field label="Sumber" required>
            <Select value={officialForm.source} onChange={(e) => setOfficialForm({ ...officialForm, source: e.target.value })}>
              {GOVERNMENT_OFFICIAL_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
          </Field>
          <Field label="Catatan">
            <Textarea value={officialForm.note} maxLength={500} onChange={(e) => setOfficialForm({ ...officialForm, note: e.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={fileOpen}
        onClose={() => setFileOpen(false)}
        title="Tambah Berkas Pengajuan"
        subtitle="Berkas disalin ke penyimpanan aplikasi dengan nama unik, checksum SHA-256, dan jejak audit."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFileOpen(false)} disabled={busy}>Batal</Button>
            <Button onClick={() => void addFile()} loading={busy} disabled={!fileForm.picked}>Unggah Berkas</Button>
          </>
        }
      >
        <div className="space-y-4">
          {errors && <Alert tone="danger">{errors}</Alert>}
          <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center dark:border-navy-700">
            <Upload className="mx-auto h-6 w-6 text-slate-400" />
            <p className="mt-2 text-sm font-medium text-navy-900 dark:text-slate-200">{fileForm.picked ? fileForm.picked.name : 'Belum ada berkas dipilih'}</p>
            {fileForm.picked && <p className="text-xs text-slate-500">{formatBytes(fileForm.picked.sizeBytes)} · {fileForm.picked.mimeType}</p>}
            <Button variant="secondary" className="mt-3 !py-1.5 text-xs" onClick={() => void pickFile()}>Pilih Berkas…</Button>
            <p className="mt-2 text-[11px] text-slate-400">PDF, DOCX, XLSX, JPG, atau PNG maksimal 50 MB.</p>
          </div>
          <Field label="Jenis berkas" required>
            <Select value={fileForm.kind} onChange={(e) => setFileForm({ ...fileForm, kind: e.target.value })}>
              {GOVERNMENT_FILE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </Select>
          </Field>
          <Field label="Catatan">
            <Input value={fileForm.notes} maxLength={500} onChange={(e) => setFileForm({ ...fileForm, notes: e.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.fileName ?? 'Pratinjau berkas'}
        subtitle={preview ? [preview.mimeType, preview.sourceBytes ? formatBytes(preview.sourceBytes) : null, preview.thumbnail ? `thumbnail ${preview.width}×${preview.height}` : null].filter(Boolean).join(' · ') : undefined}
        size="xl"
        footer={
          <>
            {preview?.id && <Button variant="secondary" onClick={() => void openFileExternal(preview.id)}><FolderOpen className="h-4 w-4" /> Buka Aplikasi</Button>}
            {preview?.id && <Button variant="secondary" onClick={() => void downloadFile(preview.id)}><DownloadCloud className="h-4 w-4" /> Unduh</Button>}
            <Button onClick={() => setPreview(null)}>Tutup</Button>
          </>
        }
      >
        {!preview ? (
          <div className="flex h-40 items-center justify-center"><Spinner className="h-6 w-6" /></div>
        ) : preview.kind === 'image' && preview.dataUrl ? (
          <div className="flex max-h-[60vh] justify-center overflow-auto rounded-lg bg-slate-100 p-3 dark:bg-navy-900">
            <img src={preview.dataUrl} alt={preview.fileName} className="max-h-[55vh] object-contain" />
          </div>
        ) : preview.kind === 'pdf' && preview.dataUrl ? (
          <iframe title={preview.fileName} src={preview.dataUrl} className="h-[60vh] w-full rounded-lg border border-slate-200 dark:border-navy-800" />
        ) : (
          <Alert tone={preview.kind === 'missing' ? 'danger' : 'warn'} title={preview.kind === 'missing' ? 'Berkas tidak ditemukan' : 'Pratinjau tidak tersedia'}>
            {preview.reason ?? 'Gunakan Buka Aplikasi atau Unduh untuk membuka berkas ini.'}
          </Alert>
        )}
      </Modal>

      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Seluruh Riwayat Status"
        subtitle={`${sub.statusHistory.length} catatan append-only`}
        size="lg"
        footer={<Button onClick={() => setHistoryOpen(false)}><X className="h-4 w-4" /> Tutup</Button>}
      >
        <ol className="space-y-2">
          {(sub.statusHistory as any[]).map((h) => (
            <li key={h.id} className="rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-navy-800">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={h.scope === 'OFFICIAL' ? 'blue' : 'neutral'}>{h.scope === 'OFFICIAL' ? 'Resmi' : 'Internal'}</Badge>
                <span className="font-semibold text-navy-900 dark:text-slate-100">
                  {h.scope === 'OFFICIAL' ? h.officialStatus : `${governmentStatusLabel(h.fromStatus)} → ${governmentStatusLabel(h.toStatus)}`}
                </span>
                <span className="ml-auto text-[11px] text-slate-400">{formatDateTime(h.createdAt)}</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                {h.changedBy?.fullName ?? '—'} · {governmentOfficialSourceLabel(h.source).toLowerCase()}{h.note ? ` · ${h.note}` : ''}
              </p>
            </li>
          ))}
        </ol>
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title ?? ''}
        description={confirm?.description}
        confirmLabel="Ya, keluarkan"
        danger
        loading={busy}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          const action = confirm?.run
          setConfirm(null)
          if (action) void run(action, 'Berkas dikeluarkan dari daftar.')
        }}
      />
    </div>
  )
}
