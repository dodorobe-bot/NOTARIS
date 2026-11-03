import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, ArrowRight, Building2, CheckCircle2, Copy, Eye, EyeOff, FileSignature,
  Fingerprint, KeyRound, LockKeyhole, ShieldCheck, UserRound,
} from 'lucide-react'
import { call } from '@/api'
import type { AppInfo, SessionInfo, VaultStatus } from '@/types'
import { Alert, Button, Field, Input, cn, useToast } from '@/components/ui'

const FEATURES = [
  'Akta notaris & PPAT, repertorium, dan protokol dalam satu sistem',
  'Database lokal terenkripsi AES-256-GCM',
  'Audit log tamper-evident dengan rantai hash SHA-256',
  'Backup terenkripsi, verifikasi integritas, dan restore aman',
]

function BrandPanel() {
  return (
    <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-gradient-to-br from-navy-950 via-navy-900 to-[#13335E] p-10 text-white lg:flex">
      <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full border border-gold-500/20" />
      <div className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full border border-gold-500/10" />
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-gold-500/60 bg-gold-500/10">
            <FileSignature className="h-6 w-6 text-gold-400" />
          </div>
          <div>
            <p className="text-lg font-extrabold tracking-[0.16em]">NOTARIS PRO</p>
            <p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-gold-400">Integrated Notary &amp; PPAT</p>
          </div>
        </div>
        <h1 className="mt-16 max-w-md text-3xl font-bold leading-tight">
          Administrasi kenotariatan yang <span className="text-gold-400">tertib, aman, dan tertelusur.</span>
        </h1>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-navy-200">
          Dirancang untuk kantor Notaris dan PPAT di Indonesia. Seluruh data tersimpan lokal di perangkat Anda — tanpa layanan awan pihak ketiga.
        </p>
        <ul className="mt-8 space-y-3">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-xs text-navy-100">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" />
              <span className="leading-relaxed">{f}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="mb-4 h-px bg-gradient-to-r from-gold-500/60 via-gold-500/20 to-transparent" />
        <p className="text-[10px] leading-relaxed text-navy-300">
          Aplikasi offline-first. Tidak terhubung ke AHU atau BPN. Verifikasi dokumen resmi tetap dilakukan melalui kanal resmi instansi terkait.
        </p>
      </div>
    </div>
  )
}

function AuthLayout({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#F4F6FA] dark:bg-[#071427]">
      <BrandPanel />
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-[440px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy-900">
              <FileSignature className="h-5 w-5 text-gold-400" />
            </div>
            <p className="text-sm font-extrabold tracking-[0.14em] text-navy-900 dark:text-white">NOTARIS PRO</p>
          </div>
          {children}
          {footer}
        </div>
      </div>
    </div>
  )
}

// ---------------- SETUP ----------------
export function SetupWizard({ appInfo, onComplete }: { appInfo: AppInfo | null; onComplete: (session: SessionInfo, recoveryCode: string) => void }) {
  const toast = useToast()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState({
    officeName: '',
    notaryName: '',
    adminFullName: '',
    username: 'admin',
    email: '',
    password: '',
    confirmPassword: '',
    masterPassword: '',
    confirmMasterPassword: '',
    acknowledged: false,
  })

  const steps = useMemo(
    () => [
      { title: 'Identitas Kantor', subtitle: 'Nama kantor dan notaris/PPAT penanggung jawab.', icon: <Building2 /> },
      { title: 'Administrator', subtitle: 'Akun pemilik akses penuh pertama.', icon: <UserRound /> },
      { title: 'Keamanan Database', subtitle: 'Master password mengenkripsi seluruh database.', icon: <ShieldCheck /> },
    ],
    [],
  )

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function validateStep(): string | null {
    if (step === 0) {
      if (form.officeName.trim().length < 2) return 'Nama kantor minimal 2 karakter.'
      if (form.notaryName.trim().length < 2) return 'Nama notaris/PPAT minimal 2 karakter.'
    }
    if (step === 1) {
      if (form.adminFullName.trim().length < 2) return 'Nama lengkap administrator wajib diisi.'
      if (!/^[a-zA-Z0-9._-]{3,50}$/.test(form.username)) return 'Username 3-50 karakter: huruf, angka, titik, garis bawah, atau strip.'
      if (form.password.length < 10) return 'Password administrator minimal 10 karakter.'
      if (form.password !== form.confirmPassword) return 'Konfirmasi password tidak sama.'
      if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Format email tidak valid.'
    }
    if (step === 2) {
      if (form.masterPassword.length < 12) return 'Master password minimal 12 karakter.'
      if (form.masterPassword !== form.confirmMasterPassword) return 'Konfirmasi master password tidak sama.'
      if (!form.acknowledged) return 'Centang pernyataan bahwa Anda memahami risiko kehilangan master password.'
    }
    return null
  }

  function next() {
    const err = validateStep()
    if (err) return setError(err)
    setError(null)
    setStep((s) => Math.min(2, s + 1))
  }

  async function submit() {
    if (busy) return
    const err = validateStep()
    if (err) return setError(err)
    setBusy(true)
    setError(null)
    try {
      const res = await call<{ session: SessionInfo; recoveryCode: string }>('setup.complete', {
        officeName: form.officeName.trim(),
        notaryName: form.notaryName.trim(),
        adminFullName: form.adminFullName.trim(),
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
        masterPassword: form.masterPassword,
        confirmMasterPassword: form.confirmMasterPassword,
      })
      toast.success('Kantor berhasil dikonfigurasi. Simpan recovery code Anda.')
      onComplete(res.session, res.recoveryCode)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout>
      <div className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-gold-600">Penyiapan Awal</p>
        <h2 className="mt-1 text-2xl font-bold text-navy-900 dark:text-white">Selamat datang di NOTARIS PRO</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Tiga langkah untuk menyiapkan kantor dan mengamankan database.</p>
      </div>
      <div className="mb-5 flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s.title} className="flex flex-1 items-center gap-2">
            <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold [&>svg]:h-3.5 [&>svg]:w-3.5',
              i < step && 'border-gold-500 bg-gold-500 text-navy-950',
              i === step && 'border-gold-500 bg-white text-gold-600 ring-2 ring-gold-500/25 dark:bg-navy-900',
              i > step && 'border-slate-300 text-slate-400 dark:border-navy-700',
            )}>
              {i < step ? <CheckCircle2 /> : i + 1}
            </div>
            {i < steps.length - 1 && <div className={cn('h-px flex-1', i < step ? 'bg-gold-500' : 'bg-slate-200 dark:bg-navy-800')} />}
          </div>
        ))}
      </div>
      <div className="card p-6">
        <div className="mb-4 flex items-center gap-2 text-navy-900 dark:text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-900 text-gold-400 [&>svg]:h-4 [&>svg]:w-4">{steps[step].icon}</span>
          <div>
            <h3 className="text-sm font-bold">{steps[step].title}</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{steps[step].subtitle}</p>
          </div>
        </div>

        {step === 0 && (
          <div className="space-y-3">
            <Field label="Nama Kantor" required>
              <Input value={form.officeName} onChange={(e) => set('officeName', e.target.value)} placeholder="Contoh: Kantor Notaris & PPAT Budi Santoso, S.H." autoFocus />
            </Field>
            <Field label="Nama Notaris / PPAT" required>
              <Input value={form.notaryName} onChange={(e) => set('notaryName', e.target.value)} placeholder="Nama lengkap beserta gelar" />
            </Field>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Alamat, telepon, dan detail kantor lainnya dapat dilengkapi melalui menu Pengaturan.
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <Field label="Nama Lengkap Administrator" required>
              <Input value={form.adminFullName} onChange={(e) => set('adminFullName', e.target.value)} autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Username" required>
                <Input value={form.username} onChange={(e) => set('username', e.target.value)} autoComplete="username" />
              </Field>
              <Field label="Email" hint="Opsional">
                <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" />
              </Field>
            </div>
            <Field label="Password" required hint="Minimal 10 karakter.">
              <div className="relative">
                <Input type={showPassword ? 'text' : 'password'} value={form.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" />
                <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600" onClick={() => setShowPassword((v) => !v)} aria-label="Tampilkan password">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            <Field label="Konfirmasi Password" required>
              <Input type={showPassword ? 'text' : 'password'} value={form.confirmPassword} onChange={(e) => set('confirmPassword', e.target.value)} autoComplete="new-password" />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <Alert tone="warn" title="Penting — master password tidak dapat direset">
              Seluruh database dienkripsi dengan kunci yang dibungkus master password. Jika master password hilang, data hanya dapat dibuka dengan recovery code yang akan ditampilkan satu kali setelah penyiapan.
            </Alert>
            <Field label="Master Password Database" required hint="Minimal 12 karakter. Gunakan frasa yang mudah Anda ingat namun sulit ditebak.">
              <Input type="password" value={form.masterPassword} onChange={(e) => set('masterPassword', e.target.value)} autoComplete="new-password" autoFocus />
            </Field>
            <Field label="Konfirmasi Master Password" required>
              <Input type="password" value={form.confirmMasterPassword} onChange={(e) => set('confirmMasterPassword', e.target.value)} autoComplete="new-password" />
            </Field>
            <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-xs leading-relaxed text-slate-600 dark:border-navy-700 dark:text-slate-300">
              <input type="checkbox" className="mt-0.5 accent-gold-500" checked={form.acknowledged} onChange={(e) => set('acknowledged', e.target.checked)} />
              <span>Saya memahami bahwa kehilangan master password dan recovery code berarti data tidak dapat dipulihkan, dan saya akan menyimpan recovery code di tempat yang aman.</span>
            </label>
          </div>
        )}

        {error && <p className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-5 flex items-center justify-between">
          <Button variant="ghost" onClick={() => { setStep((s) => Math.max(0, s - 1)); setError(null) }} disabled={step === 0 || busy}>
            <ArrowLeft className="h-4 w-4" /> Kembali
          </Button>
          {step < 2 ? (
            <Button onClick={next}>Lanjut <ArrowRight className="h-4 w-4" /></Button>
          ) : (
            <Button onClick={submit} loading={busy}><ShieldCheck className="h-4 w-4" /> Selesaikan penyiapan</Button>
          )}
        </div>
      </div>
      <p className="mt-5 text-center text-[10px] text-slate-400">
        {appInfo?.name ?? 'NOTARIS PRO'} v{appInfo?.version ?? '1.0.1'} · Data lokal: {appInfo?.dataRoot ?? '—'}
      </p>
    </AuthLayout>
  )
}

