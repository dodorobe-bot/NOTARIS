import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart as RechartsPieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  AlertCircle, ArrowDownRight, ArrowUpRight, BarChart3, Bell, CalendarDays, CheckCircle2, ChevronLeft,
  ChevronRight, Clock, FileSignature, FileText, Info, PenLine, PieChart as PieIcon, RefreshCw, Users,
} from 'lucide-react'
import { useQuery } from '@/api'
import type { SessionInfo } from '@/types'
import { Alert, Badge, Button, Card, EmptyState, StatusBadge, cn } from '@/components/ui'
import {
  formatDate, formatDateWeekday, formatNumber, formatRupiah, formatTime, toDateInput,
} from '@shared/format'
import {
  APPOINTMENT_TYPES, PPAT_SERVICE_TYPES, TRANSACTION_TYPES, WORKFLOW_LABELS, labelOf,
} from '@shared/constants'

const PIE_COLORS = ['#2563EB', '#F59E0B', '#10B981', '#8B5CF6', '#0B1D3A', '#C8A34A', '#94A3B8']
const WEEKDAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

const APPOINTMENT_STYLE: Record<string, { dot: string; tone: 'blue' | 'amber' | 'green' | 'purple' }> = {
  KONSULTASI: { dot: 'bg-sky-500', tone: 'blue' },
  VERIFIKASI: { dot: 'bg-violet-500', tone: 'purple' },
  PENANDATANGANAN: { dot: 'bg-emerald-500', tone: 'green' },
  LAINNYA: { dot: 'bg-amber-500', tone: 'amber' },
}

const METRIC_TONES = {
  blue: {
    bg: 'bg-gradient-to-br from-blue-600 via-blue-600 to-blue-500',
    text: 'text-white',
    icon: 'bg-white/15 text-white',
    wave: 'text-white',
    darkText: false,
  },
  navy: {
    bg: 'bg-gradient-to-br from-navy-950 via-navy-900 to-navy-700',
    text: 'text-white',
    icon: 'bg-white/15 text-white',
    wave: 'text-white',
    darkText: false,
  },
  amber: {
    bg: 'bg-gradient-to-br from-amber-300 via-amber-400 to-amber-500',
    text: 'text-navy-950',
    icon: 'bg-navy-950/10 text-navy-950',
    wave: 'text-navy-950',
    darkText: true,
  },
  green: {
    bg: 'bg-gradient-to-br from-emerald-600 via-emerald-600 to-emerald-500',
    text: 'text-white',
    icon: 'bg-white/15 text-white',
    wave: 'text-white',
    darkText: false,
  },
  purple: {
    bg: 'bg-gradient-to-br from-violet-600 via-violet-600 to-violet-500',
    text: 'text-white',
    icon: 'bg-white/15 text-white',
    wave: 'text-white',
    darkText: false,
  },
} as const

type MetricTone = keyof typeof METRIC_TONES
type Trend = { current: number; previous: number; percent: number | null }

