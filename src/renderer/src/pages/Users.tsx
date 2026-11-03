import { useEffect, useMemo, useState } from 'react'
import {
  Check, ChevronRight, KeyRound, Plus, ShieldCheck, UserCog, UserX,
} from 'lucide-react'
import { call, useDebounced, useQuery } from '@/api'
import type { SessionInfo } from '@/types'
import {
  Alert, Badge, Button, Card, ConfirmDialog, DataTable, EmptyState, Field, IconButton, Input,
  Modal, PageHeader, Pagination, SearchInput, SectionTitle, Select, Tabs, Toggle, useToast,
} from '@/components/ui'
import { formatDateTime } from '@shared/format'

function emptyUser() {
  return { fullName: '', username: '', email: '', roleId: '', password: '', isActive: true }
}

export function Users({ session }: { session: SessionInfo }) {
  const toast = useToast()
  const canManage = session.permissions.includes('users.manage')
  const [tab, setTab] = useState<'users' | 'roles'>('users')

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [activeFilter, setActiveFilter] = useState('')
  const debounced = useDebounced(search)
  const users = useQuery<any>('users.list', {
    page, pageSize: 20, search: debounced, roleId: roleFilter || undefined,
    active: activeFilter === '' ? undefined : activeFilter === 'true',
  }, { enabled: tab === 'users' })
  const roles = useQuery<any[]>('roles.list')
  const catalog = useQuery<any[]>('permissions.catalog')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [form, setForm] = useState<any>(emptyUser())
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [deactivating, setDeactivating] = useState<any | null>(null)
  const [deactivateBusy, setDeactivateBusy] = useState(false)

  const [editingRole, setEditingRole] = useState<any | null>(null)
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set())
  const [roleBusy, setRoleBusy] = useState(false)

  useEffect(() => {
    if (tab === 'users' && users.data && users.data.totalPages > 0 && page > users.data.totalPages) {
      setPage(users.data.totalPages)
    }
  }, [users.data, tab, page])

  const groups = useMemo(() => {
    const map = new Map<string, { code: string; name: string }[]>()
    for (const p of catalog.data ?? []) {
      if (!map.has(p.group)) map.set(p.group, [])
      map.get(p.group)!.push({ code: p.code, name: p.name })
    }
    return [...map.entries()]
  }, [catalog.data])

  function openCreate() {
    setEditing(null)
    setForm({ ...emptyUser(), roleId: roles.data?.[0]?.id ?? '' })
    setFormError(null)
    setFormOpen(true)
  }

  function openEdit(row: any) {
    setEditing(row)
    setForm({
      fullName: row.fullName,
      username: row.username,
      email: row.email ?? '',
      roleId: row.role?.id ?? row.roleId ?? '',
      password: '',
      isActive: row.isActive,
    })
    setFormError(null)
    setFormOpen(true)
  }

  async function saveUser() {
    if (form.fullName.trim().length < 2) return setFormError('Nama lengkap minimal 2 karakter.')
    if (!editing) {
      if (!/^[a-zA-Z0-9._-]{3,50}$/.test(form.username.trim())) {
        return setFormError('Username 3-50 karakter; hanya huruf, angka, titik, garis bawah, dan strip.')
      }
      if (form.password.length < 10) return setFormError('Password minimal 10 karakter.')
    } else if (form.password && form.password.length < 10) {
      return setFormError('Password baru minimal 10 karakter.')
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setFormError('Format email tidak valid.')
    if (!form.roleId) return setFormError('Role wajib dipilih.')
    setBusy(true)
    setFormError(null)
    try {
      if (editing) {
        await call('users.update', {
          id: editing.id,
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          roleId: form.roleId,
          isActive: form.isActive,
          password: form.password || '',
        })
        toast.success('Data karyawan diperbarui.')
      } else {
        await call('users.create', {
          username: form.username.trim(),
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          roleId: form.roleId,
          password: form.password,
          isActive: form.isActive,
        })
        toast.success('Karyawan baru dibuat. Password wajib diubah saat login pertama.')
      }
      setFormOpen(false)
      await Promise.all([users.reload(true), roles.reload(true)])
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function confirmDeactivate() {
    if (!deactivating) return
    setDeactivateBusy(true)
    try {
      await call('users.deactivate', { id: deactivating.id })
      toast.success(`Akun ${deactivating.username} dinonaktifkan.`)
      setDeactivating(null)
      await Promise.all([users.reload(true), roles.reload(true)])
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setDeactivateBusy(false)
    }
  }

  function openRole(role: any) {
    setEditingRole(role)
    setSelectedCodes(new Set((role.permissions ?? []).map((p: any) => p.permission?.code ?? p.code).filter(Boolean)))
  }

  function toggleCode(code: string) {
    setSelectedCodes((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  function toggleGroup(codes: string[], on: boolean) {
    setSelectedCodes((prev) => {
      const next = new Set(prev)
      for (const c of codes) {
        if (on) next.add(c)
        else next.delete(c)
      }
      return next
    })
  }

  async function saveRolePermissions() {
    if (!editingRole) return
    setRoleBusy(true)
    try {
      await call('roles.permissions', { roleId: editingRole.id, permissionCodes: [...selectedCodes] })
      toast.success(`Hak akses role ${editingRole.name} disimpan.`)
      setEditingRole(null)
      await roles.reload(true)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setRoleBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sistem"
        title="Karyawan & Role"
        subtitle="Kelola akun pengguna, role, dan hak akses modul."
        actions={canManage && tab === 'users' ? (
          <Button variant="gold" onClick={openCreate}><Plus className="h-4 w-4" /> Tambah Karyawan</Button>
        ) : undefined}
      />

      {roles.error && <Alert tone="danger" title="Gagal memuat role">{roles.error}</Alert>}

      <Card className="overflow-hidden">
        <Tabs
          className="px-4 pt-2"
          active={tab}
          onChange={(k) => setTab(k as 'users' | 'roles')}
          tabs={[
            { key: 'users', label: 'Karyawan', count: users.data?.total },
            { key: 'roles', label: 'Role & Hak Akses', count: roles.data?.length },
          ]}
        />

        {tab === 'users' && (
          <>
            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Cari nama, username, email…" className="w-full sm:w-72" />
              <Select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1) }} className="w-full sm:w-48">
                <option value="">Semua role</option>
                {(roles.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
              <Select value={activeFilter} onChange={(e) => { setActiveFilter(e.target.value); setPage(1) }} className="w-full sm:w-40">
                <option value="">Semua status</option>
                <option value="true">Aktif</option>
                <option value="false">Nonaktif</option>
              </Select>
            </div>
            <DataTable
              rows={users.data?.items ?? []}
              loading={users.loading}
              columns={[
                { key: 'fullName', header: 'Nama', render: (r) => (
                  <div>
                    <p className="font-semibold text-navy-900 dark:text-white">{r.fullName}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">@{r.username}</p>
                  </div>
                ) },
                { key: 'email', header: 'Email', render: (r) => r.email || '—' },
                { key: 'role', header: 'Role', render: (r) => <Badge tone="neutral">{r.role?.name ?? '—'}</Badge> },
                { key: 'isActive', header: 'Status', render: (r) => r.isActive ? <Badge tone="green">Aktif</Badge> : <Badge tone="red">Nonaktif</Badge> },
                { key: 'lastLoginAt', header: 'Login Terakhir', render: (r) => r.lastLoginAt ? formatDateTime(r.lastLoginAt) : 'Belum pernah' },
                {
                  key: 'actions', header: '', align: 'right', render: (r) => canManage ? (
                    <div className="flex justify-end gap-1">
                      <IconButton label="Ubah karyawan" onClick={() => openEdit(r)}><UserCog className="h-4 w-4" /></IconButton>
                      {r.isActive && r.id !== session.userId && (
                        <IconButton label="Nonaktifkan akun" onClick={() => setDeactivating(r)}><UserX className="h-4 w-4" /></IconButton>
                      )}
                    </div>
                  ) : null,
                },
              ]}
            />
            {users.data && (
              <Pagination page={users.data.page} pageSize={users.data.pageSize} total={users.data.total} totalPages={users.data.totalPages} onPage={setPage} />
            )}
          </>
        )}

        {tab === 'roles' && (
          <div className="p-4">
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 dark:bg-navy-900/60 dark:text-slate-300">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold-600 dark:text-gold-400" />
              <p>Role menentukan menu dan tindakan yang tersedia. Hak akses Administrator bersifat tetap dan tidak dapat dikurangi. Perubahan hak akses tercatat di audit log.</p>
            </div>
            {roles.loading ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-36 animate-pulse rounded-xl bg-slate-100 dark:bg-navy-800" />)}
              </div>
            ) : (roles.data ?? []).length === 0 ? (
              <EmptyState title="Belum ada role" />
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {(roles.data ?? []).map((role) => {
                  const permCount = role.permissions?.length ?? 0
                  const isAdmin = role.code === 'ADMINISTRATOR'
                  return (
                    <Card key={role.id} className="flex flex-col p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-navy-900 dark:text-white">{role.name}</p>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{role.code}</p>
                        </div>
                        {isAdmin ? <Badge tone="gold">Penuh</Badge> : <Badge tone="neutral">{permCount} izin</Badge>}
                      </div>
                      <p className="mt-2 flex-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{role.description ?? 'Tanpa deskripsi.'}</p>
                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-navy-800">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">{role._count?.users ?? 0} pengguna</span>
                        <Button
                          variant="secondary"
                          className="!py-1.5 text-xs"
                          disabled={!canManage || isAdmin}
                          title={isAdmin ? 'Hak akses Administrator tidak dapat diubah.' : undefined}
                          onClick={() => openRole(role)}
                        >
                          <KeyRound className="h-3.5 w-3.5" /> Atur Hak Akses <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Ubah Karyawan' : 'Tambah Karyawan'}
        subtitle={editing ? `@${editing.username}` : 'Akun baru wajib mengganti password saat login pertama.'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={busy}>Batal</Button>
            <Button variant="gold" onClick={() => void saveUser()} loading={busy}>{editing ? 'Simpan Perubahan' : 'Buat Akun'}</Button>
          </>
        }
      >
        <div className="space-y-3">
          {formError && <Alert tone="danger">{formError}</Alert>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nama Lengkap" required>
              <Input value={form.fullName} onChange={(e) => setForm((f: any) => ({ ...f, fullName: e.target.value }))} placeholder="Nama karyawan" />
            </Field>
            <Field label="Username" required hint={editing ? 'Username tidak dapat diubah.' : 'Huruf, angka, titik, garis bawah, strip.'}>
              <Input value={form.username} disabled={!!editing} onChange={(e) => setForm((f: any) => ({ ...f, username: e.target.value }))} placeholder="contoh: siti.aminah" />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => setForm((f: any) => ({ ...f, email: e.target.value }))} placeholder="nama@kantor.co.id" />
            </Field>
            <Field label="Role" required>
              <Select value={form.roleId} onChange={(e) => setForm((f: any) => ({ ...f, roleId: e.target.value }))}>
                <option value="">Pilih role…</option>
                {(roles.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </Field>
            <Field label={editing ? 'Password Baru' : 'Password'} required={!editing} hint={editing ? 'Kosongkan jika tidak diubah. Minimal 10 karakter.' : 'Minimal 10 karakter.'}>
              <Input type="password" value={form.password} onChange={(e) => setForm((f: any) => ({ ...f, password: e.target.value }))} placeholder="••••••••••" />
            </Field>
          </div>
          <Toggle
            checked={form.isActive}
            onChange={(v) => setForm((f: any) => ({ ...f, isActive: v }))}
            label="Akun aktif"
            description="Akun nonaktif tidak dapat login, tetapi riwayatnya tetap tersimpan."
            disabled={editing?.id === session.userId}
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deactivating}
        title="Nonaktifkan Akun"
        description={<>Akun <b>@{deactivating?.username}</b> ({deactivating?.fullName}) akan dinonaktifkan dan tidak dapat login. Riwayat audit dan dokumen tetap tersimpan.</>}
        confirmLabel="Nonaktifkan"
        danger
        loading={deactivateBusy}
        onConfirm={() => void confirmDeactivate()}
        onClose={() => setDeactivating(null)}
      />

      <Modal
        open={!!editingRole}
        onClose={() => setEditingRole(null)}
        title={`Hak Akses · ${editingRole?.name ?? ''}`}
        subtitle={`${selectedCodes.size} izin dipilih`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingRole(null)} disabled={roleBusy}>Batal</Button>
            <Button variant="gold" onClick={() => void saveRolePermissions()} loading={roleBusy} disabled={!canManage}>Simpan Hak Akses</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert tone="info">Centang izin yang diberikan kepada role ini. Menu dan tombol pada aplikasi mengikuti izin yang dipilih.</Alert>
          {catalog.loading && <div className="h-40 animate-pulse rounded-lg bg-slate-100 dark:bg-navy-800" />}
          {groups.map(([group, items]) => {
            const allOn = items.every((i) => selectedCodes.has(i.code))
            return (
              <div key={group} className="rounded-lg border border-slate-200 p-3 dark:border-navy-800">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-navy-900 dark:text-white">{group}</p>
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-gold-700 hover:underline dark:text-gold-400"
                    onClick={() => toggleGroup(items.map((i) => i.code), !allOn)}
                  >
                    {allOn ? 'Kosongkan' : 'Pilih semua'}
                  </button>
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {items.map((item) => {
                    const on = selectedCodes.has(item.code)
                    return (
                      <label key={item.code} className="flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 hover:bg-slate-50 dark:hover:bg-navy-900/60">
                        <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-gold-500 bg-gold-500 text-navy-950' : 'border-slate-300 dark:border-navy-700'}`}>
                          {on && <Check className="h-3 w-3" />}
                        </span>
                        <input type="checkbox" className="sr-only" checked={on} onChange={() => toggleCode(item.code)} />
                        <span>
                          <span className="block text-xs font-medium text-navy-900 dark:text-slate-200">{item.name}</span>
                          <span className="block text-[10px] text-slate-400">{item.code}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}
          <SectionTitle title="Catatan" subtitle="Perubahan hak akses berlaku pada login berikutnya atau saat sesi diperbarui." />
        </div>
      </Modal>
    </div>
  )
}