// ---------------- RECOVERY CODE ----------------
export function RecoveryCodeScreen({ code, onContinue }: { code: string; onContinue: () => void }) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const [checked, setChecked] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      toast.success('Recovery code disalin ke clipboard.')
    } catch {
      toast.error('Gagal menyalin. Catat kode secara manual.')
    }
  }

  return (
    <AuthLayout>
      <div className="card p-6">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          <KeyRound className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-bold text-navy-900 dark:text-white">Simpan Recovery Code Anda</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          Kode ini hanya ditampilkan <b className="text-navy-900 dark:text-slate-200">satu kali</b>. Gunakan untuk membuka database jika master password lupa.
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-dashed border-gold-500/60 bg-gold-500/5 p-4">
          <code className="flex-1 select-all break-all font-mono text-base font-bold tracking-[0.12em] text-navy-900 dark:text-gold-300">{code}</code>
          <Button variant="secondary" onClick={copy}>{copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Salin</Button>
        </div>
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600 dark:bg-navy-900 dark:text-slate-300">
          Simpan di tempat aman (misalnya safe deposit box atau password manager). Kode ini setara dengan kunci database dan tidak dapat diterbitkan ulang tanpa membuka vault terlebih dahulu.
        </div>
        <label className="mt-4 flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
          <input type="checkbox" className="mt-0.5 accent-gold-500" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>Saya telah menyimpan recovery code ini di tempat yang aman.</span>
        </label>
        <Button className="mt-4 w-full" disabled={!checked} onClick={onContinue}>
          Masuk ke NOTARIS PRO <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </AuthLayout>
  )
}

