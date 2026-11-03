import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Archive, BarChart3, Bell, BookOpen, Briefcase, CalendarDays, ChevronDown, ChevronRight, Command,
  DatabaseBackup, FileSignature, FolderOpen, Gauge, Landmark, LayoutDashboard, LockKeyhole,
  LogOut, Moon, Network, Scale, Search, Settings, ShieldCheck, Sun, UserCog, Users, Wallet,
} from 'lucide-react'
import { call, useDebounced, useQuery } from '@/api'
import type { SessionInfo, AppInfo } from '@/types'
import { Button, Field, IconButton, Input, Modal, Spinner, cn, useToast } from '@/components/ui'
import { formatDateTime } from '@shared/format'

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
  perm?: string
  end?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: <LayoutDashboard />, perm: 'dashboard.view', end: true },
  { to: '/klien', label: 'Klien', icon: <Users />, perm: 'clients.view' },
  { to: '/akta', label: 'Akta Notaris', icon: <FileSignature />, perm: 'deeds.view' },
  { to: '/ppat', label: 'Akta PPAT', icon: <Landmark />, perm: 'ppat.view' },
  { to: '/transaksi', label: 'Transaksi', icon: <Briefcase />, perm: 'transactions.view' },
  { to: '/dokumen', label: 'Dokumen', icon: <FolderOpen />, perm: 'documents.view' },
  { to: '/repertorium', label: 'Repertorium', icon: <BookOpen />, perm: 'repertorium.view' },
  { to: '/protokol', label: 'Protokol Notaris', icon: <Archive />, perm: 'protocol.view' },
  { to: '/keuangan', label: 'Keuangan', icon: <Wallet />, perm: 'finance.view' },
  { to: '/kalender', label: 'Kalender', icon: <CalendarDays />, perm: 'calendar.view' },
  { to: '/integrasi', label: 'Integrasi Pemerintah', icon: <Network />, perm: 'government.view' },
  { to: '/karyawan', label: 'Karyawan & Role', icon: <UserCog />, perm: 'users.view' },
  { to: '/laporan', label: 'Laporan', icon: <BarChart3 />, perm: 'reports.view' },
  { to: '/pengaturan', label: 'Pengaturan', icon: <Settings />, perm: 'settings.manage' },
  { to: '/audit', label: 'Audit Log', icon: <ShieldCheck />, perm: 'audit.view' },
  { to: '/backup', label: 'Backup & Restore', icon: <DatabaseBackup />, perm: 'backup.manage' },
  { to: '/performa', label: 'Performa', icon: <Gauge />, perm: 'settings.manage' },
]

interface SearchGroup {
  group: string
  items: { id: string; title: string; subtitle: string; to: string }[]
}

