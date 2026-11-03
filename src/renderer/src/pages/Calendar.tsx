import { useMemo, useState } from 'react'
import {
  CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, Clock, Pencil, Plus, Trash2,
} from 'lucide-react'
import { call, useDebounced, useQuery } from '@/api'
import type { SessionInfo } from '@/types'
import {
  Alert, Badge, Button, Card, ConfirmDialog, DataTable, EmptyState, Field, IconButton, Input,
  Modal, PageHeader, Pagination, SearchInput, Select, StatusBadge, Tabs, Textarea, useToast, cn,
} from '@/components/ui'
import {
  APPOINTMENT_STATUSES, APPOINTMENT_TYPES, DEADLINE_STATUSES, DEADLINE_TYPES, PRIORITIES,
  TASK_STATUSES, labelOf,
} from '@shared/constants'
import { formatDate, formatDateTime, formatTime, toDateInput, toDateTimeInput } from '@shared/format'

const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']

function emptyAppointment(date?: string) {
  return {
    title: '', type: 'KONSULTASI', startAt: `${date ?? toDateInput(new Date())}T09:00`, endAt: '',
    location: '', clientId: '', transactionId: '', assignedToId: '', status: 'TERJADWAL', notes: '',
  }
}
function emptyTask() {
  return {
    title: '', description: '', transactionId: '', assignedToId: '', dueDate: toDateInput(new Date()),
    priority: 'NORMAL', status: 'TODO',
  }
}
function emptyDeadline() {
  return { title: '', type: 'LAINNYA', dueDate: toDateInput(new Date()), transactionId: '', status: 'AKTIF', notes: '' }
}

