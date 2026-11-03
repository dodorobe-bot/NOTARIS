import { useState, type ReactNode } from 'react'
import { Activity, Database, Gauge, HardDrive, RefreshCw, Timer } from 'lucide-react'
import { call, useQuery } from '@/api'
import { Alert, Badge, Button, Card, DataTable, EmptyState, PageHeader, SectionTitle, StatCard, useToast } from '@/components/ui'
import { formatBytes, formatDateTime } from '@shared/format'
import type { PerfSample, PerfSummary, RoutePerf } from '@shared/perf'

interface DatabaseMetrics {
  fileBytes: number
  walBytes: number
  shmBytes: number
  pageSize: number
  pageCount: number
  freelistPages: number
  journalMode: string
  synchronous: string
  cacheSizeKb: number
  mmapMb: number
  autoVacuum: string
  tables: number
  indexes: number
  triggers: number
  migrations: number
  analyzed: boolean
  ftsTables: string[]
}

interface PerformanceReport {
  ok: boolean
  generatedAt: string
  reason?: string
  database?: DatabaseMetrics
  api: { summary: PerfSummary; byRoute: RoutePerf[]; slowest: PerfSample[] }
  log: { file: string; bytes: number }
}

interface ObjectMetric {
  name: string
  bytes: number
}

