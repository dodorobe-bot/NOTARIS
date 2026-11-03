import { useState } from 'react'
import { KeyRound, Lock, ShieldCheck, Trash2 } from 'lucide-react'
import { call, useQuery } from '@/api'
import type { SessionInfo } from '@/types'
import {
  Alert, Badge, Button, Card, ConfirmDialog, DataTable, DescriptionList, Field, IconButton, Input,
  Modal, SectionTitle, Select, Textarea, Toggle, useToast,
} from '@/components/ui'
import { GOVERNMENT_AGENCIES, governmentAgencyLabel } from '@shared/government'
import { formatDateTime } from '@shared/format'
import { PortalAnchor } from './parts'

const emptyCred = { agency: 'AHU', label: '', accountHint: '', secret: '' }

export function ConfigTab({ session }: { session: SessionInfo }) {
  const toast = useToast()
  const config = useQuery<any>('government.config.get', {})
  const [notesByAgency, setNotesByAgency] = useState<Record<string, string>>({})
  const [savingNotes, setSavingNotes] = useState<string | null>(null)
  const [credOpen, setCredOpen] = useState(false)
  const [credForm, setCredForm] = useState<any>(emptyCred)
  const [credBusy, setCredBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null)
  const [errors, setErrors] = useState<string | null>(null)

  const canManage = session.permissions.includes('government.manage')
  const d = config.data
  const encryption = d?.encryption ?? { available: false, algorithm: 'tidak tersedia' }

  function notesFor(agency: string): string {
    const typed = (config.data as any)?.agencies?.find((a: any) => a.agency === agency)
    return notesByAgency[agency] ?? typed?.notes ?? ''
  }

  async function saveNotes(agency: string) {
    setSavingNotes(agency)
    try {
      await call('government.config.update', { agency, notes: notesFor(agency), apiEnabled: false })
      toast.success(`Catatan konfigurasi ${governmentAgencyLabel(agency)} disimpan.`)
      await config.reload(true)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSavingNotes(null)
    }
  }

  async function saveCredential() {
    setErrors(null)
    if (credForm.label.trim().length < 2) { setErrors('Nama kredensial minimal 2 karakter.'); return }
    if (credForm.secret.length < 4) { setErrors('Rahasia minimal 4 karakter.'); return }
    setCredBusy(true)
    try {
      await call('government.credentials.save', {
        agency: credForm.agency,
        label: credForm.label.trim(),
        accountHint: credForm.accountHint.trim() || undefined,
        secret: credForm.secret,
      })
      toast.success('Kredensial tersimpan terenkripsi.')
      setCredForm(emptyCred)
      setCredOpen(false)
      await config.reload(true)
    } catch (err) {
      setErrors((err as Error).message)
    } finally {
      setCredBusy(false)
    }
  }

  async function testCredential(row: any) {
    try {
      const res = await call<any>('government.credentials.test', { id: row.id })
      toast.success(`Kredensial "${row.label}" terbaca kembali (${res.decryptedLength} karakter, tidak ditampilkan).`)
      await config.reload(true)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function deleteCredential(row: any) {
    try {
      await call('government.credentials.delete', { id: row.id })
      toast.success(`Kredensial "${row.label}" dihapus.`)
      setConfirmDelete(null)
      await config.reload(true)
    } catch (err) {
      setConfirmDelete(null)
      toast.error((err as Error).message)
    }
  }

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Mode & kredensial gateway"
        subtitle="Kondisi nyata integrasi: jalur semi-otomatis, kredensial terenkripsi perangkat, dan status API resmi per instansi."
        action={
          canManage ? (
            <Button variant="secondary" onClick={() => { setCredForm({ ...emptyCred }); setCredOpen(true) }}>
              <KeyRound className="h-4 w-4" /> Simpan Kredensial
            </Button>
          ) : undefined
        }
      />

      <Alert tone="info" title="Mode berjalan: semi-otomatis (Level 1–2)">
        Aplikasi menyiapkan berkas, membuka portal resmi pada browser sistem, lalu mencatat kembali hasil yang operator
        lihat. Tidak ada scraping, tidak ada bypass autentikasi atau CAPTCHA. Level 3 (API) baru dapat aktif setelah
        penyelenggara menerbitkan dokumentasi API resmi dan pengujian dengan akses resmi berhasil.
      </Alert>

      {config.error && <Alert tone="danger" title="Gagal memuat konfigurasi">{config.error}</Alert>}

      <Card className="p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            <p className="font-semibold text-navy-900 dark:text-slate-100">Penyimpanan rahasia</p>
            <p className="mt-1">
              Enkripsi kredensial di perangkat ini: <strong>{encryption.algorithm}</strong>{' '}
              <Badge tone={encryption.available ? 'green' : 'red'}>{encryption.available ? 'tersedia' : 'tidak tersedia'}</Badge>
            </p>
            {!encryption.available && (
              <p className="mt-1 text-amber-800 dark:text-amber-300">
                Saat enkripsi perangkat tidak tersedia, aplikasi menolak menyimpan rahasia portal. Gunakan hanya
                pencatatan manual sampai kondisi ini diperbaiki.
              </p>
            )}
          </div>
        </div>
      </Card>

      {(d?.agencies ?? []).map((a: any) => (
        <Card key={a.agency} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-navy-900 dark:text-white">{a.label}</p>
              <p className="mt-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">{a.portalUrl}</p>
            </div>
            <PortalAnchor url={a.portalUrl} label="Buka portal resmi" />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone="blue">Mode: semi-otomatis</Badge>
            <Badge tone={a.officialApiAvailable ? 'green' : 'gray'}>
              API resmi: {a.officialApiAvailable ? 'tersedia' : 'belum tersedia'}
            </Badge>
            <Badge tone={a.automatedSubmission ? 'green' : 'gray'}>
              Pengajuan otomatis: {a.automatedSubmission ? 'aktif' : 'tidak'}
            </Badge>
            <Badge tone={a.apiEnabled ? 'green' : 'amber'}>API aktif di aplikasi: {a.apiEnabled ? 'ya' : 'tidak'}</Badge>
            <Badge tone="neutral">{a.submissionCount} pengajuan tercatat</Badge>
          </div>

          <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{a.note}</p>

          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-navy-800 dark:bg-navy-900">
            <Toggle
              checked={false}
              disabled
              onChange={() => undefined}
              label="Aktifkan pengiriman API otomatis"
              description="Terkunci sampai dokumentasi API resmi tersedia dan pengujian dengan akses resmi lulus."
            />
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <Field
              label="Catatan operasional"
              hint={a.updatedAt ? `Terakhir diubah ${formatDateTime(a.updatedAt)}` : 'Belum pernah disimpan.'}
            >
              <Textarea
                value={notesFor(a.agency)}
                maxLength={1000}
                placeholder="mis. akun portal dikelola sekretaris, verifikasi dokumen memerlukan SKDP asli"
                onChange={(e) => setNotesByAgency((prev) => ({ ...prev, [a.agency]: e.target.value }))}
              />
            </Field>
            <div className="flex items-end">
              <Button variant="primary" loading={savingNotes === a.agency} onClick={() => void saveNotes(a.agency)}>
                Simpan catatan
              </Button>
            </div>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Kredensial tersimpan
            </p>
            <DataTable
              rows={a.credentials ?? []}
              loading={config.loading}
              columns={[
                { key: 'label', header: 'Nama', render: (r) => <span className="font-medium">{r.label}</span> },
                { key: 'accountHint', header: 'Petunjuk akun', render: (r) => r.accountHint || <span className="text-slate-400">—</span> },
                {
                  key: 'algorithm', header: 'Enkripsi',
                  render: (r) => (
                    <div className="flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span className="font-mono text-[11px]">{r.algorithm}</span>
                    </div>
                  ),
                },
                { key: 'lastUsedAt', header: 'Uji terakhir', render: (r) => (r.lastUsedAt ? formatDateTime(r.lastUsedAt) : 'belum diuji') },
                { key: 'createdAt', header: 'Disimpan', render: (r) => <span className="text-xs">{formatDateTime(r.createdAt)}</span> },
                {
                  key: 'actions', header: '', align: 'right', width: 96,
                  render: (r) => (
                    <div className="flex justify-end gap-0.5">
                      <IconButton label="Uji pembacaan" onClick={() => void testCredential(r)}>
                        <ShieldCheck className="h-4 w-4" />
                      </IconButton>
                      {canManage && (
                        <IconButton label="Hapus kredensial" className="!text-red-500" onClick={() => setConfirmDelete(r)}>
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      )}
                    </div>
                  ),
                },
              ]}
              empty={
                <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  Belum ada kredensial untuk instansi ini. Kredensial hanya diperlukan bila Anda ingin menyimpan petunjuk
                  login portal; aplikasi tidak pernah mengirimkannya ke luar.
                </div>
              }
            />
          </div>
        </Card>
      ))}

      {d && (
        <Card className="p-4">
          <DescriptionList
            columns={2}
            items={[
              { label: 'Layanan terdaftar', value: `${d.agencies?.[0]?.serviceCount ?? 0} layanan aktif` },
              { label: 'Portal AHU', value: <span className="font-mono text-[11px]">{d.portals.AHU}</span> },
              { label: 'Portal ATR/BPN', value: <span className="font-mono text-[11px]">{d.portals.BPN}</span> },
              { label: 'Algoritma enkripsi kredensial', value: d.encryption.algorithm },
              { label: 'Kredensial plaintext disimpan', value: 'Tidak — hanya ciphertext dengan awalan dpapi:' },
              { label: 'Pengiriman berkas otomatis', value: 'Tidak — unggah selalu dilakukan operator di portal resmi' },
            ]}
          />
        </Card>
      )}

      <Modal
        open={credOpen}
        onClose={() => { setCredOpen(false); setErrors(null) }}
        title="Simpan kredensial portal"
        subtitle="Rahasia dienkripsi dengan penyimpanan aman Windows dan tidak pernah ditampilkan kembali."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setCredOpen(false); setErrors(null) }}>Batal</Button>
            <Button variant="primary" loading={credBusy} onClick={() => void saveCredential()}>Simpan terenkripsi</Button>
          </>
        }
      >
        <div className="space-y-3">
          {errors && <Alert tone="danger" title="Kredensial ditolak">{errors}</Alert>}
          <Field label="Instansi" required>
            <Select value={credForm.agency} onChange={(e) => setCredForm((f: any) => ({ ...f, agency: e.target.value }))}>
              {GOVERNMENT_AGENCIES.map((a) => <option key={a.value} value={a.value}>{governmentAgencyLabel(a.value)}</option>)}
            </Select>
          </Field>
          <Field label="Nama kredensial" required hint="Contoh: akun-ahu-harian. Nama ini yang muncul di daftar.">
            <Input
              value={credForm.label}
              maxLength={80}
              placeholder="akun-ahu-harian"
              onChange={(e) => setCredForm((f: any) => ({ ...f, label: e.target.value }))}
            />
          </Field>
          <Field label="Petunjuk akun" hint="Boleh kosong. Simpan hanya petunjuk non-rahasia, mis. inisial atau nama pengguna.">
            <Input
              value={credForm.accountHint}
              maxLength={120}
              placeholder="inisial petugas / nama pengguna"
              onChange={(e) => setCredForm((f: any) => ({ ...f, accountHint: e.target.value }))}
            />
          </Field>
          <Field label="Rahasia" required hint="Disimpan sebagai ciphertext. Nilai tidak dapat dibaca ulang dari layar.">
            <Input
              type="password"
              value={credForm.secret}
              maxLength={300}
              autoComplete="new-password"
              placeholder="••••••••"
              onChange={(e) => setCredForm((f: any) => ({ ...f, secret: e.target.value }))}
            />
          </Field>
          <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            Menyimpan kata sandi portal tidak membuat aplikasi dapat masuk otomatis. Autentikasi portal tetap dilakukan
            operator di browser; aplikasi tidak pernah membaca halaman portal.
          </p>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        title="Hapus kredensial?"
        confirmLabel="Ya, hapus"
        danger
        description={
          confirmDelete
            ? `Ciphertext kredensial "${confirmDelete.label}" (${governmentAgencyLabel(confirmDelete.agency)}) dihapus dari penyimpanan. ` +
              'Penghapusan tercatat pada log gateway dan audit trail, dan tidak dapat dibatalkan.'
            : undefined
        }
        onConfirm={() => confirmDelete && void deleteCredential(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  )
}
