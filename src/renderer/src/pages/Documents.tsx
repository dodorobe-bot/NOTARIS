import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Download, Eye, FileText, FolderOpen, History, Lock, Pencil, Plus, RefreshCw, Trash2, Upload,
} from 'lucide-react'
import { call, useDebounced, useQuery } from '@/api'
import type { SessionInfo } from '@/types'
import {
  Alert, Badge, Button, Card, ConfirmDialog, DataTable, EmptyState, Field, IconButton, Input,
  Modal, PageHeader, Pagination, SearchInput, Select, Spinner, Textarea, useToast,
} from '@/components/ui'
import { formatBytes, formatDateTime } from '@shared/format'

interface PickedFile { path: string; name: string; sizeBytes: number; mimeType: string }

export function Documents({ session }: { session: SessionInfo }) {
  const { id: routeId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const canManage = session.permissions.includes('documents.manage')

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const debounced = useDebounced(search)

  const [uploadOpen, setUploadOpen] = useState(false)
  const [picked, setPicked] = useState<PickedFile | null>(null)
  const [uploadForm, setUploadForm] = useState<any>({
    title: '', categoryId: '', clientId: '', transactionId: '', deedId: '', notes: '', isConfidential: false,
  })
  const [errors, setErrors] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [editing, setEditing] = useState<any | null>(null)
  const [editForm, setEditForm] = useState<any>({ title: '', categoryId: '', notes: '', isConfidential: false, clientId: '', transactionId: '', deedId: '' })
  const [deleting, setDeleting] = useState<any | null>(null)

  const [preview, setPreview] = useState<any | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [versionsOf, setVersionsOf] = useState<any | null>(null)

  const query = useQuery<any>('documents.list', { page, pageSize: 20, search: debounced, categoryId: categoryId || undefined })
  const categories = useQuery<any[]>('documents.categories')
  const clients = useQuery<any[]>('clients.options', {}, { enabled: uploadOpen || !!editing })
  const transactions = useQuery<any[]>('transactions.options', {}, { enabled: (uploadOpen || !!editing) && session.permissions.includes('transactions.view') })
  const deeds = useQuery<any>('deeds.list', { page: 1, pageSize: 200 }, { enabled: (uploadOpen || !!editing) && session.permissions.includes('deeds.view') })
  const versions = useQuery<any[]>('documents.versions', { id: versionsOf?.id }, { enabled: !!versionsOf })

  useEffect(() => {
    if (!canManage) return
    if (params.get('upload') === '1') {
      openUpload()
      params.delete('upload')
      params.delete('clientId')
      params.delete('transactionId')
      setParams(params, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (routeId) void openPreview(routeId, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId])

  function openUpload() {
    setPicked(null)
    setErrors(null)
    setUploadForm({
      title: '', categoryId: categories.data?.[0]?.id ?? '', clientId: params.get('clientId') ?? '',
      transactionId: params.get('transactionId') ?? '', deedId: '', notes: '', isConfidential: false,
    })
    setUploadOpen(true)
  }

  async function pickFile() {
    try {
      const file = await call<PickedFile | null>('documents.pick')
      if (!file) return
      setPicked(file)
      setUploadForm((f: any) => ({
        ...f,
        title: f.title || file.name.replace(/\.[^.]+$/, ''),
        categoryId: f.categoryId || categories.data?.[0]?.id || '',
      }))
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function upload() {
    if (!picked) return setErrors('Pilih berkas terlebih dahulu.')
    if (!uploadForm.title?.trim()) return setErrors('Judul dokumen wajib diisi.')
    if (!uploadForm.categoryId) return setErrors('Kategori dokumen wajib dipilih.')
    setBusy(true)
    setErrors(null)
    try {
      await call('documents.upload', {
        tempPath: picked.path,
        originalName: picked.name,
        title: uploadForm.title.trim(),
        categoryId: uploadForm.categoryId,
        clientId: uploadForm.clientId || null,
        transactionId: uploadForm.transactionId || null,
        deedId: uploadForm.deedId || null,
        notes: uploadForm.notes || null,
        isConfidential: !!uploadForm.isConfidential,
      })
      toast.success('Dokumen berhasil diunggah dan dicatat pada audit.')
      setUploadOpen(false)
      void query.reload(true)
    } catch (err) {
      setErrors((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function openPreview(docId: string, setLoading = true) {
    if (setLoading) setPreviewLoading(true)
    try {
      const result = await call<any>('documents.preview', { id: docId })
      setPreview({ ...result, id: docId })
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setPreviewLoading(false)
    }
  }

  async function openExternal(docId: string) {
    try {
      await call('documents.openExternal', { id: docId })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function download(docId: string) {
    try {
      const result = await call<any>('documents.download', { id: docId })
      if (!result.canceled) toast.success(`Dokumen disalin ke ${result.filePath}`)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  function openEdit(row: any) {
    setEditing(row)
    setEditForm({
      title: row.title,
      categoryId: row.categoryId,
      notes: row.notes ?? '',
      isConfidential: !!row.isConfidential,
      clientId: row.clientId ?? '',
      transactionId: row.transactionId ?? '',
      deedId: row.deedId ?? '',
    })
    setErrors(null)
  }

  async function saveEdit() {
    if (!editForm.title?.trim()) return setErrors('Judul dokumen wajib diisi.')
    if (!editForm.categoryId) return setErrors('Kategori wajib dipilih.')
    setBusy(true)
    setErrors(null)
    try {
      await call('documents.update', {
        id: editing.id,
        title: editForm.title.trim(),
        categoryId: editForm.categoryId,
        notes: editForm.notes || null,
        isConfidential: !!editForm.isConfidential,
        clientId: editForm.clientId || null,
        transactionId: editForm.transactionId || null,
        deedId: editForm.deedId || null,
      })
      toast.success('Metadata dokumen diperbarui.')
      setEditing(null)
      void query.reload(true)
    } catch (err) {
      setErrors((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function replaceFile(row: any) {
    try {
      const file = await call<PickedFile | null>('documents.pick')
      if (!file) return
      await call('documents.replace', { id: row.id, tempPath: file.path, originalName: file.name, notes: 'Revisi berkas dari menu dokumen' })
      toast.success('Berkas baru disimpan sebagai versi terbaru; versi lama tetap tersimpan.')
      void query.reload(true)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function remove() {
    if (!deleting) return
    setBusy(true)
    try {
      await call('documents.delete', { id: deleting.id })
      toast.success('Dokumen dihapus dari daftar; berkas fisik dipertahankan untuk audit.')
      setDeleting(null)
      void query.reload(true)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const deedOptions = useMemo(() => deeds.data?.items ?? [], [deeds.data])

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operasional"
        title="Dokumen"
        subtitle="Penyimpanan dokumen terpusat dengan kategori, keterkaitan klien/transaksi/akta, versi, dan jejak audit."
        actions={canManage ? <Button onClick={openUpload}><Upload className="h-4 w-4" /> Unggah Dokumen</Button> : undefined}
      />

      <Card className="p-3">
        <div className="grid gap-2 md:grid-cols-[1fr_240px]">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Cari judul, nama berkas, atau catatan…" />
          <Select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1) }} aria-label="Saring kategori dokumen">
            <option value="">Semua kategori</option>
            {(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
      </Card>

      {query.error && <Alert tone="danger" title="Gagal memuat dokumen">{query.error}</Alert>}

      <Card className="overflow-hidden">
        <DataTable
          rows={query.data?.items ?? []}
          loading={query.loading}
          columns={[
            {
              key: 'title', header: 'Dokumen',
              render: (r) => (
                <div className="flex min-w-0 items-start gap-2">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.title}</p>
                    <p className="truncate font-mono text-[11px] text-slate-500">{r.fileName}</p>
                  </div>
                </div>
              ),
            },
            { key: 'category', header: 'Kategori', render: (r) => <Badge tone="neutral">{r.category?.name ?? '—'}</Badge> },
            {
              key: 'links', header: 'Terkait',
              render: (r) => (
                <div className="space-y-0.5 text-[11px] text-slate-500">
                  {r.client && <p>Klien: <span className="text-navy-800 dark:text-slate-300">{r.client.fullName}</span></p>}
                  {r.transaction && <p>Transaksi: <span className="font-mono">{r.transaction.code}</span></p>}
                  {r.deed && <p>Akta: <span className="font-mono">{r.deed.deedNumber}</span></p>}
                  {!r.client && !r.transaction && !r.deed && <span className="text-slate-400">Tidak tertaut</span>}
                </div>
              ),
            },
            { key: 'version', header: 'Versi', render: (r) => <Badge tone="blue">v{r.version}</Badge> },
            { key: 'sizeBytes', header: 'Ukuran', align: 'right', render: (r) => formatBytes(r.sizeBytes) },
            { key: 'uploadedBy', header: 'Diunggah oleh', render: (r) => <div><p>{r.uploadedBy?.fullName ?? '—'}</p><p className="text-[11px] text-slate-500">{formatDateTime(r.createdAt)}</p></div> },
            { key: 'confidential', header: 'Akses', render: (r) => r.isConfidential ? <Badge tone="red"><Lock className="mr-1 h-3 w-3" />Rahasia</Badge> : <Badge tone="green">Normal</Badge> },
            {
              key: 'actions', header: '', align: 'right', width: 200,
              render: (r) => (
                <div className="flex justify-end gap-0.5">
                  <IconButton label="Pratinjau" onClick={() => void openPreview(r.id)}><Eye className="h-4 w-4" /></IconButton>
                  <IconButton label="Buka dengan aplikasi" onClick={() => void openExternal(r.id)}><FolderOpen className="h-4 w-4" /></IconButton>
                  <IconButton label="Unduh salinan" onClick={() => void download(r.id)}><Download className="h-4 w-4" /></IconButton>
                  <IconButton label="Riwayat versi" onClick={() => setVersionsOf(r)}><History className="h-4 w-4" /></IconButton>
                  {canManage && <IconButton label="Ganti berkas" onClick={() => void replaceFile(r)}><RefreshCw className="h-4 w-4" /></IconButton>}
                  {canManage && <IconButton label="Ubah metadata" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></IconButton>}
                  {canManage && <IconButton label="Hapus dokumen" onClick={() => setDeleting(r)}><Trash2 className="h-4 w-4 text-red-500" /></IconButton>}
                </div>
              ),
            },
          ]}
          empty={<EmptyState title="Belum ada dokumen" description="Unggah KTP, NPWP, sertifikat, legalitas, atau dokumen pendukung lainnya." action={canManage ? <Button onClick={openUpload}><Plus className="h-4 w-4" /> Unggah Dokumen</Button> : undefined} />}
        />
        {query.data && (
          <Pagination page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} totalPages={query.data.totalPages} onPage={setPage} />
        )}
      </Card>

      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Unggah Dokumen"
        subtitle="Berkas disalin ke penyimpanan aplikasi dengan nama unik dan checksum SHA-256."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setUploadOpen(false)} disabled={busy}>Batal</Button>
            <Button onClick={() => void upload()} loading={busy} disabled={!picked}>Unggah Dokumen</Button>
          </>
        }
      >
        <div className="space-y-4">
          {errors && <Alert tone="danger">{errors}</Alert>}
          <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center dark:border-navy-700">
            <Upload className="mx-auto h-6 w-6 text-slate-400" />
            <p className="mt-2 text-sm font-medium text-navy-900 dark:text-slate-200">{picked ? picked.name : 'Belum ada berkas dipilih'}</p>
            {picked && <p className="text-xs text-slate-500">{formatBytes(picked.sizeBytes)} · {picked.mimeType}</p>}
            <Button variant="secondary" className="mt-3 !py-1.5 text-xs" onClick={() => void pickFile()}>Pilih Berkas…</Button>
            <p className="mt-2 text-[11px] text-slate-400">PDF, DOCX, XLSX, JPG, atau PNG.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Judul Dokumen" required className="sm:col-span-2">
              <Input value={uploadForm.title} onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })} maxLength={300} />
            </Field>
            <Field label="Kategori" required>
              <Select value={uploadForm.categoryId} onChange={(e) => setUploadForm({ ...uploadForm, categoryId: e.target.value })}>
                <option value="">Pilih kategori…</option>
                {(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Klien">
              <Select value={uploadForm.clientId} onChange={(e) => setUploadForm({ ...uploadForm, clientId: e.target.value })}>
                <option value="">Tidak ditautkan</option>
                {(clients.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.code} — {c.fullName}</option>)}
              </Select>
            </Field>
            {session.permissions.includes('transactions.view') && (
              <Field label="Transaksi">
                <Select value={uploadForm.transactionId} onChange={(e) => setUploadForm({ ...uploadForm, transactionId: e.target.value })}>
                  <option value="">Tidak ditautkan</option>
                  {(transactions.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.code} — {t.title}</option>)}
                </Select>
              </Field>
            )}
            {session.permissions.includes('deeds.view') && (
              <Field label="Akta">
                <Select value={uploadForm.deedId} onChange={(e) => setUploadForm({ ...uploadForm, deedId: e.target.value })}>
                  <option value="">Tidak ditautkan</option>
                  {deedOptions.map((d: any) => <option key={d.id} value={d.id}>{d.deedNumber} — {d.client?.fullName}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Catatan" className="sm:col-span-2">
              <Textarea value={uploadForm.notes} onChange={(e) => setUploadForm({ ...uploadForm, notes: e.target.value })} maxLength={1000} />
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className="h-4 w-4 accent-gold-500" checked={!!uploadForm.isConfidential} onChange={(e) => setUploadForm({ ...uploadForm, isConfidential: e.target.checked })} />
              Tandai sebagai dokumen rahasia
            </label>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Ubah Metadata Dokumen"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={busy}>Batal</Button>
            <Button onClick={() => void saveEdit()} loading={busy}>Simpan</Button>
          </>
        }
      >
        <div className="space-y-4">
          {errors && <Alert tone="danger">{errors}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Judul Dokumen" required className="sm:col-span-2">
              <Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
            </Field>
            <Field label="Kategori" required>
              <Select value={editForm.categoryId} onChange={(e) => setEditForm({ ...editForm, categoryId: e.target.value })}>
                {(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Klien">
              <Select value={editForm.clientId} onChange={(e) => setEditForm({ ...editForm, clientId: e.target.value })}>
                <option value="">Tidak ditautkan</option>
                {(clients.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.code} — {c.fullName}</option>)}
              </Select>
            </Field>
            <Field label="Catatan" className="sm:col-span-2">
              <Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className="h-4 w-4 accent-gold-500" checked={!!editForm.isConfidential} onChange={(e) => setEditForm({ ...editForm, isConfidential: e.target.checked })} />
              Dokumen rahasia
            </label>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!preview}
        onClose={() => { setPreview(null); if (routeId) navigate('/dokumen', { replace: true }) }}
        title={preview?.fileName ?? 'Pratinjau Dokumen'}
        subtitle={preview ? [preview.mimeType, preview.sourceBytes ? formatBytes(preview.sourceBytes) : null, preview.thumbnail ? `thumbnail ${preview.width}×${preview.height}` : null].filter(Boolean).join(' · ') : undefined}
        size="xl"
        footer={
          <>
            {preview?.id && <Button variant="secondary" onClick={() => void openExternal(preview.id)}><FolderOpen className="h-4 w-4" /> Buka Aplikasi</Button>}
            {preview?.id && <Button variant="secondary" onClick={() => void download(preview.id)}><Download className="h-4 w-4" /> Unduh</Button>}
            <Button onClick={() => { setPreview(null); if (routeId) navigate('/dokumen', { replace: true }) }}>Tutup</Button>
          </>
        }
      >
        {previewLoading ? (
          <div className="flex h-64 items-center justify-center"><Spinner className="h-6 w-6" /></div>
        ) : preview?.kind === 'image' && preview.dataUrl ? (
          <div className="flex max-h-[60vh] justify-center overflow-auto rounded-lg bg-slate-100 p-3 dark:bg-navy-900">
            <img src={preview.dataUrl} alt={preview.fileName} className="max-h-[56vh] object-contain" />
          </div>
        ) : preview?.kind === 'pdf' && preview.dataUrl ? (
          <iframe title="Pratinjau PDF" src={preview.dataUrl} className="h-[60vh] w-full rounded-lg border border-slate-200 dark:border-navy-800" />
        ) : (
          <Alert tone={preview?.kind === 'missing' ? 'danger' : 'warn'} title={preview?.kind === 'missing' ? 'Berkas tidak ditemukan' : 'Pratinjau tidak tersedia'}>
            {preview?.reason ?? 'Gunakan Buka Aplikasi atau Unduh untuk membuka berkas ini.'}
          </Alert>
        )}
      </Modal>

      <Modal
        open={!!versionsOf}
        onClose={() => setVersionsOf(null)}
        title={`Riwayat Versi — ${versionsOf?.title ?? ''}`}
        subtitle="Versi lama tidak dihapus agar jejak dokumen tetap utuh."
        size="lg"
      >
        <DataTable
          rows={versions.data ?? []}
          virtualize
          loading={versions.loading}
          columns={[
            { key: 'version', header: 'Versi', render: (r) => <Badge tone="blue">v{r.version}</Badge> },
            { key: 'fileName', header: 'Berkas', render: (r) => <span className="font-mono text-[11px]">{r.fileName}</span> },
            { key: 'sizeBytes', header: 'Ukuran', align: 'right', render: (r) => formatBytes(r.sizeBytes) },
            { key: 'uploadedBy', header: 'Oleh', render: (r) => r.uploadedBy?.fullName ?? '—' },
            { key: 'createdAt', header: 'Waktu', render: (r) => formatDateTime(r.createdAt) },
            { key: 'notes', header: 'Catatan', render: (r) => r.notes ?? '—' },
          ]}
          empty={<EmptyState compact title="Belum ada versi" />}
        />
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => void remove()}
        loading={busy}
        danger
        title="Hapus dokumen?"
        confirmLabel="Hapus Dokumen"
        description={<span>Dokumen <b>{deleting?.title}</b> akan dihapus dari daftar. Berkas fisik dipertahankan untuk keperluan audit, dan dokumen induk akta tidak dapat dihapus.</span>}
      />
    </div>
  )
}
