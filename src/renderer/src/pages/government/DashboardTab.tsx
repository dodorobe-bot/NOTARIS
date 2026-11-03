import { Activity, AlertTriangle, Building2, CheckCircle2, FileClock, Landmark, Link2, Radio } from 'lucide-react'
import { useQuery } from '@/api'
import {
  Alert, Badge, Card, DataTable, EmptyState, SectionTitle, StatCard, Spinner, cn,
} from '@/components/ui'
import { GovStatusBadge, OnlineBadge, PortalAnchor, useOnline } from './parts'
import type { GovernmentStatus } from '@shared/government'
import { formatDateTime } from '@shared/format'

interface AgencyCard {
  agency: string
  label: string
  portalUrl: string
  mode: string
  officialApiAvailable: boolean
  automatedSubmission: boolean
  note: string
  serviceCount: number
  submissionCount: number
  openCount: number
  awaitingPortal: number
  inProgress: number
  finished: number
  rejected: number
  apiEnabled: boolean
}

export function DashboardTab({ onOpenSubmission }: { onOpenSubmission: (id: string) => void }) {
  const dashboard = useQuery<any>('government.dashboard')
  const online = useOnline()

  if (dashboard.error) return <Alert tone="danger" title="Gagal memuat dashboard integrasi">{dashboard.error}</Alert>
  if (!dashboard.data) return <div className="flex h-40 items-center justify-center"><Spinner className="h-6 w-6" /></div>

  const d = dashboard.data
  const totals = d.totals

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total pengajuan" value={totals.submissions} hint={`${totals.services} layanan pemerintah tersedia`} icon={<FileClock />} tone="navy" />
        <StatCard label="Butuh tindakan manual" value={totals.pendingManual} hint="Log berstatus menunggu (portal, hasil, berkas)" icon={<Activity />} tone="gold" />
        <StatCard label="Berjalan di portal" value={totals.awaitingPortal + totals.inProgress} hint={`${totals.awaitingPortal} menunggu portal · ${totals.inProgress} diproses`} icon={<Radio />} tone="blue" />
        <StatCard label="Selesai / ditolak" value={`${totals.finished} / ${totals.rejected}`} hint="Hanya tercatat selesai bila ada bukti hasil resmi" icon={<CheckCircle2 />} tone="green" />
      </div>

      <Alert tone="info" title="Mode gateway: semi-otomatis, tanpa scraping">
        {d.apiNote}
      </Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        {(d.agencies as AgencyCard[]).map((a) => (
          <Card key={a.agency} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', a.agency === 'AHU' ? 'bg-navy-900 text-gold-400' : 'bg-gold-500 text-navy-950')}>
                    {a.agency === 'AHU' ? <Building2 className="h-4 w-4" /> : <Landmark className="h-4 w-4" />}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-navy-900 dark:text-white">{a.label}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{a.mode === 'SEMI_OTOMATIS' ? 'Semi-otomatis' : a.mode} · {a.serviceCount} layanan</p>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{a.note}</p>
              </div>
              <PortalAnchor url={a.portalUrl} label="Portal" className="!py-1.5 text-xs" />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
              {[
                ['Total', a.submissionCount],
                ['Berjalan', a.openCount],
                ['Selesai', a.finished],
                ['Ditolak', a.rejected],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-navy-900/60">
                  <dt className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt>
                  <dd className="mt-0.5 text-base font-bold text-navy-900 dark:text-white">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
              <Badge tone="gray">
                <Link2 className="mr-1 h-3 w-3" />
                API resmi: {a.officialApiAvailable ? 'tersedia' : 'belum tersedia'}
              </Badge>
              <Badge tone={a.apiEnabled ? 'red' : 'neutral'}>API aktif: {a.apiEnabled ? 'ya' : 'tidak'}</Badge>
              <Badge tone="neutral">Pengajuan otomatis: {a.automatedSubmission ? 'ya' : 'tidak'}</Badge>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <div className="px-4 pt-4">
            <SectionTitle title="Pengajuan terbaru" subtitle="Klik baris untuk membuka kartu pengajuan." />
          </div>
          <DataTable
            rows={(d.recentSubmissions ?? []).map((s: any) => ({ ...s, agencyLabel: s.agency === 'AHU' ? 'AHU Online' : 'ATR/BPN' }))}
            loading={dashboard.loading}
            onRowClick={(r) => onOpenSubmission(r.id)}
            columns={[
              { key: 'number', header: 'Nomor', render: (r) => <span className="font-mono text-xs">{r.number}</span> },
              { key: 'title', header: 'Perihal', render: (r) => <div className="min-w-0"><p className="truncate font-medium">{r.title}</p><p className="truncate text-[11px] text-slate-500">{r.service?.name}</p></div> },
              { key: 'agencyLabel', header: 'Instansi' },
              { key: 'internalStatus', header: 'Internal', render: (r) => <GovStatusBadge status={r.internalStatus} /> },
              { key: 'officialStatus', header: 'Status resmi', render: (r) => r.officialStatus || <span className="text-slate-400">Belum dicatat</span> },
              { key: 'createdAt', header: 'Dibuat', render: (r) => <span className="text-[11px] text-slate-500">{formatDateTime(r.createdAt)}</span> },
            ]}
            empty={<EmptyState compact title="Belum ada pengajuan" description="Buat pengajuan pada tab Pengajuan AHU atau Pengajuan BPN." />}
          />
        </Card>

        <Card className="p-4">
          <SectionTitle
            title="Kondisi perangkat"
            subtitle="Aplikasi tetap dapat bekerja luring; tindakan portal ditunggu."
            action={<OnlineBadge online={online} />}
          />
          <ul className="mt-2 space-y-2 text-xs text-slate-600 dark:text-slate-300">
            <li className="flex items-start gap-2">
              <span className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', d.encryption?.available ? 'bg-emerald-500' : 'bg-red-500')} />
              Penyimpanan kredensial: {d.encryption?.available ? `terenkripsi ${d.encryption.algorithm}` : 'DPAPI tidak tersedia — kredensial portal tidak dapat disimpan'}.
            </li>
            {online ? null : (
              <li className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                Perangkat luring. Data persiapan, berkas, dan catatan status tetap tersimpan lokal; buka portal resmi setelah daring.
              </li>
            )}
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              Status "Selesai" hanya dapat dicatat bila nomor resmi, status resmi, dan berkas hasil layanan sudah ada.
            </li>
          </ul>
          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Log sinkronisasi terakhir</p>
            <ul className="mt-2 space-y-2">
              {(d.recentSyncLogs ?? []).slice(0, 6).map((log: any) => (
                <li key={log.id} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-navy-800">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={log.status === 'SUCCESS' ? 'green' : log.status === 'FAILED' ? 'red' : 'amber'}>
                      {log.status === 'PENDING' ? 'Menunggu' : log.status === 'SUCCESS' ? 'Tercatat' : 'Gagal'}
                    </Badge>
                    <span className="text-[10px] text-slate-400">{formatDateTime(log.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">{log.message}</p>
                </li>
              ))}
              {!(d.recentSyncLogs ?? []).length && (
                <li className="text-xs text-slate-500 dark:text-slate-400">Belum ada aktivitas gateway tercatat.</li>
              )}
            </ul>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <SectionTitle title="Ringkasan per status" subtitle="Dihitung dari seluruh pengajuan yang tercatat; gunakan filter status pada tab monitoring." />
        <div className="flex flex-wrap gap-2">
          {(d.byStatus as { status: GovernmentStatus; label: string; count: number }[]).map((s) => (
            <div key={s.status} className="min-w-[132px] flex-1 rounded-lg border border-slate-200 px-3 py-2 dark:border-navy-800">
              <GovStatusBadge status={s.status} />
              <p className="mt-2 text-lg font-bold text-navy-900 dark:text-white">{s.count}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{s.label}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