export function Shell({
  session, appInfo, theme, onToggleTheme, onEnd,
}: {
  session: SessionInfo
  appInfo: AppInfo | null
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onEnd: (reason: 'login' | 'locked') => void
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const [userMenu, setUserMenu] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)

  const notifications = useQuery<any[]>('notifications.list', {}, { pollMs: 60_000 })
  const unread = (notifications.data ?? []).filter((n) => !n.isRead).length

  const allowed = useMemo(
    () => NAV_ITEMS.filter((item) => !item.perm || session.permissions.includes(item.perm)),
    [session.permissions],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setUserMenu(false)
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function logout() {
    setLoggingOut(true)
    try {
      await call('auth.logout')
      onEnd('login')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setLoggingOut(false)
    }
  }

  async function lockVault() {
    try {
      await call('vault.lock')
      onEnd('locked')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function markAllRead() {
    try {
      await call('notifications.markRead', {})
      await notifications.reload(true)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col bg-gradient-to-b from-navy-950 via-navy-950 to-[#0C2445] text-white">
        <div className="px-5 pb-3 pt-5 text-center">
          <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-gold-500/35 bg-gold-500/10 shadow-[0_0_0_6px_rgba(200,163,74,0.06)]">
            <Scale className="h-7 w-7 text-gold-400" strokeWidth={1.35} />
          </div>
          <p className="mt-2.5 text-[16px] font-extrabold leading-none tracking-[0.16em] text-gold-400">NOTARIS PRO</p>
          <div className="mx-auto mt-2 h-px w-20 bg-gradient-to-r from-transparent via-gold-500/70 to-transparent" />
          <p className="mt-1.5 text-[8.5px] font-semibold uppercase leading-snug tracking-[0.14em] text-navy-200/80">
            Manajemen Kantor Notaris &amp; PPAT
          </p>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-2 pt-1">
          {allowed.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => cn(
                'sidebar-link !py-[5px] text-[12.5px] [&>svg]:h-[17px] [&>svg]:w-[17px] [&>svg]:shrink-0',
                isActive && 'sidebar-link-active',
              )}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-2.5">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
            <div className="relative flex h-12 items-end justify-center overflow-hidden bg-gradient-to-br from-navy-800 via-navy-700 to-navy-900">
              <div className="pointer-events-none absolute -right-5 -top-6 h-20 w-20 rounded-full border border-gold-500/15" />
              <div className="pointer-events-none absolute -left-4 top-5 h-14 w-14 rounded-full border border-white/5" />
              <Landmark className="mb-1.5 h-7 w-7 text-gold-300/75" strokeWidth={1.4} />
            </div>
            <div className="p-2.5">
              <p className="text-[10.5px] font-semibold text-white">Kantor Notaris &amp; PPAT</p>
              <p className="mt-0.5 truncate text-[9.5px] text-gold-300">{session.fullName}</p>
              {session.permissions.includes('settings.manage') ? (
                <NavLink
                  to="/pengaturan"
                  className="mt-1.5 flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[9.5px] font-medium text-navy-100 transition hover:bg-white/10"
                >
                  Profil Kantor <ChevronRight className="h-3 w-3" />
                </NavLink>
              ) : (
                <p className="mt-1.5 flex items-center gap-1.5 text-[9.5px] text-navy-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Vault terbuka
                </p>
              )}
            </div>
          </div>
          <p className="mt-1.5 text-center text-[8.5px] tracking-wide text-navy-400">v{appInfo?.version ?? '1.0.1'} · Database terenkripsi</p>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col pl-[264px]">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur dark:border-navy-800 dark:bg-[#081422]/90">
          <div className="flex h-[72px] items-center gap-4 px-6">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex h-10 w-full max-w-[560px] items-center gap-2.5 rounded-full border border-slate-200 bg-slate-50/80 px-4 text-[12.5px] text-slate-500 transition hover:border-slate-300 hover:bg-white dark:border-navy-700 dark:bg-navy-900/70 dark:text-slate-400 dark:hover:bg-navy-900"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="truncate text-left">Cari klien, nomor akta, atau dokumen…</span>
              <kbd className="ml-auto hidden rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold text-slate-400 dark:border-navy-700 dark:bg-navy-800 md:inline">
                Ctrl K
              </kbd>
            </button>
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <div className="relative" ref={notifRef}>
                <button
                  type="button"
                  aria-label="Notifikasi"
                  title="Notifikasi"
                  onClick={() => setNotifOpen((v) => !v)}
                  className="relative rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 transition hover:bg-slate-50 dark:border-navy-700 dark:bg-navy-900 dark:text-slate-300 dark:hover:bg-navy-800"
                >
                  <Bell className="h-[18px] w-[18px]" />
                  {unread > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[8px] font-bold text-white ring-2 ring-white dark:ring-[#081422]">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </button>
                {notifOpen && (
                  <div className="animate-in absolute right-0 top-11 w-[340px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-pop dark:border-navy-700 dark:bg-[#0E1E35]">
                    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 dark:border-navy-800">
                      <p className="text-xs font-bold uppercase tracking-wider text-navy-900 dark:text-slate-200">Notifikasi</p>
                      {unread > 0 && <button className="text-[11px] font-semibold text-gold-600 hover:underline dark:text-gold-400" onClick={markAllRead}>Tandai dibaca</button>}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {(notifications.data ?? []).length === 0 ? (
                        <p className="px-4 py-8 text-center text-xs text-slate-500">Belum ada notifikasi.</p>
                      ) : (
                        (notifications.data ?? []).map((n) => (
                          <div key={n.id} className={cn('border-b border-slate-100 px-4 py-3 last:border-0 dark:border-navy-800', !n.isRead && 'bg-gold-50/50 dark:bg-gold-500/5')}>
                            <p className="text-xs font-semibold text-navy-900 dark:text-slate-100">{n.title}</p>
                            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{n.message}</p>
                            <p className="mt-1 text-[10px] text-slate-400">{formatDateTime(n.createdAt)}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
              <IconButton label={theme === 'dark' ? 'Mode terang' : 'Mode gelap'} onClick={onToggleTheme}>
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </IconButton>
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenu((v) => !v)}
                  className="ml-1 flex items-center gap-2.5 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2.5 text-xs transition hover:bg-slate-50 dark:border-navy-700 dark:bg-navy-900 dark:hover:bg-navy-800"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-[11px] font-bold text-navy-950 shadow-sm">
                    {session.fullName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                  </span>
                  <span className="hidden text-left sm:block">
                    <span className="block max-w-[150px] truncate text-[12px] font-semibold leading-tight text-navy-900 dark:text-slate-100">{session.fullName}</span>
                    <span className="block text-[10px] leading-tight text-slate-500 dark:text-slate-400">{session.roleName}</span>
                  </span>
                  <ChevronDown className="hidden h-3.5 w-3.5 text-slate-400 sm:block" />
                </button>
                {userMenu && (
                  <div className="animate-in absolute right-0 top-11 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-pop dark:border-navy-700 dark:bg-[#0E1E35]">
                    <div className="border-b border-slate-100 px-4 py-2.5 dark:border-navy-800">
                      <p className="text-xs font-semibold text-navy-900 dark:text-slate-100">{session.username}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">{session.roleName}</p>
                    </div>
                    <button className="flex w-full items-center gap-2 px-4 py-2 text-xs text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-navy-800" onClick={() => { setPasswordOpen(true); setUserMenu(false) }}>
                      <UserCog className="h-3.5 w-3.5" /> Ubah password
                    </button>
                    <button className="flex w-full items-center gap-2 px-4 py-2 text-xs text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-navy-800" onClick={() => { void lockVault(); setUserMenu(false) }}>
                      <LockKeyhole className="h-3.5 w-3.5" /> Kunci database
                    </button>
                    <button className="flex w-full items-center gap-2 px-4 py-2 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50" onClick={() => void logout()} disabled={loggingOut}>
                      {loggingOut ? <Spinner className="h-3.5 w-3.5" /> : <LogOut className="h-3.5 w-3.5" />} Keluar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1500px] flex-1 px-6 py-5 lg:px-8">
          <Outlet />
        </main>
        <footer className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/95 px-6 py-2 backdrop-blur dark:border-navy-800 dark:bg-[#071427]/95">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 text-[10.5px] text-slate-500 dark:text-slate-400">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                Sistem aman dan terintegrasi dengan protokol keamanan terbaik
              </span>
              <span className="hidden h-3 w-px bg-slate-200 dark:bg-navy-700 md:block" />
              <span className="flex items-center gap-1.5">
                <DatabaseBackup className="h-3.5 w-3.5 text-navy-500 dark:text-navy-300" />
                Backup otomatis setiap hari
              </span>
              <span className="hidden h-3 w-px bg-slate-200 dark:bg-navy-700 md:block" />
              <span className="flex items-center gap-1.5">
                <Scale className="h-3.5 w-3.5 text-gold-600 dark:text-gold-400" />
                Mengacu pada UU Jabatan Notaris &amp; PPAT
              </span>
            </div>
            <span className="rounded-md border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-navy-700 dark:text-slate-300">
              Versi {appInfo?.version ?? '1.0.1'}
            </span>
          </div>
        </footer>
      </div>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} onNavigate={(to) => { setSearchOpen(false); navigate(to) }} />
      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  )
}

function GlobalSearch({ open, onClose, onNavigate }: { open: boolean; onClose: () => void; onNavigate: (to: string) => void }) {
  const [query, setQuery] = useState('')
  const debounced = useDebounced(query, 300)
  const [groups, setGroups] = useState<SearchGroup[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setGroups([])
      window.setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    if (!open || debounced.trim().length < 2) {
      setGroups([])
      // Permintaan sebelumnya dibatalkan (alive=false) sehingga tidak akan mematikan spinner;
      // tanpa baris ini indikator memuat dapat berputar terus setelah kueri dikosongkan.
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    call<SearchGroup[]>('search.global', { query: debounced.trim() })
      .then((res) => { if (alive) setGroups(res) })
      .catch(() => { if (alive) setGroups([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [debounced, open])

  return (
    <Modal open={open} onClose={onClose} title="Pencarian Global" subtitle="Cari klien, transaksi, akta, invoice, dan dokumen" size="lg">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ketik minimal 2 karakter…"
          className="pl-9"
        />
        {loading && <Spinner className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />}
      </div>
      <div className="mt-4 space-y-4">
        {query.trim().length >= 2 && !loading && groups.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-500">Tidak ada hasil untuk “{query}”.</p>
        )}
        {groups.map((g) => (
          <div key={g.group}>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-gold-600 dark:text-gold-400">{g.group}</p>
            <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-navy-800">
              {g.items.map((item) => (
                <button
                  key={`${g.group}-${item.id}`}
                  className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-50 dark:border-navy-800 dark:hover:bg-navy-900"
                  onClick={() => onNavigate(item.to)}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-navy-900 dark:text-slate-100">{item.title}</p>
                    <p className="truncate text-[11px] text-slate-500">{item.subtitle}</p>
                  </div>
                  <Command className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                </button>
              ))}
            </div>
          </div>
        ))}
        {query.trim().length < 2 && (
          <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
            <p className="font-semibold text-navy-900 dark:text-slate-300">Tips pencarian</p>
            <p>· Gunakan nama klien, NIK, NPWP, kode transaksi, atau nomor akta.</p>
            <p>· Hasil hanya menampilkan modul yang boleh Anda akses.</p>
          </div>
        )}
      </div>
    </Modal>
  )
}

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setForm({ currentPassword: '', newPassword: '', confirm: '' })
      setError(null)
    }
  }, [open])

  async function submit() {
    if (form.newPassword.length < 10) return setError('Password baru minimal 10 karakter.')
    if (form.newPassword !== form.confirm) return setError('Konfirmasi password tidak sama.')
    setBusy(true)
    setError(null)
    try {
      await call('auth.changePassword', { currentPassword: form.currentPassword, newPassword: form.newPassword })
      toast.success('Password berhasil diubah.')
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ubah Password"
      subtitle="Gunakan minimal 10 karakter dan jangan bagikan password Anda."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Batal</Button>
          <Button onClick={submit} loading={busy}>Simpan password</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Password saat ini" required>
          <Input type="password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} autoComplete="current-password" />
        </Field>
        <Field label="Password baru" required hint="Minimal 10 karakter.">
          <Input type="password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} autoComplete="new-password" />
        </Field>
        <Field label="Konfirmasi password baru" required>
          <Input type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} autoComplete="new-password" />
        </Field>
        {error && <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </Modal>
  )
}
