import { useEffect, useMemo, useState } from 'react'
import {
  Building2, FolderOpen, KeyRound, LockKeyhole, RefreshCw,
  Save, Settings2, ShieldCheck, Trash2, Upload,
} from 'lucide-react'
import { call, useQuery } from '@/api'
import type { SessionInfo } from '@/types'
import {
  Alert, Badge, Button, Card, ConfirmDialog, Field, IconButton, Input, Modal, PageHeader,
  SectionTitle, Select, Tabs, Textarea, Toggle, useToast,
} from '@/components/ui'
import { formatBytes, formatDateTime, toDateInput } from '@shared/format'

type SettingsTab = 'kantor' | 'sistem' | 'keuangan' | 'keamanan' | 'penomoran' | 'template' | 'vault'

const LABELS: Record<string, string> = {
  'office.name': 'Nama Kantor',
  'office.notaryName': 'Nama Notaris Penanggung Jawab',
  'office.address': 'Alamat Kantor',
  'office.city': 'Kota Kedudukan',
  'office.phone': 'Telepon Kantor',
  'office.email': 'Email Kantor',
  'system.timezone': 'Zona Waktu',
  'system.dateFormat': 'Format Tanggal',
  'system.sessionTimeoutMinutes': 'Batas Idle Sesi (menit)',
  'system.autoBackupDaily': 'Backup Otomatis Harian',
  'system.preMigrationBackup': 'Backup Sebelum Migrasi',
  'system.backupRetention': 'Jumlah Backup Otomatis Disimpan',
  'finance.defaultTaxPercent': 'Persentase Pajak Bawaan Invoice',
  'finance.invoiceDueDays': 'Jatuh Tempo Invoice (hari)',
  'security.maxLoginAttempts': 'Percobaan Login Sebelum Jeda',
  'security.passwordMinLength': 'Panjang Minimal Password',
}

const SECTION_KEYS: Record<'kantor' | 'sistem' | 'keuangan' | 'keamanan', string[]> = {
  kantor: ['office.name', 'office.notaryName', 'office.address', 'office.city', 'office.phone', 'office.email'],
  sistem: ['system.timezone', 'system.dateFormat', 'system.sessionTimeoutMinutes', 'system.autoBackupDaily', 'system.preMigrationBackup', 'system.backupRetention'],
  keuangan: ['finance.defaultTaxPercent', 'finance.invoiceDueDays'],
  keamanan: ['security.maxLoginAttempts', 'security.passwordMinLength'],
}

const TEMPLATE_CATEGORIES = [
  { key: 'notary', label: 'Akta Notaris', description: 'Template draft dan minuta akta notaris.' },
  { key: 'ppat', label: 'Akta PPAT', description: 'Template akta pertanahan PPAT.' },
  { key: 'invoices', label: 'Invoice', description: 'Cadangan template invoice (PDF memakai tata letak bawaan).' },
]

const PLACEHOLDERS = [
  'nomor_akta', 'tanggal_akta', 'judul', 'jenis_akta', 'klien', 'kode_klien', 'penghadap',
  'komparisi', 'premis', 'isi', 'penutup', 'pihak', 'saksi', 'notaris', 'kantor', 'kota',
  'alamat_kantor', 'tanggal_cetak', 'status_akta',
]

