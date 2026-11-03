import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { call } from '@/api'
import type { AppInfo, SessionInfo, VaultStatus } from '@/types'
import { Shell } from '@/components/Shell'
import { Spinner, useToast } from '@/components/ui'
import { LoginScreen, RecoveryCodeScreen, SetupWizard, UnlockScreen } from '@/pages/Auth'
import { AccessDenied, NotFound } from '@/pages/Errors'

// Layar masuk tetap dimuat langsung agar vault dapat dibuka tanpa menunggu chunk.
// Setiap halaman kerja dimuat terpisah dan baru diunduh saat rutenya dibuka.
const Dashboard = lazy(() => import('@/pages/Dashboard').then((m) => ({ default: m.Dashboard })))
const Clients = lazy(() => import('@/pages/Clients').then((m) => ({ default: m.Clients })))
const ClientDetail = lazy(() => import('@/pages/ClientDetail').then((m) => ({ default: m.ClientDetail })))
const Transactions = lazy(() => import('@/pages/Transactions').then((m) => ({ default: m.Transactions })))
const TransactionDetail = lazy(() => import('@/pages/TransactionDetail').then((m) => ({ default: m.TransactionDetail })))
const Deeds = lazy(() => import('@/pages/Deeds').then((m) => ({ default: m.Deeds })))
const DeedDetail = lazy(() => import('@/pages/DeedDetail').then((m) => ({ default: m.DeedDetail })))
const Ppat = lazy(() => import('@/pages/Ppat').then((m) => ({ default: m.Ppat })))
const Documents = lazy(() => import('@/pages/Documents').then((m) => ({ default: m.Documents })))
const CalendarPage = lazy(() => import('@/pages/Calendar').then((m) => ({ default: m.CalendarPage })))
const Repertorium = lazy(() => import('@/pages/Repertorium').then((m) => ({ default: m.Repertorium })))
const Protocol = lazy(() => import('@/pages/Protocol').then((m) => ({ default: m.Protocol })))
const Finance = lazy(() => import('@/pages/Finance').then((m) => ({ default: m.Finance })))
const InvoiceDetail = lazy(() => import('@/pages/InvoiceDetail').then((m) => ({ default: m.InvoiceDetail })))
const Government = lazy(() => import('@/pages/Government').then((m) => ({ default: m.Government })))
const GovernmentDetail = lazy(() => import('@/pages/GovernmentDetail').then((m) => ({ default: m.GovernmentDetail })))
const Reports = lazy(() => import('@/pages/Reports').then((m) => ({ default: m.Reports })))
const Users = lazy(() => import('@/pages/Users').then((m) => ({ default: m.Users })))
const Audit = lazy(() => import('@/pages/Audit').then((m) => ({ default: m.Audit })))
const Backup = lazy(() => import('@/pages/Backup').then((m) => ({ default: m.Backup })))
const Performance = lazy(() => import('@/pages/Performance').then((m) => ({ default: m.Performance })))
const SettingsPage = lazy(() => import('@/pages/Settings').then((m) => ({ default: m.SettingsPage })))

type Phase = 'loading' | 'setup' | 'recovery' | 'unlock' | 'login' | 'app' | 'vault-error'

