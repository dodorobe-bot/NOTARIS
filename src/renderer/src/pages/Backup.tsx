import { useState } from 'react'
import {
  Archive, CheckCircle2, DatabaseBackup, FolderOpen, Hash, HardDriveDownload, RotateCcw,
  ShieldCheck, Trash2, Upload,
} from 'lucide-react'
import { call, useQuery } from '@/api'
import type { SessionInfo } from '@/types'
import {
  Alert, Badge, Button, Card, ConfirmDialog, DataTable, EmptyState, Field, IconButton, Input,
  Modal, PageHeader, SectionTitle, StatCard, Tabs, Textarea, Toggle, useToast,
} from '@/components/ui'
import { formatBytes, formatDateTime } from '@shared/format'

const TYPE_LABELS: Record<string, string> = {
  MANUAL: 'Manual',
  AUTO: 'Otomatis',
  PRE_MIGRATION: 'Pra-migrasi',
}

export function Backup({ session }: { session: SessionInfo }) {
  const toast = useToast()
  const query = useQuery<any>('backup.list')
  const [tab, setTab] = useState<'files' | 'logs'>('files')

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ passphrase: '', includeDocuments: true, note: '' })
  const [createError, setCreateError] = useState<string | null>(null)
  const [createBusy, setCreateBusy] = useState(false)
  const [importBusy, setImportBusy] = useState(false)

  const [validating, setValidating] = useState<string | null>(null)
  const [validatePass, setValidatePass] = useState('')
  const [validateBusy, setValidateBusy] = useState(false)
  const [validateResult, setValidateResult] = useState<any | null>(null)

  const [restoring, setRestoring] = useState<string | null>(null)
  const [restorePass, setRestorePass] = useState('')
  const [restoreConfirm, setRestoreConfirm] = useState('')
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)

  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const data = query.data
  const files: any[] = data?.files ?? []
  const logs: any[] = data?.logs ?? []

  function openCreate() {
    setCreateForm({ passphrase: '', includeDocuments: true, note: '' })
    setCreateError(null)
    setCreateOpen(true)
  }

  async function createBackup() {
    if (createForm.passphrase && createForm.passphrase.length < 8) {
      return setCreateError('Passphrase backup minimal 8 karakter.')
    }
    setCreateBusy(true)
    setCreateError(null)
    try {
      const res = await call<any>('backup.create', {
        passphrase: createForm.passphrase || undefined,
        includeDocuments: createForm.includeDocuments,
        note: createForm.note.trim() || undefined,
      })
      toast.success(`Backup dibuat: ${res.fileName} (${formatBytes(res.sizeBytes)})`)
      setCreateOpen(false)
      await query.reload(true)
    } catch (err) {
      setCreateError((err as Error).message)
    } finally {
      setCreateBusy(false)
    }
  }

  async function importBackup() {
    setImportBusy(true)
    try {
      const res = await call<any>('backup.import')
      if (res) {
        toast.success(`Backup diimpor: ${res.fileName}`)
        await query.reload(true)
      }
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setImportBusy(false)
    }
  }

  function openValidate(fileName: string) {
    setValidating(fileName)
    setValidatePass('')
    setValidateResult(null)
  }

  async function runValidate() {
    if (!validating) return
    setValidateBusy(true)
    setValidateResult(null)
    try {
      const res = await call<any>('backup.validate', { fileName: validating, passphrase: validatePass || undefined })
      setValidateResult(res)
      if (res.ok) toast.success('Backup valid dan dapat dipulihkan.')
      else toast.error(res.detail)
    } catch (err) {
      setValidateResult({ ok: false, detail: (err as Error).message })
    } finally {
      setValidateBusy(false)
    }
  }

  function openRestore(fileName: string) {
    setRestoring(fileName)
    setRestorePass('')
    setRestoreConfirm('')
    setRestoreError(null)
  }

  async function runRestore() {
    if (!restoring) return
    if (restoreConfirm.trim().toUpperCase() !== 'PULIHKAN') {
      return setRestoreError('Ketik PULIHKAN untuk mengonfirmasi.')
    }
    setRestoreBusy(true)
    setRestoreError(null)
    try {
      const res = await call<any>('backup.restore', {
        fileName: restoring,
        passphrase: restorePass || undefined,
      })
      toast.success(`Restorasi selesai. Backup pengaman: ${res.preRestoreBackup}`)
      setRestoring(null)
      window.dispatchEvent(new Event('notaris:session-expired'))
    } catch (err) {
      setRestoreError((err as Error).message)
    } finally {
      setRestoreBusy(false)
    }
  }

  async function checksum(fileName: string) {
    try {
      const res = await call<{ checksum: string }>('backup.checksum', { fileName })
      await navigator.clipboard.writeText(res.checksum)
      toast.success(`Checksum SHA-256 disalin: ${res.checksum.slice(0, 16)}…`)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      await call('backup.delete', { fileName: deleting })
      toast.success(`Backup ${deleting} dihapus.`)
      setDeleting(null)
      await query.reload(true)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sistem"
        title="Backup & Restore"
        subtitle="Salinan basis data dan dokumen terenkripsi AES-256-GCM."
        actions={
          <>
            <Button variant="secondary" onClick={() => void call('backup.openFolder').catch((e) => toast.error((e as Error).message))}>
              <FolderOpen className="h-4 w-4" /> Buka Folder
            </Button>
            <Button variant="secondary" onClick={() => void importBackup()} loading={importBusy}>
              <Upload className="h-4 w-4" /> Impor Berkas
            </Button>
            <Button variant="gold" onClick={openCreate}><DatabaseBackup className="h-4 w-4" /> Buat Backup</Button>
          </>
        }
      />

      {query.error && <Alert tone="danger" title="Gagal memuat backup">{query.error}</Alert>}
      {(data?.location?.warnings ?? []).length > 0 && (
        <Alert tone="warn" title="Lokasi backup perlu perhatian">
          <ul className="list-disc space-y-1 pl-4 text-xs">
            {data.location.warnings.map((w: string) => <li key={w}>{w}</li>)}
          </ul>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Jumlah Backup" value={data?.totals?.count ?? 0} hint="Berkas .npbackup di folder backup" icon={<Archive />} tone="navy" />
        <StatCard label="Total Ukuran" value={formatBytes(data?.totals?.sizeBytes ?? 0)} hint="Seluruh berkas backup" icon={<HardDriveDownload />} tone="blue" />
        <StatCard label="Backup Terakhir" value={data?.totals?.lastBackupAt ? formatDateTime(data.totals.lastBackupAt) : '—'} hint="Berdasarkan waktu berkas" icon={<CheckCircle2 />} tone={data?.totals?.lastBackupAt ? 'green' : 'gold'} />
        <StatCard label="Enkripsi" value="AES-256-GCM" hint="Kunci vault atau passphrase" icon={<ShieldCheck />} tone="gold" />
      </div>

      <Alert tone="info" title="Kebijakan pemulihan">
        <div className="space-y-1 text-xs">
          <p>Restorasi selalu membuat backup pengaman terlebih dahulu. Setelah restorasi, semua sesi diakhiri dan Anda harus masuk kembali. Berkas backup tidak pernah disimpan dalam bentuk plaintext.</p>
          {data?.location?.note && <p>{data.location.note}</p>}
        </div>
      </Alert>

      <Card className="overflow-hidden">
        <Tabs
          className="px-4 pt-2"
          active={tab}
          onChange={(k) => setTab(k as 'files' | 'logs')}
          tabs={[
            { key: 'files', label: 'Berkas Backup', count: files.length },
            { key: 'logs', label: 'Riwayat', count: logs.length },
          ]}
        />

        {tab === 'files' && (
          <>
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Folder: <span className="font-mono">{data?.folder ?? '—'}</span>
                {typeof data?.location?.freeBytes === 'number' && (
                  <> — ruang kosong {formatBytes(data.location.freeBytes)}</>
                )}
              </p>
              <span className="text-xs text-slate-500 dark:text-slate-400">{session.fullName}</span>
            </div>
            <DataTable
              rows={files}
              loading={query.loading}
              empty={<EmptyState compact title="Belum ada berkas backup" description="Buat backup pertama untuk melindungi basis data dan dokumen kantor." />}
              columns={[
                { key: 'fileName', header: 'Nama Berkas', render: (r) => <span className="font-mono text-xs font-medium text-navy-900 dark:text-white">{r.fileName}</span> },
                { key: 'modifiedAt', header: 'Diubah', render: (r) => formatDateTime(r.modifiedAt) },
                { key: 'sizeBytes', header: 'Ukuran', align: 'right', render: (r) => formatBytes(r.sizeBytes) },
                { key: 'exists', header: 'Status', render: () => <Badge tone="green">Tersedia</Badge> },
                {
                  key: 'actions', header: '', align: 'right', render: (r) => (
                    <div className="flex justify-end gap-1">
                      <IconButton label="Validasi backup" onClick={() => openValidate(r.fileName)}><ShieldCheck className="h-4 w-4" /></IconButton>
                      <IconButton label="Salin checksum SHA-256" onClick={() => void checksum(r.fileName)}><Hash className="h-4 w-4" /></IconButton>
                      <IconButton label="Pulihkan dari backup" onClick={() => openRestore(r.fileName)}><RotateCcw className="h-4 w-4" /></IconButton>
                      <IconButton label="Hapus backup" onClick={() => setDeleting(r.fileName)}><Trash2 className="h-4 w-4" /></IconButton>
                    </div>
                  ),
                },
              ]}
            />
          </>
        )}

        {tab === 'logs' && (
          <DataTable
            rows={logs}
            loading={query.loading}
            empty={<EmptyState compact title="Belum ada riwayat backup" />}
            columns={[
              { key: 'createdAt', header: 'Waktu', render: (r) => formatDateTime(r.createdAt) },
              { key: 'fileName', header: 'Berkas', render: (r) => (
                <div>
                  <p className="font-mono text-[11px] font-medium">{r.fileName}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">{r.fileExists ? 'Berkas tersedia' : 'Berkas tidak ditemukan'}</p>
                </div>
              ) },
              { key: 'type', header: 'Jenis', render: (r) => TYPE_LABELS[r.type] ?? r.type },
              { key: 'status', header: 'Status', render: (r) => <Badge tone={r.status === 'SUCCESS' ? 'green' : r.status === 'RESTORED' ? 'gold' : 'red'}>{r.status}</Badge> },
              { key: 'sizeBytes', header: 'Ukuran', align: 'right', render: (r) => formatBytes(r.sizeBytes) },
              { key: 'encryption', header: 'Enkripsi', render: (r) => <span className="text-[11px]">{r.encryption}</span> },
              { key: 'createdBy', header: 'Dibuat Oleh', render: (r) => r.createdBy?.fullName ?? 'Sistem' },
              { key: 'notes', header: 'Catatan', render: (r) => <span className="text-xs text-slate-500 dark:text-slate-400">{r.notes || '—'}</span> },
            ]}
          />
        )}
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Buat Backup"
        subtitle="Basis data dan dokumen dibungkus lalu dienkripsi AES-256-GCM."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={createBusy}>Batal</Button>
            <Button variant="gold" onClick={() => void createBackup()} loading={createBusy}><DatabaseBackup className="h-4 w-4" /> Buat Backup</Button>
          </>
        }
      >
        <div className="space-y-3">
          {createError && <Alert tone="danger">{createError}</Alert>}
          <Field label="Passphrase Backup" hint="Opsional. Kosongkan untuk memakai kunci vault yang sedang terbuka. Jika diisi, simpan passphrase ini — tidak dapat dipulihkan aplikasi.">
            <Input type="password" value={createForm.passphrase} onChange={(e) => setCreateForm((f) => ({ ...f, passphrase: e.target.value }))} placeholder="Minimal 8 karakter" />
          </Field>
          <Toggle
            checked={createForm.includeDocuments}
            onChange={(v) => setCreateForm((f) => ({ ...f, includeDocuments: v }))}
            label="Sertakan dokumen"
            description="Menyertakan seluruh berkas dokumen ke dalam arsip backup terenkripsi."
          />
          <Field label="Catatan">
            <Textarea value={createForm.note} onChange={(e) => setCreateForm((f) => ({ ...f, note: e.target.value }))} placeholder="Misalnya: backup akhir bulan" />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!validating}
        onClose={() => setValidating(null)}
        title="Validasi Backup"
        subtitle={validating ?? undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setValidating(null)} disabled={validateBusy}>Tutup</Button>
            <Button variant="gold" onClick={() => void runValidate()} loading={validateBusy}><ShieldCheck className="h-4 w-4" /> Validasi</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Passphrase" hint="Isi jika backup dibuat dengan passphrase.">
            <Input type="password" value={validatePass} onChange={(e) => setValidatePass(e.target.value)} placeholder="Opsional" />
          </Field>
          {validateResult && (
            <Alert tone={validateResult.ok ? 'success' : 'danger'} title={validateResult.ok ? 'Backup valid' : 'Backup tidak valid'}>
              <div className="mt-1 space-y-1 text-xs">
                <p>{validateResult.detail}</p>
                {validateResult.manifest && (
                  <div className="mt-2 space-y-0.5">
                    <p>Dibuat: {formatDateTime(validateResult.manifest.createdAt)} · Versi {validateResult.manifest.appVersion}</p>
                    <p>Skema: {validateResult.manifest.schemaMigration} · Dokumen: {validateResult.manifest.documentsIncluded ? 'disertakan' : 'tidak disertakan'}</p>
                    <p>Jumlah tabel: {validateResult.manifest.tables?.length ?? 0} · Checksum DB: <span className="break-all font-mono">{String(validateResult.manifest.dbSha256).slice(0, 24)}…</span></p>
                  </div>
                )}
              </div>
            </Alert>
          )}
        </div>
      </Modal>

      <Modal
        open={!!restoring}
        onClose={() => setRestoring(null)}
        title="Pulihkan dari Backup"
        subtitle={restoring ?? undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRestoring(null)} disabled={restoreBusy}>Batal</Button>
            <Button
              variant="danger"
              onClick={() => void runRestore()}
              loading={restoreBusy}
              disabled={restoreConfirm.trim().toUpperCase() !== 'PULIHKAN'}
            >
              <RotateCcw className="h-4 w-4" /> Pulihkan Sekarang
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Alert tone="danger" title="Tindakan ini menimpa data aktif">
            <span className="text-xs">Basis data dan dokumen saat ini akan diganti dengan isi backup. Aplikasi otomatis membuat backup pengaman sebelum restorasi. Semua sesi diakhiri dan Anda harus masuk kembali setelahnya.</span>
          </Alert>
          {restoreError && <Alert tone="danger">{restoreError}</Alert>}
          <Field label="Passphrase" hint="Isi jika backup dibuat dengan passphrase.">
            <Input type="password" value={restorePass} onChange={(e) => setRestorePass(e.target.value)} placeholder="Opsional" />
          </Field>
          <Field label="Konfirmasi" required hint="Ketik PULIHKAN (huruf besar) untuk mengaktifkan tombol.">
            <Input value={restoreConfirm} onChange={(e) => setRestoreConfirm(e.target.value)} placeholder="PULIHKAN" />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="Hapus Berkas Backup"
        description={<>Berkas <b className="break-all font-mono">{deleting}</b> akan dihapus dari folder backup. Tindakan ini tidak dapat dibatalkan dan tercatat di audit log.</>}
        confirmLabel="Hapus Berkas"
        danger
        loading={deleteBusy}
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleting(null)}
      />

      <Card className="p-4">
        <SectionTitle title="Praktik aman" subtitle="Backup yang baik disimpan di media terpisah." />
        <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          <li>• Salin berkas <span className="font-mono">.npbackup</span> ke hard disk eksternal atau penyimpanan kantor lain secara berkala.</li>
          <li>• Backup passphrase berbeda dari master password vault; simpan keduanya di tempat aman terpisah.</li>
          <li>• Lakukan validasi backup secara berkala untuk memastikan arsip dapat dipulihkan.</li>
        </ul>
      </Card>
    </div>
  )
}