export function CalendarPage({ session }: { session: SessionInfo }) {
  const toast = useToast()
  const canManage = session.permissions.includes('calendar.manage')
  const [tab, setTab] = useState('jadwal')
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const from = toDateInput(new Date(year, month, 1))
  const to = toDateInput(new Date(year, month + 1, 0))

  const appointments = useQuery<any[]>('calendar.appointments', { from, to }, { enabled: tab === 'jadwal' })
  const clients = useQuery<any[]>('clients.options', {}, { enabled: tab === 'jadwal' })
  const transactions = useQuery<any[]>('transactions.options', {}, { enabled: tab === 'jadwal' || tab === 'tugas' || tab === 'tenggat' })
  const accounts = useQuery<any[]>('app.accounts', {}, { enabled: tab === 'jadwal' || tab === 'tugas' })

  const [taskPage, setTaskPage] = useState(1)
  const [taskSearch, setTaskSearch] = useState('')
  const [taskStatus, setTaskStatus] = useState('')
  const taskDebounced = useDebounced(taskSearch)
  const tasks = useQuery<any>('tasks.list', { page: taskPage, pageSize: 20, search: taskDebounced, status: taskStatus || undefined }, { enabled: tab === 'tugas' })

  const [dlPage, setDlPage] = useState(1)
  const [dlSearch, setDlSearch] = useState('')
  const [dlStatus, setDlStatus] = useState('')
  const dlDebounced = useDebounced(dlSearch)
  const deadlines = useQuery<any>('deadlines.list', { page: dlPage, pageSize: 20, search: dlDebounced, status: dlStatus || undefined }, { enabled: tab === 'tenggat' })

  const [apptOpen, setApptOpen] = useState(false)
  const [apptEditing, setApptEditing] = useState<any | null>(null)
  const [apptForm, setApptForm] = useState<any>(emptyAppointment())
  const [taskOpen, setTaskOpen] = useState(false)
  const [taskEditing, setTaskEditing] = useState<any | null>(null)
  const [taskForm, setTaskForm] = useState<any>(emptyTask())
  const [dlOpen, setDlOpen] = useState(false)
  const [dlEditing, setDlEditing] = useState<any | null>(null)
  const [dlForm, setDlForm] = useState<any>(emptyDeadline())
  const [errors, setErrors] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState<{ kind: 'appt' | 'task' | 'deadline'; row: any } | null>(null)

  const byDate = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const a of appointments.data ?? []) {
      const key = toDateInput(a.startAt)
      const list = map.get(key) ?? []
      list.push(a)
      map.set(key, list)
    }
    return map
  }, [appointments.data])

  const offset = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)
  const today = new Date()
  const isToday = (day: number) => today.getFullYear() === year && today.getMonth() === month && today.getDate() === day

  function openAppointment(day?: number, row?: any) {
    setErrors(null)
    if (row) {
      setApptEditing(row)
      setApptForm({
        title: row.title, type: row.type, startAt: toDateTimeInput(row.startAt), endAt: row.endAt ? toDateTimeInput(row.endAt) : '',
        location: row.location ?? '', clientId: row.clientId ?? '', transactionId: row.transactionId ?? '',
        assignedToId: row.assignedToId ?? '', status: row.status, notes: row.notes ?? '',
      })
    } else {
      setApptEditing(null)
      setApptForm(emptyAppointment(day ? toDateInput(new Date(year, month, day)) : undefined))
    }
    setApptOpen(true)
  }

  async function saveAppointment() {
    if (apptForm.title.trim().length < 2) return setErrors('Judul jadwal minimal 2 karakter.')
    if (!apptForm.startAt) return setErrors('Waktu mulai wajib diisi.')
    if (apptForm.endAt && apptForm.endAt <= apptForm.startAt) return setErrors('Waktu selesai harus setelah waktu mulai.')
    setBusy(true)
    setErrors(null)
    try {
      const payload: any = {
        title: apptForm.title.trim(),
        type: apptForm.type,
        startAt: apptForm.startAt,
        endAt: apptForm.endAt || null,
        location: apptForm.location || null,
        clientId: apptForm.clientId || null,
        transactionId: apptForm.transactionId || null,
        assignedToId: apptForm.assignedToId || null,
        status: apptForm.status,
        notes: apptForm.notes || null,
      }
      if (apptEditing) await call('appointments.update', { id: apptEditing.id, ...payload })
      else await call('appointments.create', payload)
      toast.success(apptEditing ? 'Jadwal diperbarui.' : 'Jadwal dibuat.')
      setApptOpen(false)
      void appointments.reload(true)
    } catch (err) {
      setErrors((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function openTask(row?: any) {
    setErrors(null)
    if (row) {
      setTaskEditing(row)
      setTaskForm({
        title: row.title, description: row.description ?? '', transactionId: row.transactionId ?? '',
        assignedToId: row.assignedToId ?? '', dueDate: row.dueDate ? toDateInput(row.dueDate) : '',
        priority: row.priority, status: row.status,
      })
    } else {
      setTaskEditing(null)
      setTaskForm(emptyTask())
    }
    setTaskOpen(true)
  }

  async function saveTask() {
    if (taskForm.title.trim().length < 2) return setErrors('Judul tugas minimal 2 karakter.')
    setBusy(true)
    setErrors(null)
    try {
      const payload: any = {
        title: taskForm.title.trim(),
        description: taskForm.description || null,
        transactionId: taskForm.transactionId || null,
        assignedToId: taskForm.assignedToId || null,
        dueDate: taskForm.dueDate || null,
        priority: taskForm.priority,
        status: taskForm.status,
      }
      if (taskEditing) await call('tasks.update', { id: taskEditing.id, ...payload })
      else await call('tasks.create', payload)
      toast.success(taskEditing ? 'Tugas diperbarui.' : 'Tugas dibuat.')
      setTaskOpen(false)
      void tasks.reload(true)
    } catch (err) {
      setErrors((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function toggleTask(row: any) {
    try {
      await call('tasks.update', { id: row.id, status: row.status === 'DONE' ? 'IN_PROGRESS' : 'DONE' })
      toast.success(row.status === 'DONE' ? 'Tugas dibuka kembali.' : 'Tugas ditandai selesai.')
      void tasks.reload(true)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  function openDeadline(row?: any) {
    setErrors(null)
    if (row) {
      setDlEditing(row)
      setDlForm({
        title: row.title, type: row.type, dueDate: toDateInput(row.dueDate), transactionId: row.transactionId ?? '',
        status: row.status, notes: row.notes ?? '',
      })
    } else {
      setDlEditing(null)
      setDlForm(emptyDeadline())
    }
    setDlOpen(true)
  }

  async function saveDeadline() {
    if (dlForm.title.trim().length < 2) return setErrors('Judul tenggat minimal 2 karakter.')
    if (!dlForm.dueDate) return setErrors('Tanggal jatuh tempo wajib diisi.')
    setBusy(true)
    setErrors(null)
    try {
      const payload: any = {
        title: dlForm.title.trim(),
        type: dlForm.type,
        dueDate: dlForm.dueDate,
        transactionId: dlForm.transactionId || null,
        propertyId: null,
        status: dlForm.status,
        notes: dlForm.notes || null,
      }
      if (dlEditing) await call('deadlines.update', { id: dlEditing.id, ...payload })
      else await call('deadlines.create', payload)
      toast.success(dlEditing ? 'Tenggat diperbarui.' : 'Tenggat dibuat.')
      setDlOpen(false)
      void deadlines.reload(true)
    } catch (err) {
      setErrors((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function removeSelected() {
    if (!removing) return
    setBusy(true)
    try {
      if (removing.kind === 'appt') {
        await call('appointments.delete', { id: removing.row.id })
        void appointments.reload(true)
      } else if (removing.kind === 'task') {
        await call('tasks.delete', { id: removing.row.id })
        void tasks.reload(true)
      } else {
        await call('deadlines.delete', { id: removing.row.id })
        void deadlines.reload(true)
      }
      toast.success('Data berhasil dihapus dan tercatat pada audit.')
      setRemoving(null)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const monthLabel = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(cursor)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operasional"
        title="Kalender & Agenda"
        subtitle="Jadwal konsultasi, verifikasi, penandatanganan, tugas staf, dan tenggat hukum dalam satu tampilan."
        actions={
          canManage && tab === 'jadwal' ? <Button onClick={() => openAppointment()}><CalendarPlus className="h-4 w-4" /> Jadwal Baru</Button> :
          canManage && tab === 'tugas' ? <Button onClick={() => openTask()}><Plus className="h-4 w-4" /> Tugas Baru</Button> :
          canManage && tab === 'tenggat' ? <Button onClick={() => openDeadline()}><Plus className="h-4 w-4" /> Tenggat Baru</Button> : undefined
        }
      />

      <Card className="overflow-hidden">
        <div className="px-4 pt-3">
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { key: 'jadwal', label: 'Jadwal' },
              { key: 'tugas', label: 'Tugas', count: tasks.data?.total ?? 0 },
              { key: 'tenggat', label: 'Tenggat Hukum', count: deadlines.data?.total ?? 0 },
            ]}
          />
        </div>

        {tab === 'jadwal' && (
          <div className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <IconButton label="Bulan sebelumnya" onClick={() => setCursor(new Date(year, month - 1, 1))}><ChevronLeft className="h-4 w-4" /></IconButton>
                <h2 className="min-w-[180px] text-center text-sm font-bold capitalize text-navy-900 dark:text-white">{monthLabel}</h2>
                <IconButton label="Bulan berikutnya" onClick={() => setCursor(new Date(year, month + 1, 1))}><ChevronRight className="h-4 w-4" /></IconButton>
                <Button variant="secondary" className="ml-2 !py-1.5 text-xs" onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)) }}>Hari Ini</Button>
              </div>
              <span className="flex items-center gap-1.5 text-[11px] text-slate-500"><Clock className="h-3.5 w-3.5" /> {(appointments.data ?? []).length} jadwal pada bulan ini</span>
            </div>
            {appointments.error && <Alert tone="danger">{appointments.error}</Alert>}
            <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-slate-200 text-[11px] dark:border-navy-800">
              {WEEKDAYS.map((d) => (
                <div key={d} className="bg-slate-50 py-2 text-center font-bold uppercase tracking-wider text-slate-500 dark:bg-navy-900 dark:text-slate-400">{d}</div>
              ))}
              {cells.map((day, idx) => {
                if (day === null) return <div key={`empty-${idx}`} className="min-h-[92px] border-t border-slate-100 bg-slate-50/40 dark:border-navy-800/60 dark:bg-navy-950/30" />
                const key = toDateInput(new Date(year, month, day))
                const list = byDate.get(key) ?? []
                return (
                  <div
                    key={key}
                    className={cn(
                      'min-h-[92px] border-t border-slate-100 p-1.5 dark:border-navy-800/60',
                      isToday(day) && 'bg-gold-500/5',
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className={cn('flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold', isToday(day) ? 'bg-gold-500 text-navy-950' : 'text-slate-500 dark:text-slate-400')}>{day}</span>
                      {canManage && <button type="button" className="rounded p-0.5 text-slate-300 hover:bg-slate-100 hover:text-navy-800 dark:hover:bg-navy-800" onClick={() => openAppointment(day)} aria-label="Tambah jadwal"><Plus className="h-3 w-3" /></button>}
                    </div>
                    <div className="space-y-1">
                      {list.slice(0, 3).map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => openAppointment(undefined, a)}
                          className="block w-full truncate rounded bg-navy-900 px-1.5 py-1 text-left text-[10px] font-medium text-white hover:bg-navy-800"
                          title={`${formatTime(a.startAt)} · ${a.title}`}
                        >
                          {formatTime(a.startAt)} · {a.title}
                        </button>
                      ))}
                      {list.length > 3 && <p className="px-1 text-[10px] text-slate-400">+{list.length - 3} lagi</p>}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Agenda Bulan Ini</p>
              {(appointments.data ?? []).length === 0 ? (
                <EmptyState compact title="Belum ada jadwal" description="Klik tanggal pada kalender atau tombol Jadwal Baru." />
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-navy-800">
                  {(appointments.data ?? []).map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-navy-900 dark:text-slate-100">{a.title}</p>
                        <p className="text-[11px] text-slate-500">
                          {formatDateTime(a.startAt)}{a.endAt ? ` – ${formatTime(a.endAt)}` : ''} · {labelOf(APPOINTMENT_TYPES, a.type)}
                          {a.client ? ` · ${a.client.fullName}` : ''}{a.assignedTo ? ` · ${a.assignedTo.fullName}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <StatusBadge status={a.status} label={labelOf(APPOINTMENT_STATUSES, a.status)} />
                        {canManage && <IconButton label="Ubah jadwal" onClick={() => openAppointment(undefined, a)}><Pencil className="h-4 w-4" /></IconButton>}
                        {canManage && <IconButton label="Hapus jadwal" onClick={() => setRemoving({ kind: 'appt', row: a })}><Trash2 className="h-4 w-4 text-red-500" /></IconButton>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'tugas' && (
          <>
            <div className="grid gap-2 p-3 md:grid-cols-[1fr_200px]">
              <SearchInput value={taskSearch} onChange={(v) => { setTaskSearch(v); setTaskPage(1) }} placeholder="Cari judul tugas…" />
              <Select value={taskStatus} onChange={(e) => { setTaskStatus(e.target.value); setTaskPage(1) }}>
                <option value="">Semua status</option>
                {TASK_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </div>
            <DataTable
              rows={tasks.data?.items ?? []}
              loading={tasks.loading}
              columns={[
                { key: 'title', header: 'Tugas', render: (r) => <div><p className="font-medium">{r.title}</p>{r.description && <p className="truncate text-[11px] text-slate-500">{r.description}</p>}</div> },
                { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} label={labelOf(TASK_STATUSES, r.status)} /> },
                { key: 'priority', header: 'Prioritas', render: (r) => <Badge tone={r.priority === 'TINGGI' ? 'red' : 'neutral'}>{labelOf(PRIORITIES, r.priority)}</Badge> },
                { key: 'dueDate', header: 'Jatuh Tempo', render: (r) => r.dueDate ? formatDate(r.dueDate) : '—' },
                { key: 'assignedTo', header: 'Ditugaskan', render: (r) => r.assignedTo?.fullName ?? '—' },
                { key: 'link', header: 'Terkait', render: (r) => r.transaction?.code ?? r.deed?.deedNumber ?? '—' },
                {
                  key: 'actions', header: '', align: 'right', width: 140,
                  render: (r) => canManage ? (
                    <div className="flex justify-end gap-1">
                      <IconButton label={r.status === 'DONE' ? 'Buka kembali' : 'Tandai selesai'} onClick={() => void toggleTask(r)}><CheckCircle2 className={cn('h-4 w-4', r.status === 'DONE' ? 'text-emerald-500' : 'text-slate-400')} /></IconButton>
                      <IconButton label="Ubah tugas" onClick={() => openTask(r)}><Pencil className="h-4 w-4" /></IconButton>
                      <IconButton label="Hapus tugas" onClick={() => setRemoving({ kind: 'task', row: r })}><Trash2 className="h-4 w-4 text-red-500" /></IconButton>
                    </div>
                  ) : null,
                },
              ]}
              empty={<EmptyState title="Belum ada tugas" description="Buat tugas untuk memantau pekerjaan staf." action={canManage ? <Button onClick={() => openTask()}><Plus className="h-4 w-4" /> Tugas Baru</Button> : undefined} />}
            />
            {tasks.data && <Pagination page={tasks.data.page} pageSize={tasks.data.pageSize} total={tasks.data.total} totalPages={tasks.data.totalPages} onPage={setTaskPage} />}
          </>
        )}

        {tab === 'tenggat' && (
          <>
            <div className="grid gap-2 p-3 md:grid-cols-[1fr_200px]">
              <SearchInput value={dlSearch} onChange={(v) => { setDlSearch(v); setDlPage(1) }} placeholder="Cari tenggat…" />
              <Select value={dlStatus} onChange={(e) => { setDlStatus(e.target.value); setDlPage(1) }}>
                <option value="">Semua status</option>
                {DEADLINE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </div>
            <DataTable
              rows={deadlines.data?.items ?? []}
              loading={deadlines.loading}
              columns={[
                { key: 'title', header: 'Tenggat', render: (r) => <div><p className="font-medium">{r.title}</p><p className="text-[11px] text-slate-500">{labelOf(DEADLINE_TYPES, r.type)}</p></div> },
                { key: 'dueDate', header: 'Jatuh Tempo', render: (r) => formatDate(r.dueDate) },
                { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} label={labelOf(DEADLINE_STATUSES, r.status)} /> },
                { key: 'transaction', header: 'Transaksi', render: (r) => r.transaction?.code ?? '—' },
                { key: 'property', header: 'Objek', render: (r) => r.property?.certificateNumber ?? '—' },
                { key: 'notes', header: 'Catatan', render: (r) => r.notes ?? '—' },
                {
                  key: 'actions', header: '', align: 'right', width: 96,
                  render: (r) => canManage ? (
                    <div className="flex justify-end gap-1">
                      <IconButton label="Ubah tenggat" onClick={() => openDeadline(r)}><Pencil className="h-4 w-4" /></IconButton>
                      <IconButton label="Hapus tenggat" onClick={() => setRemoving({ kind: 'deadline', row: r })}><Trash2 className="h-4 w-4 text-red-500" /></IconButton>
                    </div>
                  ) : null,
                },
              ]}
              empty={<EmptyState title="Belum ada tenggat" description="Catat jatuh tempo SKMHT, pendaftaran, perpanjangan, atau pembayaran." action={canManage ? <Button onClick={() => openDeadline()}><Plus className="h-4 w-4" /> Tenggat Baru</Button> : undefined} />}
            />
            {deadlines.data && <Pagination page={deadlines.data.page} pageSize={deadlines.data.pageSize} total={deadlines.data.total} totalPages={deadlines.data.totalPages} onPage={setDlPage} />}
          </>
        )}
      </Card>

      <Modal
        open={apptOpen}
        onClose={() => setApptOpen(false)}
        title={apptEditing ? 'Ubah Jadwal' : 'Jadwal Baru'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setApptOpen(false)} disabled={busy}>Batal</Button>
            <Button onClick={() => void saveAppointment()} loading={busy}>Simpan Jadwal</Button>
          </>
        }
      >
        <div className="space-y-4">
          {errors && <Alert tone="danger">{errors}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Judul" required className="sm:col-span-2">
              <Input value={apptForm.title} onChange={(e) => setApptForm({ ...apptForm, title: e.target.value })} placeholder="Mis. Konsultasi AJB" />
            </Field>
            <Field label="Jenis">
              <Select value={apptForm.type} onChange={(e) => setApptForm({ ...apptForm, type: e.target.value })}>
                {APPOINTMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={apptForm.status} onChange={(e) => setApptForm({ ...apptForm, status: e.target.value })}>
                {APPOINTMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </Field>
            <Field label="Mulai" required>
              <Input type="datetime-local" value={apptForm.startAt} onChange={(e) => setApptForm({ ...apptForm, startAt: e.target.value })} />
            </Field>
            <Field label="Selesai">
              <Input type="datetime-local" value={apptForm.endAt} onChange={(e) => setApptForm({ ...apptForm, endAt: e.target.value })} />
            </Field>
            <Field label="Klien">
              <Select value={apptForm.clientId} onChange={(e) => setApptForm({ ...apptForm, clientId: e.target.value })}>
                <option value="">Tidak ditautkan</option>
                {(clients.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.code} — {c.fullName}</option>)}
              </Select>
            </Field>
            <Field label="Transaksi">
              <Select value={apptForm.transactionId} onChange={(e) => setApptForm({ ...apptForm, transactionId: e.target.value })}>
                <option value="">Tidak ditautkan</option>
                {(transactions.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.code} — {t.title}</option>)}
              </Select>
            </Field>
            <Field label="Ditugaskan Kepada">
              <Select value={apptForm.assignedToId} onChange={(e) => setApptForm({ ...apptForm, assignedToId: e.target.value })}>
                <option value="">Belum ditentukan</option>
                {(accounts.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.fullName}</option>)}
              </Select>
            </Field>
            <Field label="Lokasi">
              <Input value={apptForm.location} onChange={(e) => setApptForm({ ...apptForm, location: e.target.value })} />
            </Field>
            <Field label="Catatan" className="sm:col-span-2">
              <Textarea value={apptForm.notes} onChange={(e) => setApptForm({ ...apptForm, notes: e.target.value })} />
            </Field>
          </div>
        </div>
      </Modal>

      <Modal
        open={taskOpen}
        onClose={() => setTaskOpen(false)}
        title={taskEditing ? 'Ubah Tugas' : 'Tugas Baru'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTaskOpen(false)} disabled={busy}>Batal</Button>
            <Button onClick={() => void saveTask()} loading={busy}>Simpan Tugas</Button>
          </>
        }
      >
        <div className="space-y-4">
          {errors && <Alert tone="danger">{errors}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Judul Tugas" required className="sm:col-span-2">
              <Input value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} />
            </Field>
            <Field label="Uraian" className="sm:col-span-2">
              <Textarea value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} />
            </Field>
            <Field label="Transaksi">
              <Select value={taskForm.transactionId} onChange={(e) => setTaskForm({ ...taskForm, transactionId: e.target.value })}>
                <option value="">Tidak ditautkan</option>
                {(transactions.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.code} — {t.title}</option>)}
              </Select>
            </Field>
            <Field label="Ditugaskan Kepada">
              <Select value={taskForm.assignedToId} onChange={(e) => setTaskForm({ ...taskForm, assignedToId: e.target.value })}>
                <option value="">Belum ditentukan</option>
                {(accounts.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.fullName}</option>)}
              </Select>
            </Field>
            <Field label="Jatuh Tempo">
              <Input type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })} />
            </Field>
            <Field label="Prioritas">
              <Select value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}>
                {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={taskForm.status} onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value })}>
                {TASK_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </Field>
          </div>
        </div>
      </Modal>

      <Modal
        open={dlOpen}
        onClose={() => setDlOpen(false)}
        title={dlEditing ? 'Ubah Tenggat' : 'Tenggat Baru'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDlOpen(false)} disabled={busy}>Batal</Button>
            <Button onClick={() => void saveDeadline()} loading={busy}>Simpan Tenggat</Button>
          </>
        }
      >
        <div className="space-y-4">
          {errors && <Alert tone="danger">{errors}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Judul Tenggat" required className="sm:col-span-2">
              <Input value={dlForm.title} onChange={(e) => setDlForm({ ...dlForm, title: e.target.value })} />
            </Field>
            <Field label="Jenis">
              <Select value={dlForm.type} onChange={(e) => setDlForm({ ...dlForm, type: e.target.value })}>
                {DEADLINE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </Field>
            <Field label="Jatuh Tempo" required>
              <Input type="date" value={dlForm.dueDate} onChange={(e) => setDlForm({ ...dlForm, dueDate: e.target.value })} />
            </Field>
            <Field label="Transaksi">
              <Select value={dlForm.transactionId} onChange={(e) => setDlForm({ ...dlForm, transactionId: e.target.value })}>
                <option value="">Tidak ditautkan</option>
                {(transactions.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.code} — {t.title}</option>)}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={dlForm.status} onChange={(e) => setDlForm({ ...dlForm, status: e.target.value })}>
                {DEADLINE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </Field>
            <Field label="Catatan" className="sm:col-span-2">
              <Textarea value={dlForm.notes} onChange={(e) => setDlForm({ ...dlForm, notes: e.target.value })} />
            </Field>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => void removeSelected()}
        loading={busy}
        danger
        title="Hapus data agenda?"
        confirmLabel="Hapus"
        description={<span>{removing?.row?.title} akan dihapus. Penghapusan tercatat pada audit log.</span>}
      />
    </div>
  )
}