export function SettingsPage({ session }: { session: SessionInfo }) {
  const toast = useToast()
  const canTemplates = session.permissions.includes('templates.manage')
  const [tab, setTab] = useState<SettingsTab>('kantor')
  const settings = useQuery<any>('settings.get')
  const sequences = useQuery<any[]>('settings.sequences')
  const templates = useQuery<any[]>('templates.list', {}, { enabled: canTemplates })

  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)

  const [seqEdits, setSeqEdits] = useState<Record<string, { prefix: string; pattern: string; resetPeriod: string }>>({})
  const [seqBusy, setSeqBusy] = useState<string | null>(null)

  const [uploading, setUploading] = useState<string | null>(null)
  const [deletingTemplate, setDeletingTemplate] = useState<{ category: string; fileName: string } | null>(null)
  const [templateBusy, setTemplateBusy] = useState(false)

  const [masterForm, setMasterForm] = useState({ current: '', next: '', confirm: '' })
  const [masterBusy, setMasterBusy] = useState(false)
  const [masterError, setMasterError] = useState<string | null>(null)

  const [regenOpen, setRegenOpen] = useState(false)
  const [regenBusy, setRegenBusy] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null)

  const [lockOpen, setLockOpen] = useState(false)
  const [lockBusy, setLockBusy] = useState(false)

  useEffect(() => {
    if (settings.data?.map && Object.keys(values).length === 0) setValues(settings.data.map)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.data])

  useEffect(() => {
    const list = sequences.data
    if (!list) return
    setSeqEdits((prev) => {
      const next = { ...prev }
      for (const s of list) {
        if (!next[s.key]) next[s.key] = { prefix: s.prefix, pattern: s.pattern, resetPeriod: s.resetPeriod }
      }
      return next
    })
  }, [sequences.data])

  const settingsByKey = useMemo(() => {
    const map: Record<string, any> = {}
    for (const row of settings.data?.settings ?? []) map[row.key] = row
    return map
  }, [settings.data])

  function setValue(key: string, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }))
  }

  async function saveKeys(section: string, keys: string[]) {
    const original = settings.data?.map ?? {}
    const changed: Record<string, string> = {}
    for (const k of keys) {
      if ((values[k] ?? '') !== (original[k] ?? '')) changed[k] = values[k] ?? ''
    }
    if (Object.keys(changed).length === 0) return toast.info('Tidak ada perubahan untuk disimpan.')
    const numericChecks: { key: string; min: number; max?: number; label: string }[] = [
      { key: 'system.sessionTimeoutMinutes', min: 5, max: 1440, label: LABELS['system.sessionTimeoutMinutes'] },
      { key: 'system.backupRetention', min: 1, max: 365, label: LABELS['system.backupRetention'] },
      { key: 'finance.defaultTaxPercent', min: 0, max: 100, label: LABELS['finance.defaultTaxPercent'] },
      { key: 'finance.invoiceDueDays', min: 0, max: 365, label: LABELS['finance.invoiceDueDays'] },
      { key: 'security.maxLoginAttempts', min: 1, max: 20, label: LABELS['security.maxLoginAttempts'] },
      { key: 'security.passwordMinLength', min: 8, max: 128, label: LABELS['security.passwordMinLength'] },
    ]
    for (const check of numericChecks) {
      if (!(check.key in changed)) continue
      const n = Number(changed[check.key])
      if (!Number.isFinite(n) || n < check.min || (check.max !== undefined && n > check.max)) {
        return toast.error(`${check.label} harus antara ${check.min} dan ${check.max ?? '∞'}.`)
      }
    }
    setSaving(section)
    try {
      const res = await call<any>('settings.update', { values: changed })
      setValues(res.map)
      toast.success('Pengaturan disimpan.')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(null)
    }
  }

  function renderInput(key: string) {
    const row = settingsByKey[key]
    const value = values[key] ?? ''
    if (key === 'office.address') {
      return <Textarea value={value} onChange={(e) => setValue(key, e.target.value)} placeholder={row?.description ?? ''} />
    }
    if (key === 'system.timezone') {
      return (
        <Select value={value} onChange={(e) => setValue(key, e.target.value)}>
          <option value="Asia/Jakarta">Asia/Jakarta (WIB)</option>
        </Select>
      )
    }
    if (key === 'system.dateFormat') {
      return (
        <Select value={value} onChange={(e) => setValue(key, e.target.value)}>
          <option value="DD-MM-YYYY">DD-MM-YYYY (contoh: 02-11-2026)</option>
        </Select>
      )
    }
    const numeric = ['system.sessionTimeoutMinutes', 'system.backupRetention', 'finance.defaultTaxPercent', 'finance.invoiceDueDays', 'security.maxLoginAttempts', 'security.passwordMinLength'].includes(key)
    return (
      <Input
        type={numeric ? 'number' : key === 'office.email' ? 'email' : 'text'}
        value={value}
        min={numeric ? 0 : undefined}
        onChange={(e) => setValue(key, e.target.value)}
        placeholder={row?.description ?? ''}
      />
    )
  }

  function saveButton(section: string, keys: string[]) {
    return (
      <Button variant="gold" onClick={() => void saveKeys(section, keys)} loading={saving === section}>
        <Save className="h-4 w-4" /> Simpan
      </Button>
    )
  }

  function sequencePreview(pattern: string, prefix: string) {
    const [year, month, day] = toDateInput(new Date()).split('-')
    return pattern
      .replace(/\{PREFIX\}/g, prefix)
      .replace(/\{YYYY\}/g, year)
      .replace(/\{YY\}/g, year.slice(-2))
      .replace(/\{MM\}/g, month)
      .replace(/\{DD\}/g, day)
      .replace(/\{SEQ:(\d+)\}/g, (_m, n: string) => '1'.padStart(Number(n), '0'))
  }

  async function saveSequence(key: string) {
    const edit = seqEdits[key]
    if (!edit) return
    if (!/\{SEQ:\d+\}/.test(edit.pattern)) return toast.error('Pola harus memuat {SEQ:n}, contoh {SEQ:4}.')
    setSeqBusy(key)
    try {
      await call('settings.updateSequence', {
        key, prefix: edit.prefix, pattern: edit.pattern, resetPeriod: edit.resetPeriod,
      })
      toast.success(`Penomoran ${key} diperbarui.`)
      await sequences.reload(true)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSeqBusy(null)
    }
  }

  async function uploadTemplate(category: string) {
    setUploading(category)
    try {
      const picked = await call<any>('templates.pick')
      if (!picked) return
      await call('templates.save', { category, fileName: picked.name, tempPath: picked.path })
      toast.success(`Template ${picked.name} diunggah ke kategori ${category}.`)
      await templates.reload(true)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setUploading(null)
    }
  }

  async function confirmDeleteTemplate() {
    if (!deletingTemplate) return
    setTemplateBusy(true)
    try {
      await call('templates.delete', deletingTemplate)
      toast.success(`Template ${deletingTemplate.fileName} dihapus.`)
      setDeletingTemplate(null)
      await templates.reload(true)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setTemplateBusy(false)
    }
  }

  async function changeMaster() {
    if (masterForm.next.length < 12) return setMasterError('Master password baru minimal 12 karakter.')
    if (masterForm.next !== masterForm.confirm) return setMasterError('Konfirmasi master password tidak sama.')
    setMasterBusy(true)
    setMasterError(null)
    try {
      await call('vault.changeMasterPassword', { currentMaster: masterForm.current, newMaster: masterForm.next })
      toast.success('Master password berhasil diubah. Kode pemulihan lama tidak berubah.')
      setMasterForm({ current: '', next: '', confirm: '' })
    } catch (err) {
      setMasterError((err as Error).message)
    } finally {
      setMasterBusy(false)
    }
  }

  async function regenerateRecovery() {
    setRegenBusy(true)
    try {
      const res = await call<{ recoveryCode: string }>('vault.regenerateRecovery')
      setRegenOpen(false)
      setRecoveryCode(res.recoveryCode)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setRegenBusy(false)
    }
  }

  async function lockVault() {
    setLockBusy(true)
    try {
      await call('vault.lock')
      window.location.reload()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setLockBusy(false)
    }
  }

  const tabs: { key: SettingsTab; label: string }[] = [
    { key: 'kantor', label: 'Kantor' },
    { key: 'sistem', label: 'Sistem' },
    { key: 'keuangan', label: 'Keuangan' },
    { key: 'keamanan', label: 'Keamanan' },
    { key: 'penomoran', label: 'Penomoran' },
    ...(canTemplates ? [{ key: 'template' as SettingsTab, label: 'Template' }] : []),
    { key: 'vault', label: 'Vault' },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sistem"
        title="Pengaturan"
        subtitle="Identitas kantor, kebijakan sistem, penomoran, template dokumen, dan keamanan vault."
        actions={
          <Button variant="secondary" onClick={() => void call('app.openFolder', { target: 'root' }).catch((e) => toast.error((e as Error).message))}>
            <FolderOpen className="h-4 w-4" /> Buka Folder Data
          </Button>
        }
      />

      {settings.error && <Alert tone="danger" title="Gagal memuat pengaturan">{settings.error}</Alert>}

      <Card className="overflow-hidden">
        <Tabs className="px-4 pt-2" active={tab} onChange={(k) => setTab(k as SettingsTab)} tabs={tabs} />

        {tab === 'kantor' && (
          <div className="p-5">
            <SectionTitle title="Identitas Kantor" subtitle="Tampil pada laporan, PDF invoice, dan template akta." action={saveButton('kantor', SECTION_KEYS.kantor)} />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {SECTION_KEYS.kantor.map((key) => (
                <Field
                  key={key}
                  label={LABELS[key]}
                  hint={settingsByKey[key]?.description}
                  className={key === 'office.address' ? 'sm:col-span-2' : undefined}
                  required={key === 'office.name'}
                >
                  {renderInput(key)}
                </Field>
              ))}
            </div>
          </div>
        )}

        {tab === 'sistem' && (
          <div className="p-5">
            <SectionTitle title="Kebijakan Sistem" subtitle="Zona waktu, format tanggal, sesi, dan backup otomatis." action={saveButton('sistem', SECTION_KEYS.sistem)} />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label={LABELS['system.timezone']} hint={settingsByKey['system.timezone']?.description}>{renderInput('system.timezone')}</Field>
              <Field label={LABELS['system.dateFormat']} hint={settingsByKey['system.dateFormat']?.description}>{renderInput('system.dateFormat')}</Field>
              <Field label={LABELS['system.sessionTimeoutMinutes']} hint={settingsByKey['system.sessionTimeoutMinutes']?.description}>{renderInput('system.sessionTimeoutMinutes')}</Field>
              <Field label={LABELS['system.backupRetention']} hint={settingsByKey['system.backupRetention']?.description}>{renderInput('system.backupRetention')}</Field>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Toggle
                checked={values['system.autoBackupDaily'] === 'true'}
                onChange={(v) => setValue('system.autoBackupDaily', v ? 'true' : 'false')}
                label={LABELS['system.autoBackupDaily']}
                description="Membuat backup terenkripsi sekali sehari saat aplikasi dipakai."
              />
              <Toggle
                checked={values['system.preMigrationBackup'] === 'true'}
                onChange={(v) => setValue('system.preMigrationBackup', v ? 'true' : 'false')}
                label={LABELS['system.preMigrationBackup']}
                description="Membuat backup otomatis sebelum migrasi skema basis data."
              />
            </div>
          </div>
        )}

        {tab === 'keuangan' && (
          <div className="p-5">
            <SectionTitle title="Kebijakan Keuangan" subtitle="Nilai bawaan saat membuat invoice baru." action={saveButton('keuangan', SECTION_KEYS.keuangan)} />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label={LABELS['finance.defaultTaxPercent']} hint="Pajak awal pada formulir invoice; dapat diubah per invoice.">{renderInput('finance.defaultTaxPercent')}</Field>
              <Field label={LABELS['finance.invoiceDueDays']} hint="Dipakai jika tanggal jatuh tempo dikosongkan.">{renderInput('finance.invoiceDueDays')}</Field>
            </div>
            <Alert tone="info" title="Total invoice">
              <span className="text-xs">Subtotal dihitung dari jumlah item, diskon dikurangkan sebelum pajak, lalu pajak dihitung dari nilai setelah diskon. Total dan sisa tagihan selalu dihitung ulang oleh backend saat invoice disimpan.</span>
            </Alert>
          </div>
        )}

        {tab === 'keamanan' && (
          <div className="p-5">
            <SectionTitle title="Kebijakan Keamanan" subtitle="Perlindungan akun pengguna." action={saveButton('keamanan', SECTION_KEYS.keamanan)} />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label={LABELS['security.maxLoginAttempts']} hint="Setelah batas ini, login ditahan sementara 60 detik.">{renderInput('security.maxLoginAttempts')}</Field>
              <Field label={LABELS['security.passwordMinLength']} hint="Berlaku untuk pembuatan akun dan perubahan password.">{renderInput('security.passwordMinLength')}</Field>
            </div>
            <Alert tone="info" title="Penyimpanan password">
              <span className="text-xs">Password akun disimpan sebagai hash Argon2id. Jangan pernah membagikan password atau master password melalui saluran tidak aman.</span>
            </Alert>
          </div>
        )}

        {tab === 'penomoran' && (
          <div className="p-5">
            <SectionTitle title="Penomoran Otomatis" subtitle="Prefix, pola, dan periode reset untuk setiap jenis nomor." />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="table-head">
                    <th className="px-3 py-2.5 text-left">Jenis</th>
                    <th className="px-3 py-2.5 text-left">Prefix</th>
                    <th className="px-3 py-2.5 text-left">Pola</th>
                    <th className="px-3 py-2.5 text-left">Reset</th>
                    <th className="px-3 py-2.5 text-left">Pratinjau</th>
                    <th className="px-3 py-2.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {(sequences.data ?? []).map((seq) => {
                    const edit = seqEdits[seq.key] ?? { prefix: seq.prefix, pattern: seq.pattern, resetPeriod: seq.resetPeriod }
                    return (
                      <tr key={seq.key} className="border-t border-slate-100 dark:border-navy-800">
                        <td className="px-3 py-2">
                          <p className="font-semibold text-navy-900 dark:text-white">{seq.key}</p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">Terakhir: {seq.lastNumber} {seq.periodKey ? `(${seq.periodKey})` : ''}</p>
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={edit.prefix}
                            onChange={(e) => setSeqEdits((prev) => ({ ...prev, [seq.key]: { ...edit, prefix: e.target.value } }))}
                            className="!w-28 !py-1.5 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={edit.pattern}
                            onChange={(e) => setSeqEdits((prev) => ({ ...prev, [seq.key]: { ...edit, pattern: e.target.value } }))}
                            className="!w-52 !py-1.5 font-mono text-xs"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Select
                            value={edit.resetPeriod}
                            onChange={(e) => setSeqEdits((prev) => ({ ...prev, [seq.key]: { ...edit, resetPeriod: e.target.value } }))}
                            className="!w-28 !py-1.5 text-xs"
                          >
                            <option value="NONE">Tidak</option>
                            <option value="YEAR">Tahunan</option>
                            <option value="MONTH">Bulanan</option>
                          </Select>
                        </td>
                        <td className="px-3 py-2">
                          <span className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-navy-900 dark:bg-navy-800 dark:text-slate-200">{sequencePreview(edit.pattern, edit.prefix)}</span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            variant="secondary"
                            className="!py-1.5 text-xs"
                            onClick={() => void saveSequence(seq.key)}
                            loading={seqBusy === seq.key}
                          >
                            <Save className="h-3.5 w-3.5" /> Simpan
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Alert tone="warn" title="Perubahan pola">
              <span className="text-xs">Mengubah pola atau prefix hanya memengaruhi nomor berikutnya. Nomor yang sudah tercatat tidak berubah. Pastikan pola memuat <span className="font-mono">{'{SEQ:n}'}</span> agar nomor urut tersedia.</span>
            </Alert>
          </div>
        )}

        {tab === 'template' && canTemplates && (
          <div className="p-5">
            <SectionTitle title="Template Dokumen" subtitle="Template DOCX dengan placeholder untuk pembuatan draft dan minuta akta." />
            <div className="mt-4 space-y-4">
              {TEMPLATE_CATEGORIES.map((cat) => {
                const items = (templates.data ?? []).filter((t) => t.category === cat.key)
                return (
                  <Card key={cat.key} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-navy-900 dark:text-white">{cat.label}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{cat.description}</p>
                      </div>
                      <Button variant="secondary" className="!py-1.5 text-xs" onClick={() => void uploadTemplate(cat.key)} loading={uploading === cat.key}>
                        <Upload className="h-3.5 w-3.5" /> Unggah Template
                      </Button>
                    </div>
                    {items.length === 0 ? (
                      <p className="mt-3 rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-500 dark:bg-navy-900/60 dark:text-slate-400">Belum ada template unggahan pengguna; sistem memakai template bawaan bila tersedia.</p>
                    ) : (
                      <ul className="mt-3 divide-y divide-slate-100 dark:divide-navy-800">
                        {items.map((t) => (
                          <li key={`${t.category}-${t.fileName}`} className="flex items-center justify-between gap-3 py-2">
                            <div className="min-w-0">
                              <p className="truncate font-mono text-xs font-medium text-navy-900 dark:text-slate-200">{t.fileName}</p>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400">{formatBytes(t.sizeBytes)} · diubah {formatDateTime(t.modifiedAt)}</p>
                            </div>
                            <IconButton label="Hapus template" onClick={() => setDeletingTemplate({ category: t.category, fileName: t.fileName })}>
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                )
              })}
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 p-4 dark:border-navy-800">
              <p className="text-xs font-semibold text-navy-900 dark:text-white">Placeholder akta yang didukung</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PLACEHOLDERS.map((p) => (
                  <code key={p} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-navy-800 dark:bg-navy-800 dark:text-slate-200">{`{${p}}`}</code>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                Tersedia juga daftar berulang <code className="font-mono">{'{#pihak_list}'}…{' {/pihak_list}'}</code> berisi <code className="font-mono">role</code>, <code className="font-mono">nama</code>, <code className="font-mono">nik</code>, <code className="font-mono">alamat</code>, serta <code className="font-mono">{'{#saksi_list}'}</code> berisi <code className="font-mono">nama</code>.
              </p>
            </div>
            <div className="mt-3">
              <Button variant="secondary" onClick={() => void call('app.openFolder', { target: 'templates' }).catch((e) => toast.error((e as Error).message))}>
                <FolderOpen className="h-4 w-4" /> Buka Folder Template
              </Button>
            </div>
          </div>
        )}

        {tab === 'vault' && (
          <div className="space-y-5 p-5">
            <div>
              <SectionTitle title="Ubah Master Password" subtitle="Master password membuka enkripsi basis data. Minimal 12 karakter." />
              {masterError && <div className="mt-3"><Alert tone="danger">{masterError}</Alert></div>}
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="Master Password Saat Ini" required>
                  <Input type="password" value={masterForm.current} onChange={(e) => setMasterForm((f) => ({ ...f, current: e.target.value }))} placeholder="••••••••••••" />
                </Field>
                <Field label="Master Password Baru" required>
                  <Input type="password" value={masterForm.next} onChange={(e) => setMasterForm((f) => ({ ...f, next: e.target.value }))} placeholder="Minimal 12 karakter" />
                </Field>
                <Field label="Konfirmasi Baru" required>
                  <Input type="password" value={masterForm.confirm} onChange={(e) => setMasterForm((f) => ({ ...f, confirm: e.target.value }))} placeholder="Ulangi master password baru" />
                </Field>
              </div>
              <div className="mt-3">
                <Button variant="gold" onClick={() => void changeMaster()} loading={masterBusy} disabled={!masterForm.current}>
                  <KeyRound className="h-4 w-4" /> Ubah Master Password
                </Button>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold-500/15 text-gold-700 dark:text-gold-300"><ShieldCheck className="h-4 w-4" /></div>
                  <div>
                    <p className="text-sm font-bold text-navy-900 dark:text-white">Kode Pemulihan</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Buat kode pemulihan baru jika kode lama hilang atau bocor. Kode lama langsung tidak berlaku.</p>
                    <Button variant="secondary" className="mt-3 !py-1.5 text-xs" onClick={() => setRegenOpen(true)}>
                      <RefreshCw className="h-3.5 w-3.5" /> Buat Kode Baru
                    </Button>
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-300"><LockKeyhole className="h-4 w-4" /></div>
                  <div>
                    <p className="text-sm font-bold text-navy-900 dark:text-white">Kunci Vault Sekarang</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Menutup basis data terenkripsi dan mengakhiri sesi. Master password diperlukan untuk membuka kembali.</p>
                    <Button variant="danger" className="mt-3 !py-1.5 text-xs" onClick={() => setLockOpen(true)}>
                      <LockKeyhole className="h-3.5 w-3.5" /> Kunci Vault
                    </Button>
                  </div>
                </div>
              </Card>
            </div>

            <Alert tone="info" title="Tentang enkripsi">
              <span className="text-xs">Basis data dienkripsi AES-256-GCM menggunakan kunci yang diturunkan dari master password dengan Argon2id. Saat vault terbuka, hanya salinan sementara yang digunakan; saat aplikasi ditutup, data kembali dalam bentuk terenkripsi.</span>
            </Alert>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={regenOpen}
        title="Buat Kode Pemulihan Baru"
        description="Kode pemulihan lama akan langsung tidak berlaku. Simpan kode baru di tempat aman; kode hanya ditampilkan sekali."
        confirmLabel="Buat Kode Baru"
        loading={regenBusy}
        onConfirm={() => void regenerateRecovery()}
        onClose={() => setRegenOpen(false)}
      />

      <ConfirmDialog
        open={lockOpen}
        title="Kunci Vault"
        description="Basis data akan ditutup dan sesi berakhir. Anda harus memasukkan master password untuk membuka kembali aplikasi."
        confirmLabel="Kunci Sekarang"
        danger
        loading={lockBusy}
        onConfirm={() => void lockVault()}
        onClose={() => setLockOpen(false)}
      />

      <ConfirmDialog
        open={!!deletingTemplate}
        title="Hapus Template"
        description={<>Template <b className="font-mono">{deletingTemplate?.fileName}</b> akan dihapus. Template bawaan akan dipakai kembali bila tersedia.</>}
        confirmLabel="Hapus"
        danger
        loading={templateBusy}
        onConfirm={() => void confirmDeleteTemplate()}
        onClose={() => setDeletingTemplate(null)}
      />

      <Modal
        open={!!recoveryCode}
        onClose={() => setRecoveryCode(null)}
        title="Kode Pemulihan Baru"
        subtitle="Simpan sekarang; kode tidak ditampilkan lagi."
        size="sm"
        footer={<Button variant="gold" onClick={() => setRecoveryCode(null)}>Saya Sudah Menyimpan</Button>}
      >
        <div className="space-y-3">
          <Alert tone="warn" title="Rahasia">
            <span className="text-xs">Kode ini dapat membuka basis data jika master password lupa. Jangan simpan di tempat yang dapat diakses orang lain.</span>
          </Alert>
          <pre className="select-all break-all rounded-lg bg-navy-950 p-4 text-center font-mono text-sm tracking-wider text-gold-300">{recoveryCode}</pre>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              if (recoveryCode) void navigator.clipboard.writeText(recoveryCode).then(() => toast.success('Kode pemulihan disalin.'))
            }}
          >
            Salin Kode
          </Button>
        </div>
      </Modal>

      <Card className="p-4">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-gold-600 dark:text-gold-400" />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Data aplikasi tersimpan di folder aplikasi sistem operasi (bukan folder instalasi). Gunakan tombol <b>Buka Folder Data</b> untuk melihat database, dokumen, template, ekspor, log, dan backup.
          </p>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge tone="neutral"><Building2 className="mr-1 inline h-3 w-3" /> {values['office.name'] || 'Nama kantor belum diisi'}</Badge>
          <Badge tone="neutral">{session.roleName}</Badge>
        </div>
      </Card>
    </div>
  )
}