export default function App() {
  const toast = useToast()
  const [phase, setPhase] = useState<Phase>('loading')
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [vault, setVault] = useState<VaultStatus | null>(null)
  const [recoveryCode, setRecoveryCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('notaris-theme') === 'dark' ? 'dark' : 'light'))

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('notaris-theme', theme)
  }, [theme])

  const bootstrap = useCallback(async () => {
    setPhase('loading')
    setError(null)
    try {
      const [info, setup, auth] = await Promise.all([
        call<AppInfo>('app.info'),
        call<{ needsSetup: boolean; vault: VaultStatus }>('setup.status'),
        call<{ session: SessionInfo | null; vault: VaultStatus }>('auth.session'),
      ])
      setAppInfo(info)
      setVault(auth.vault ?? setup.vault)
      const status = (auth.vault ?? setup.vault).status
      if (status === 'ERROR') {
        setPhase('vault-error')
      } else if (status === 'SETUP') {
        setPhase('setup')
      } else if (status === 'LOCKED') {
        setPhase('unlock')
      } else if (auth.session) {
        setSession(auth.session)
        setPhase('app')
      } else {
        setPhase('login')
      }
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  useEffect(() => {
    const onExpired = () => {
      setSession(null)
      setPhase('login')
      toast.info('Sesi berakhir. Silakan masuk kembali.')
    }
    window.addEventListener('notaris:session-expired', onExpired)
    return () => window.removeEventListener('notaris:session-expired', onExpired)
  }, [toast])

  useEffect(() => {
    if (phase !== 'app' || !session) return
    const timer = window.setInterval(async () => {
      try {
        const res = await call<{ valid: boolean }>('auth.touch')
        if (!res.valid) {
          setSession(null)
          setPhase('login')
        }
      } catch {
        /* error sesi ditangani event global */
      }
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [phase, session])

  const endSession = useCallback((reason: 'login' | 'locked') => {
    setSession(null)
    if (reason === 'locked') {
      setVault((v) => (v ? { ...v, status: 'LOCKED', dbExists: false } : v))
      setPhase('unlock')
    } else {
      setPhase('login')
    }
  }, [])

  if (phase === 'loading') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-navy-950 text-white">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-gold-500/40 bg-gold-500/10">
          <Spinner className="h-6 w-6 text-gold-400" />
        </div>
        <p className="text-sm font-semibold tracking-[0.18em]">NOTARIS PRO</p>
        <p className="text-[11px] text-navy-300">Menyiapkan ruang kerja terenkripsi…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F6FA] p-6 dark:bg-[#071427]">
        <div className="card max-w-md p-6 text-center">
          <p className="text-sm font-bold text-navy-900 dark:text-white">Aplikasi gagal dimuat</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{error}</p>
          <button className="btn-primary mt-4 w-full" onClick={() => void bootstrap()}>Coba lagi</button>
        </div>
      </div>
    )
  }

  if (phase === 'vault-error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F6FA] p-6 dark:bg-[#071427]">
        <div className="card max-w-lg p-6">
          <p className="text-sm font-bold text-navy-900 dark:text-white">Vault tidak dapat dibaca</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {vault?.error ?? 'Berkas vault.json ada tetapi tidak dapat dibaca.'}
          </p>
          <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Aplikasi tidak membuat vault baru agar database terenkripsi yang sudah ada tidak tertimpa.
            Pulihkan berkas <span className="font-mono">vault.json</span> dari cadangan, lalu muat ulang.
          </p>
          {appInfo && (
            <p className="mt-3 break-all rounded-lg bg-slate-50 p-2 font-mono text-[11px] text-slate-500 dark:bg-navy-900 dark:text-slate-400">
              {appInfo.dataRoot}
            </p>
          )}
          <button className="btn-primary mt-4 w-full" onClick={() => void bootstrap()}>Coba lagi</button>
        </div>
      </div>
    )
  }

  if (phase === 'setup') {
    return <SetupWizard appInfo={appInfo} onComplete={(s, code) => { setSession(s); setRecoveryCode(code); setPhase(code ? 'recovery' : 'app') }} />
  }

  if (phase === 'recovery') {
    return <RecoveryCodeScreen code={recoveryCode} onContinue={() => { setRecoveryCode(''); setPhase('app') }} />
  }

  if (phase === 'unlock' && vault) {
    return (
      <UnlockScreen
        vault={vault}
        appInfo={appInfo}
        onUnlocked={async () => {
          const auth = await call<{ session: SessionInfo | null; vault: VaultStatus }>('auth.session')
          setVault(auth.vault)
          if (auth.session) {
            setSession(auth.session)
            setPhase('app')
          } else {
            setPhase('login')
          }
        }}
      />
    )
  }

  if (phase === 'login' || !session) {
    return (
      <LoginScreen
        appInfo={appInfo}
        onLoggedIn={(s, mustChange) => {
          setSession(s)
          setPhase('app')
          if (mustChange) toast.info('Password Anda dibuat oleh administrator. Segera ubah melalui menu pengguna.')
        }}
      />
    )
  }

  return (
    <Routes>
      <Route element={<Shell session={session} appInfo={appInfo} theme={theme} onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} onEnd={endSession} />}>
        <Route index element={<Guard session={session} perm="dashboard.view"><Dashboard session={session} /></Guard>} />
        <Route path="klien" element={<Guard session={session} perm="clients.view"><Clients session={session} /></Guard>} />
        <Route path="klien/:id" element={<Guard session={session} perm="clients.view"><ClientDetail session={session} /></Guard>} />
        <Route path="transaksi" element={<Guard session={session} perm="transactions.view"><Transactions session={session} /></Guard>} />
        <Route path="transaksi/:id" element={<Guard session={session} perm="transactions.view"><TransactionDetail session={session} /></Guard>} />
        <Route path="akta" element={<Guard session={session} perm="deeds.view"><Deeds session={session} /></Guard>} />
        <Route path="akta/:id" element={<Guard session={session} perm="deeds.view"><DeedDetail session={session} /></Guard>} />
        <Route path="ppat" element={<Guard session={session} perm="ppat.view"><Ppat session={session} /></Guard>} />
        <Route path="dokumen" element={<Guard session={session} perm="documents.view"><Documents session={session} /></Guard>} />
        <Route path="dokumen/:id" element={<Guard session={session} perm="documents.view"><Documents session={session} /></Guard>} />
        <Route path="kalender" element={<Guard session={session} perm="calendar.view"><CalendarPage session={session} /></Guard>} />
        <Route path="repertorium" element={<Guard session={session} perm="repertorium.view"><Repertorium session={session} /></Guard>} />
        <Route path="protokol" element={<Guard session={session} perm="protocol.view"><Protocol session={session} /></Guard>} />
        <Route path="keuangan" element={<Guard session={session} perm="finance.view"><Finance session={session} /></Guard>} />
        <Route path="keuangan/invoice/:id" element={<Guard session={session} perm="finance.view"><InvoiceDetail session={session} /></Guard>} />
        <Route path="integrasi" element={<Guard session={session} perm="government.view"><Government session={session} /></Guard>} />
        <Route path="integrasi/:id" element={<Guard session={session} perm="government.view"><GovernmentDetail session={session} /></Guard>} />
        <Route path="laporan" element={<Guard session={session} perm="reports.view"><Reports session={session} /></Guard>} />
        <Route path="karyawan" element={<Guard session={session} perm="users.view"><Users session={session} /></Guard>} />
        <Route path="audit" element={<Guard session={session} perm="audit.view"><Audit /></Guard>} />
        <Route path="backup" element={<Guard session={session} perm="backup.manage"><Backup session={session} /></Guard>} />
        <Route path="performa" element={<Guard session={session} perm="settings.manage"><Performance /></Guard>} />
        <Route path="pengaturan" element={<Guard session={session} perm="settings.manage"><SettingsPage session={session} /></Guard>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

function Guard({ session, perm, children }: { session: SessionInfo; perm: string; children: ReactNode }) {
  const location = useLocation()
  if (!session.permissions.includes(perm)) return <AccessDenied />
  return (
    <div key={location.pathname}>
      <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
    </div>
  )
}

/** Rangka halaman saat chunk rute sedang diunduh. */
function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Memuat halaman">
      <div className="h-8 w-64 animate-pulse rounded-lg bg-slate-200/70 dark:bg-navy-800" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card h-24 animate-pulse bg-slate-100/60 dark:bg-navy-900/60" />
        ))}
      </div>
      <div className="card p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="mb-3 h-9 animate-pulse rounded bg-slate-100/80 dark:bg-navy-900/70" />
        ))}
      </div>
    </div>
  )
}