// ---------------- UNLOCK ----------------
export function UnlockScreen({
  vault, appInfo, onUnlocked,
}: { vault: VaultStatus; appInfo: AppInfo | null; onUnlocked: () => void }) {
  const toast = useToast()
  const [mode, setMode] = useState<'master' | 'recovery'>('master')
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (busy) return
    if (!secret) return setError(mode === 'master' ? 'Masukkan master password.' : 'Masukkan recovery code.')
    setBusy(true)
    setError(null)
    try {
      await call('vault.unlock', { password: secret, useRecovery: mode === 'recovery' })
      toast.success('Database berhasil dibuka.')
      onUnlocked()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout>
      <div className="card p-6">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-navy-900 text-gold-400">
          <LockKeyhole className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-bold text-navy-900 dark:text-white">Database Terkunci</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          Database tersimpan dalam bentuk terenkripsi. Buka dengan master password untuk melanjutkan.
        </p>
        {vault.crashRecovered && (
          <div className="mt-3">
            <Alert tone="warn" title="Pemulihan pasca-crash">
              Sistem menemukan database sementara bersama berkas terenkripsi. Membuka vault akan memvalidasi dan memilih salinan yang utuh.
            </Alert>
          </div>
        )}
        <div className="mt-4 flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-navy-900">
          <button className={cn('flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition', mode === 'master' ? 'bg-white text-navy-900 shadow-sm dark:bg-navy-800 dark:text-white' : 'text-slate-500')} onClick={() => { setMode('master'); setError(null) }}>
            Master Password
          </button>
          <button className={cn('flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition', mode === 'recovery' ? 'bg-white text-navy-900 shadow-sm dark:bg-navy-800 dark:text-white' : 'text-slate-500')} onClick={() => { setMode('recovery'); setError(null) }}>
            Recovery Code
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <Field label={mode === 'master' ? 'Master Password' : 'Recovery Code'}>
            <div className="relative">
              <Input
                type={mode === 'master' ? 'password' : 'text'}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
                autoFocus
                autoComplete="off"
                placeholder={mode === 'recovery' ? 'XXXX-XXXX-XXXX-XXXX-XXXX' : ''}
                className={mode === 'recovery' ? 'font-mono tracking-wider' : ''}
              />
              <Fingerprint className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
            </div>
          </Field>
          {error && <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
          <Button className="w-full" onClick={submit} loading={busy}>
            <LockKeyhole className="h-4 w-4" /> Buka Database
          </Button>
        </div>
        <p className="mt-4 text-center text-[10px] text-slate-400">
          {appInfo?.name ?? 'NOTARIS PRO'} v{appInfo?.version ?? '1.0.1'} · {vault.vaultExists ? 'Vault terdeteksi' : 'Vault belum ada'}
        </p>
      </div>
    </AuthLayout>
  )
}

// ---------------- LOGIN ----------------
export function LoginScreen({
  appInfo, onLoggedIn,
}: { appInfo: AppInfo | null; onLoggedIn: (session: SessionInfo, mustChangePassword: boolean) => void }) {
  const toast = useToast()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [caps, setCaps] = useState(false)

  useEffect(() => {
    const check = (e: KeyboardEvent) => setCaps(e.getModifierState?.('CapsLock') ?? false)
    window.addEventListener('keydown', check)
    window.addEventListener('keyup', check)
    return () => {
      window.removeEventListener('keydown', check)
      window.removeEventListener('keyup', check)
    }
  }, [])

  async function submit() {
    if (busy) return
    if (!username || !password) return setError('Username dan password wajib diisi.')
    setBusy(true)
    setError(null)
    try {
      const res = await call<{ session: SessionInfo; user: { mustChangePassword: boolean } }>('auth.login', { username, password })
      toast.success(`Selamat datang, ${res.session.fullName}.`)
      onLoggedIn(res.session, res.user.mustChangePassword)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout>
      <div className="card p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-navy-900 text-gold-400">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-navy-900 dark:text-white">Masuk ke Sistem</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Gunakan akun karyawan kantor Anda.</p>
          </div>
        </div>
        <div className="space-y-3">
          <Field label="Username">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" placeholder="username" />
          </Field>
          <Field label="Password">
            <div className="relative">
              <Input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
                autoComplete="current-password"
                placeholder="••••••••"
                className="pr-10"
              />
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600" onClick={() => setShow((v) => !v)} aria-label="Tampilkan password">
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
          {caps && <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400">Caps Lock aktif.</p>}
          {error && <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
          <Button className="w-full" onClick={submit} loading={busy}>Masuk <ArrowRight className="h-4 w-4" /></Button>
        </div>
        <div className="mt-5 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-[10px] leading-relaxed text-slate-500 dark:bg-navy-900 dark:text-slate-400">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-600" />
          <span>Sesi berakhir otomatis setelah tidak ada aktivitas. Jangan tinggalkan perangkat dalam keadaan terbuka.</span>
        </div>
      </div>
      <p className="mt-5 text-center text-[10px] text-slate-400">
        {appInfo?.name ?? 'NOTARIS PRO'} v{appInfo?.version ?? '1.0.1'} · {appInfo?.platform ?? ''} · Waktu Asia/Jakarta
      </p>
    </AuthLayout>
  )
}