export function Dashboard({ session }: { session: SessionInfo }) {
  const navigate = useNavigate()
  const [range, setRange] = useState(6)
  const [now, setNow] = useState(() => new Date())
  const { data, loading, error, reload } = useQuery<any>(
    'dashboard.get',
    { months: range },
    { pollMs: 120_000 },
  )

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const canCalendar = session.permissions.includes('calendar.view')
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const calendar = useMemo(() => {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const pad = (n: number) => String(n).padStart(2, '0')
    const lastDay = new Date(year, month + 1, 0).getDate()
    return {
      year,
      month,
      lastDay,
      from: `${year}-${pad(month + 1)}-01`,
      to: `${year}-${pad(month + 1)}-${pad(lastDay)}`,
      offset: new Date(year, month, 1).getDay(),
      label: new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(cursor),
    }
  }, [cursor])

  const { data: monthAppointments } = useQuery<any[]>(
    'calendar.appointments',
    { from: calendar.from, to: calendar.to },
    { enabled: canCalendar },
  )

  const appointmentDays = useMemo(
    () => new Set((monthAppointments ?? []).map((a) => toDateInput(a.startAt))),
    [monthAppointments],
  )
  const todayKey = toDateInput(new Date())
  const calendarCells = useMemo(() => {
    const cells: (number | null)[] = Array.from({ length: calendar.offset }, () => null)
    for (let day = 1; day <= calendar.lastDay; day++) cells.push(day)
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [calendar])

  const stats = data?.stats
  const months: { key: string; label: string; income: number }[] = data?.chart?.months ?? []
  const rawDistribution: { name: string; value: number }[] = data?.chart?.deedTypeDistribution ?? []
  const totalDeeds = stats?.totalDeeds ?? 0
  const totalIncome = data?.chart?.totalIncome ?? 0
  const currentIncome = months.length ? months[months.length - 1].income : 0
  const previousIncome = months.length > 1 ? months[months.length - 2].income : 0
  const revenueGrowth = previousIncome > 0
    ? Math.round(((currentIncome - previousIncome) / previousIncome) * 100)
    : null

  const distribution = useMemo(() => {
    const top = rawDistribution.slice(0, 5)
    const rest = rawDistribution.slice(5).reduce((sum, item) => sum + item.value, 0)
    return rest > 0 ? [...top, { name: 'Lainnya', value: rest }] : top
  }, [rawDistribution])

  const todayAppointments: any[] = data?.todayAppointments ?? []
  const recentTransactions: any[] = (data?.recentTransactions ?? []).slice(0, 5)
  const notifications: any[] = (data?.notifications ?? []).slice(0, 3)
  const unread = stats?.unreadNotifications ?? 0
  const firstName = session.fullName.split(' ')[0]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-navy-900 dark:text-white">
            Selamat Datang, {firstName} <span className="ml-0.5">👋</span>
          </h1>
          <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">
            Berikut ringkasan aktivitas kantor Anda hari ini.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 dark:border-navy-700 dark:bg-navy-900 dark:text-slate-300">
            <CalendarDays className="h-[18px] w-[18px]" />
          </div>
          <div className="text-right">
            <p className="text-[12px] font-semibold text-navy-900 dark:text-slate-100">{formatDateWeekday(now)}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{formatTime(now)} WIB</p>
          </div>
        </div>
      </div>

      {error && (
        <Alert tone="danger" title="Gagal memuat dashboard">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button variant="secondary" className="!py-1 text-[11px]" onClick={() => void reload(true)}>
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> Coba lagi
            </Button>
          </div>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Total Klien"
          value={loading ? '—' : formatNumber(stats?.totalClients ?? 0)}
          icon={<Users />}
          tone="blue"
          trend={stats?.trends?.clients}
        />
        <MetricCard
          label="Total Akta"
          value={loading ? '—' : formatNumber(stats?.totalDeeds ?? 0)}
          icon={<FileSignature />}
          tone="navy"
          trend={stats?.trends?.deeds}
        />
        <MetricCard
          label="Akta Dalam Proses"
          value={loading ? '—' : formatNumber(stats?.deedsInProcess ?? 0)}
          icon={<Clock />}
          tone="amber"
        />
        <MetricCard
          label="Akta Selesai"
          value={loading ? '—' : formatNumber(stats?.deedsCompleted ?? 0)}
          icon={<CheckCircle2 />}
          tone="green"
          trend={stats?.trends?.completed}
        />
        <MetricCard
          label="Belum Ditandatangani"
          value={loading ? '—' : formatNumber(stats?.deedsUnsigned ?? 0)}
          icon={<PenLine />}
          tone="purple"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr_1.25fr]">
        <Card className="flex h-full flex-col p-3.5">
          <PanelTitle
            icon={<BarChart3 />}
            title="Grafik Pendapatan"
            action={
              <select
                value={range}
                onChange={(e) => setRange(Number(e.target.value))}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10.5px] font-medium text-slate-600 outline-none transition focus:border-gold-500 dark:border-navy-700 dark:bg-navy-900 dark:text-slate-300"
                aria-label="Rentang grafik pendapatan"
              >
                <option value={6}>6 Bulan Terakhir</option>
                <option value={12}>12 Bulan Terakhir</option>
              </select>
            }
          />
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[24px] font-bold tracking-tight text-navy-900 dark:text-white">{formatRupiah(totalIncome)}</p>
            <RevenueTrend value={revenueGrowth} current={currentIncome} />
          </div>
          <p className="mt-0.5 text-[10.5px] text-slate-400">Total penerimaan {range} bulan terakhir</p>
          <div className="mt-1.5 min-h-[104px] flex-1">
            {totalIncome === 0 ? (
              <EmptyState
                compact
                title="Belum ada penerimaan"
                description="Pembayaran invoice yang diterima akan tampil pada grafik ini."
              />
            ) : (
              <ResponsiveContainer width="100%" height={104}>
                <BarChart data={months} margin={{ top: 10, right: 4, left: -16, bottom: 0 }} barCategoryGap="26%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 9, fill: '#94A3B8' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) => {
                      const millions = Number(value) / 1_000_000
                      return millions === 0 ? '0' : `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(millions)} jt`
                    }}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
                    formatter={(value: any) => [formatRupiah(Number(value)), 'Penerimaan']}
                    contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 11 }}
                  />
                  <Bar dataKey="income" name="Penerimaan" radius={[5, 5, 0, 0]} maxBarSize={34}>
                    {months.map((month, index) => (
                      <Cell key={month.key} fill={index === months.length - 1 ? '#1D4ED8' : '#2563EB'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="flex h-full flex-col p-3.5">
          <PanelTitle icon={<PieIcon />} title="Jenis Akta" />
          {distribution.length === 0 ? (
            <div className="flex flex-1 items-center">
              <EmptyState compact title="Belum ada akta" description="Distribusi jenis akta akan tampil setelah akta dibuat." />
            </div>
          ) : (
            <div className="flex flex-1 items-center gap-2">
              <div className="relative h-[124px] w-[124px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie
                      data={distribution}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={39}
                      outerRadius={58}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {distribution.map((item, index) => (
                        <Cell key={item.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: any, name: any) => [`${value} akta`, name]}
                      contentStyle={{ borderRadius: 8, fontSize: 11 }}
                    />
                  </RechartsPieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-lg font-bold text-navy-900 dark:text-white">{formatNumber(totalDeeds)}</p>
                  <p className="text-[9px] text-slate-500 dark:text-slate-400">Total Akta</p>
                </div>
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                {distribution.map((item, index) => (
                  <div key={item.name} className="flex items-center gap-1.5 text-[10px]">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: PIE_COLORS[index % PIE_COLORS.length] }}
                    />
                    <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">{item.name}</span>
                    <span className="font-semibold text-navy-900 dark:text-slate-100">
                      {totalDeeds > 0 ? Math.round((item.value / totalDeeds) * 100) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className="flex h-full flex-col p-3.5">
          <PanelTitle
            icon={<CalendarDays />}
            title="Jadwal Hari Ini"
            action={
              <Link to="/kalender" className="flex items-center gap-0.5 text-[10.5px] font-semibold text-gold-600 hover:underline dark:text-gold-400">
                Lihat Semua <ChevronRight className="h-3 w-3" />
              </Link>
            }
          />
          {todayAppointments.length === 0 ? (
            <div className="flex flex-1 items-center">
              <EmptyState compact title="Tidak ada jadwal" description="Konsultasi dan penandatanganan hari ini akan tampil di sini." />
            </div>
          ) : (
            <div className="relative space-y-3 before:absolute before:bottom-2 before:left-[4px] before:top-2 before:w-px before:bg-slate-200 dark:before:bg-navy-700">
              {todayAppointments.slice(0, 4).map((appointment) => {
                const style = APPOINTMENT_STYLE[appointment.type] ?? APPOINTMENT_STYLE.LAINNYA
                return (
                  <div key={appointment.id} className="relative flex gap-3">
                    <span className={cn('relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-white dark:ring-[#0E1E35]', style.dot)} />
                    <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">
                          {formatTime(appointment.startAt)}
                          {appointment.endAt ? ` – ${formatTime(appointment.endAt)}` : ''}
                        </p>
                        <p className="mt-0.5 truncate text-[12px] font-semibold text-navy-900 dark:text-slate-100">{appointment.title}</p>
                        <p className="mt-0.5 truncate text-[10px] text-slate-500 dark:text-slate-400">
                          {appointment.client?.fullName ?? appointment.transaction?.code ?? 'Tanpa klien'}
                        </p>
                      </div>
                      <Badge tone={style.tone}>{labelOf(APPOINTMENT_TYPES, appointment.type)}</Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.8fr_1fr_0.8fr]">
        <Card className="flex h-full flex-col">
          <div className="px-4 pb-0.5 pt-2.5">
            <PanelTitle
              icon={<FileText />}
              title="Transaksi Terbaru"
              action={
                <Link to="/transaksi" className="flex items-center gap-0.5 text-[10.5px] font-semibold text-gold-600 hover:underline dark:text-gold-400">
                  Lihat Semua <ChevronRight className="h-3 w-3" />
                </Link>
              }
            />
          </div>
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-[10.5px]">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50/70 text-[9px] uppercase tracking-wider text-slate-500 dark:border-navy-800 dark:bg-navy-900/50 dark:text-slate-400">
                  <th className="whitespace-nowrap px-3 py-0.5 text-left font-semibold">No. Transaksi</th>
                  <th className="px-3 py-0.5 text-left font-semibold">Nama Klien</th>
                  <th className="px-3 py-0.5 text-left font-semibold">Jenis Layanan</th>
                  <th className="px-3 py-0.5 text-left font-semibold">Status</th>
                  <th className="whitespace-nowrap px-3 py-0.5 text-right font-semibold">Tanggal</th>
                </tr>
              </thead>
              <tbody>
                {recentTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState compact title="Belum ada transaksi" description="Transaksi baru akan tampil di sini." />
                    </td>
                  </tr>
                ) : (
                  recentTransactions.map((transaction) => (
                    <tr
                      key={transaction.id}
                      className="cursor-pointer border-b border-slate-50 transition last:border-0 hover:bg-slate-50 dark:border-navy-800/60 dark:hover:bg-navy-900/50"
                      onClick={() => navigate(`/transaksi/${transaction.id}`)}
                    >
                      <td className="whitespace-nowrap px-3 py-[3px] font-mono text-[9.5px] text-slate-500 dark:text-slate-400">{transaction.code}</td>
                      <td className="max-w-[130px] truncate px-3 py-[3px] font-semibold text-navy-900 dark:text-slate-100">{transaction.client?.fullName ?? '—'}</td>
                      <td className="max-w-[130px] truncate px-3 py-[3px] text-slate-600 dark:text-slate-300">{serviceLabel(transaction)}</td>
                      <td className="px-3 py-[3px]">
                        <StatusBadge status={transaction.status} label={WORKFLOW_LABELS[transaction.status] ?? transaction.status} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-[3px] text-right text-slate-500 dark:text-slate-400">{formatDate(transaction.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="flex h-full flex-col p-3.5">
          <PanelTitle
            icon={<Bell />}
            title="Notifikasi"
            action={unread > 0 ? <Badge tone="red">{unread} baru</Badge> : undefined}
          />
          {notifications.length === 0 ? (
            <div className="flex flex-1 items-center">
              <EmptyState compact title="Tidak ada notifikasi" description="Informasi penting dari sistem akan tampil di sini." />
            </div>
          ) : (
            <div className="space-y-2.5">
              {notifications.map((notification) => {
                const visual = notificationVisual(notification.type)
                return (
                  <div
                    key={notification.id}
                    className={cn('flex gap-2.5', notification.link && 'cursor-pointer')}
                    onClick={notification.link ? () => navigate(notification.link) : undefined}
                  >
                    <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full [&>svg]:h-3 [&>svg]:w-3', visual.className)}>
                      {visual.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-[11px] font-semibold text-navy-900 dark:text-slate-100">{notification.title}</p>
                        <span className="shrink-0 text-[9px] text-slate-400">{relativeTime(notification.createdAt)}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">{notification.message}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <Card className="flex h-full flex-col p-3.5">
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
                <CalendarDays className="h-4 w-4" />
              </span>
              <h2 className="text-[13px] font-bold text-navy-900 dark:text-slate-100">Kalender</h2>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                aria-label="Bulan sebelumnya"
                onClick={() => setCursor(new Date(calendar.year, calendar.month - 1, 1))}
                className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-navy-800"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Bulan berikutnya"
                onClick={() => setCursor(new Date(calendar.year, calendar.month + 1, 1))}
                className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-navy-800"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <p className="mb-1.5 text-center text-[12px] font-semibold capitalize text-navy-900 dark:text-slate-100">{calendar.label}</p>
          <div className="grid flex-1 grid-cols-7 gap-y-0.5 text-center">
            {WEEKDAYS.map((day) => (
              <span key={day} className="pb-1 text-[9px] font-semibold uppercase text-slate-400">{day}</span>
            ))}
            {calendarCells.map((day, index) => {
              if (!day) return <span key={`empty-${index}`} className="h-[21px]" />
              const key = `${calendar.year}-${String(calendar.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const isToday = key === todayKey
              const hasAppointment = appointmentDays.has(key)
              return (
                <div key={key} className="flex h-[21px] items-center justify-center">
                  <span
                    className={cn(
                      'relative flex h-[20px] w-[20px] items-center justify-center rounded-full text-[10px] font-medium',
                      isToday
                        ? 'bg-blue-600 font-semibold text-white'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-800',
                    )}
                  >
                    {day}
                    {hasAppointment && !isToday && (
                      <span className="absolute bottom-[1px] h-1 w-1 rounded-full bg-gold-500" />
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </div>
  )
}

function MetricCard({
  label, value, icon, tone, trend,
}: {
  label: string
  value: ReactNode
  icon: ReactNode
  tone: MetricTone
  trend?: Trend
}) {
  const style = METRIC_TONES[tone]
  return (
    <div className={cn('relative overflow-hidden rounded-xl px-4 py-3.5 shadow-card', style.bg, style.text)}>
      <div className="relative z-10 flex items-start gap-2.5">
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg [&>svg]:h-[18px] [&>svg]:w-[18px]', style.icon)}>
          {icon}
        </span>
        <p className="pt-1.5 text-[11.5px] font-semibold leading-tight">{label}</p>
      </div>
      <div className="relative z-10 mt-2 flex flex-wrap items-center gap-2">
        <p className="text-[24px] font-bold leading-none tracking-tight">{value}</p>
        <MetricTrend trend={trend} darkText={style.darkText} />
      </div>
      <svg
        className={cn('pointer-events-none absolute inset-x-0 bottom-0 h-10 w-full opacity-[0.16]', style.wave)}
        viewBox="0 0 200 40"
        fill="none"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path d="M0 24 C 30 8, 55 38, 88 22 S 150 4, 200 20 V40 H0 Z" fill="currentColor" opacity="0.7" />
        <path d="M0 32 C 35 18, 60 42, 100 30 S 160 14, 200 28 V40 H0 Z" fill="currentColor" opacity="0.45" />
      </svg>
    </div>
  )
}

function MetricTrend({ trend, darkText }: { trend?: Trend; darkText: boolean }) {
  if (!trend) return null
  if (trend.percent === null) {
    if (trend.current <= 0) return null
    return (
      <span className={cn('rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold', darkText ? 'bg-navy-950/10 text-navy-950' : 'bg-white/20 text-white')}>
        Baru
      </span>
    )
  }
  const up = trend.percent >= 0
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold',
        up
          ? darkText ? 'bg-emerald-900/10 text-emerald-950' : 'bg-emerald-400/20 text-emerald-50'
          : darkText ? 'bg-red-900/10 text-red-800' : 'bg-red-400/25 text-red-50',
      )}
    >
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(trend.percent)}%
    </span>
  )
}

function RevenueTrend({ value, current }: { value: number | null; current: number }) {
  if (value === null) {
    return (
      <span className="text-[10px] font-medium text-slate-400">
        {current > 0 ? 'Penerimaan pertama bulan ini' : 'Belum ada pembanding'}
      </span>
    )
  }
  const up = value >= 0
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
        up
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
          : 'bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-300',
      )}
    >
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(value)}% dari bulan lalu
    </span>
  )
}

function PanelTitle({ icon, title, action }: { icon: ReactNode; title: string; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300 [&>svg]:h-4 [&>svg]:w-4">
          {icon}
        </span>
        <h2 className="text-[13px] font-bold text-navy-900 dark:text-slate-100">{title}</h2>
      </div>
      {action}
    </div>
  )
}

function serviceLabel(transaction: any): string {
  const deedType = transaction?.deeds?.[0]?.deedType?.name
  if (deedType) return deedType
  if (transaction?.serviceType) return labelOf(PPAT_SERVICE_TYPES, transaction.serviceType)
  return labelOf(TRANSACTION_TYPES, transaction?.type)
}

function notificationVisual(type: string): { icon: ReactNode; className: string } {
  if (type === 'WARNING') return { icon: <AlertCircle />, className: 'bg-red-50 text-red-500 dark:bg-red-950/60 dark:text-red-300' }
  if (type === 'DEADLINE') return { icon: <Clock />, className: 'bg-amber-50 text-amber-500 dark:bg-amber-950/60 dark:text-amber-300' }
  if (type === 'DOCUMENT') return { icon: <FileText />, className: 'bg-sky-50 text-sky-500 dark:bg-sky-950/60 dark:text-sky-300' }
  return { icon: <Info />, className: 'bg-emerald-50 text-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-300' }
}

function relativeTime(value: string): string {
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return '—'
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000))
  if (minutes < 1) return 'baru saja'
  if (minutes < 60) return `${minutes} mnt lalu`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} jam lalu`
  const days = Math.round(hours / 24)
  if (days === 1) return 'kemarin'
  if (days < 7) return `${days} hari lalu`
  return formatDate(value)
}