function ms(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 ms'
  if (value < 1) return '<1 ms'
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ms`
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-0 dark:border-navy-800">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <b className="text-right text-xs font-semibold text-navy-900 dark:text-slate-100">{value}</b>
    </div>
  )
}

export function Performance() {
  const toast = useToast()
  const query = useQuery<PerformanceReport>('system.performance')
  const [objects, setObjects] = useState<ObjectMetric[] | null>(null)
  const [objectReason, setObjectReason] = useState<string | null>(null)
  const [objectBusy, setObjectBusy] = useState(false)

  const report = query.data
  const db = report?.database
  const summary = report?.api.summary

  async function measureObjects() {
    setObjectBusy(true)
    setObjectReason(null)
    try {
      const res = await call<{ ok: boolean; reason?: string; items: ObjectMetric[] }>('system.performance.objects')
      setObjects(res.items)
      if (!res.ok) setObjectReason(res.reason ?? 'Ukuran objek tidak tersedia.')
      else if (res.items.length === 0) toast.info('Belum ada objek yang dapat diukur.')
    } catch (err) {
      setObjectReason((err as Error).message)
    } finally {
      setObjectBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Performa Sistem"
        subtitle="Metrik basis data lokal, latensi API sesi ini, dan log performa. Halaman ini tidak menampilkan NIK, isi akta, atau kata sandi."
        actions={
          <Button variant="secondary" loading={query.loading} onClick={() => void query.reload()}>
            <RefreshCw className="h-4 w-4" /> Segarkan
          </Button>
        }
      />

      {query.error && <Alert tone="danger" title="Metrik gagal dimuat">{query.error}</Alert>}
      {report && !report.ok && (
        <Alert tone="warn" title="Metrik basis data tidak lengkap">{report.reason ?? 'Sebagian metrik tidak dapat dibaca.'}</Alert>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Ukuran basis data"
          value={db ? formatBytes(db.fileBytes) : '—'}
          hint={db ? `WAL ${formatBytes(db.walBytes)} · SHM ${formatBytes(db.shmBytes)}` : 'Menunggu data'}
          icon={<Database />}
          tone="navy"
        />
        <StatCard
          label="Halaman basis data"
          value={db ? db.pageCount.toLocaleString('id-ID') : '—'}
          hint={db ? `${formatBytes(db.pageSize)} per halaman · ${db.freelistPages.toLocaleString('id-ID')} bebas` : undefined}
          icon={<HardDrive />}
          tone="blue"
        />
        <StatCard
          label="Latensi API p50 / p95"
          value={summary ? `${ms(summary.p50)} / ${ms(summary.p95)}` : '—'}
          hint={summary ? `${summary.count.toLocaleString('id-ID')} panggilan pada ring sesi` : 'Belum ada panggilan'}
          icon={<Timer />}
          tone="gold"
        />
        <StatCard
          label="Permintaan lambat"
          value={summary ? summary.slow.toLocaleString('id-ID') : '—'}
          hint="Ambang 250 ms, ditulis ke log performa"
          icon={<Activity />}
          tone={summary && summary.slow > 0 ? 'red' : 'green'}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <SectionTitle title="Basis Data" subtitle="Nilai PRAGMA dan objek skema yang sedang aktif." action={db?.analyzed ? <Badge tone="green">ANALYZE selesai</Badge> : <Badge tone="amber">Belum ANALYZE</Badge>} />
          {db ? (
            <div>
              <Row label="Mode jurnal" value={db.journalMode.toUpperCase()} />
              <Row label="Sinkronisasi" value={db.synchronous === '2' ? 'FULL (2)' : db.synchronous} />
              <Row label="Cache" value={`${db.cacheSizeKb.toLocaleString('id-ID')} KB`} />
              <Row label="mmap" value={`${db.mmapMb} MB`} />
              <Row label="Auto vacuum" value={db.autoVacuum} />
              <Row label="Tabel / indeks / trigger" value={`${db.tables} / ${db.indexes} / ${db.triggers}`} />
              <Row label="Migrasi tercatat" value={db.migrations} />
              <Row label="Indeks FTS5" value={db.ftsTables.length ? db.ftsTables.join(', ') : 'belum dibuat'} />
              <Row label="Diukur pada" value={report ? formatDateTime(report.generatedAt) : '—'} />
            </div>
          ) : (
            <EmptyState compact title="Metrik belum tersedia" description="Buka vault dan segarkan halaman ini." />
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle
            title="Ukuran Objek"
            subtitle="Dihitung dari tabel virtual dbstat saat tombol ditekan; dapat memakan waktu pada basis data besar."
            action={<Button variant="secondary" loading={objectBusy} onClick={() => void measureObjects()}><Gauge className="h-4 w-4" /> Hitung Ukuran</Button>}
          />
          {objectReason && <Alert tone="warn" title="Ukuran objek tidak tersedia">{objectReason}</Alert>}
          {objects && objects.length > 0 ? (
            <DataTable
              rows={objects}
              rowKey={(r) => r.name}
              columns={[
                { key: 'name', header: 'Objek' },
                { key: 'bytes', header: 'Ukuran', align: 'right', render: (r) => formatBytes(r.bytes) },
              ]}
            />
          ) : (
            !objectReason && <EmptyState compact title="Belum dihitung" description="Tekan Hitung Ukuran untuk melihat tabel/indeks terbesar." />
          )}
        </Card>
      </div>

      <Card className="mt-4 p-5">
        <SectionTitle title="Latensi per Rute API" subtitle="Ringkasan dari 500 panggilan terakhir pada sesi aplikasi ini; payload tidak pernah dicatat." />
        <DataTable
          rows={report?.api.byRoute ?? []}
          loading={query.loading}
          rowKey={(r) => r.route}
          columns={[
            { key: 'route', header: 'Rute', render: (r) => <span className="font-mono text-xs">{r.route}</span> },
            { key: 'count', header: 'Panggilan', align: 'right', render: (r) => r.count.toLocaleString('id-ID') },
            { key: 'p50', header: 'p50', align: 'right', render: (r) => ms(r.p50) },
            { key: 'p95', header: 'p95', align: 'right', render: (r) => ms(r.p95) },
            { key: 'max', header: 'Maks', align: 'right', render: (r) => ms(r.max) },
            { key: 'slow', header: '>250 ms', align: 'right', render: (r) => (r.slow > 0 ? <Badge tone="red">{r.slow}</Badge> : '0') },
          ]}
          empty={<EmptyState compact title="Belum ada panggilan API" description="Metrik terisi setelah Anda memakai aplikasi." />}
        />
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <SectionTitle title="Permintaan Terlambat" subtitle="Delapan permintaan paling lama pada ring sesi." />
          <DataTable
            rows={report?.api.slowest ?? []}
            rowKey={(r, i) => `${r.at}-${i}`}
            columns={[
              { key: 'at', header: 'Waktu', render: (r) => <span className="text-[11px] text-slate-500">{formatDateTime(new Date(r.at))}</span> },
              { key: 'route', header: 'Rute', render: (r) => <span className="font-mono text-xs">{r.route}</span> },
              { key: 'ms', header: 'Durasi', align: 'right', render: (r) => ms(r.ms) },
              { key: 'ok', header: 'Hasil', align: 'right', render: (r) => (r.ok ? <Badge tone="green">OK</Badge> : <Badge tone="red">{r.code ?? 'GALAT'}</Badge>) },
            ]}
            empty={<EmptyState compact title="Tidak ada permintaan di atas 250 ms" description="Semua panggilan pada ring sesi berjalan di bawah ambang log." />}
          />
        </Card>

        <Card className="p-5">
          <SectionTitle title="Log Performa" subtitle="Hanya rute, durasi, status, dan waktu — tanpa data pribadi." />
          <Row label="Berkas" value={<span className="break-all font-mono text-[10.5px]">{report?.log.file ?? '—'}</span>} />
          <Row label="Ukuran" value={formatBytes(report?.log.bytes ?? 0)} />
          <Row label="Rotasi" value="2 MB → performance.log.1" />
          <Alert tone="info" title="Batas privasi">
            Log tidak memuat payload permintaan, NIK/NPWP, isi akta, nama pengguna, atau kata sandi. Rute yang tidak dikenal dicatat sebagai
            <span className="font-mono"> unknown</span>, dan kode galat bebas tidak disimpan.
          </Alert>
        </Card>
      </div>
    </div>
  )
}
