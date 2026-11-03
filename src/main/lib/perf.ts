import fs from 'node:fs'
import { createRequire } from 'node:module'
import { files } from './paths'
import { perfByRoute, perfSummary, type PerfSample, type PerfSummary, type RoutePerf } from '../../shared/perf'
import { perfLogFile, perfLogSize, recentSamples } from './perf-log'

const nodeRequire = createRequire(import.meta.url)

interface SqliteDb {
  prepare(sql: string): { get(...args: unknown[]): Record<string, unknown> | undefined; all(...args: unknown[]): Record<string, unknown>[] }
  close(): void
}

function openReadOnly(): SqliteDb {
  const { DatabaseSync } = nodeRequire('node:sqlite')
  return new DatabaseSync(files.db(), { readOnly: true }) as SqliteDb
}

function pragma(conn: SqliteDb, name: string): number {
  const row = conn.prepare(`PRAGMA ${name}`).get()
  return Number(Object.values(row ?? {})[0] ?? 0)
}

function pragmaText(conn: SqliteDb, name: string): string {
  const row = conn.prepare(`PRAGMA ${name}`).get()
  return String(Object.values(row ?? {})[0] ?? '')
}

function fileSize(file: string): number {
  try {
    return fs.statSync(file).size
  } catch {
    return 0
  }
}

export interface DatabaseMetrics {
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

export interface ObjectMetric {
  name: string
  bytes: number
}

export interface PerformanceReport {
  ok: boolean
  generatedAt: string
  reason?: string
  database?: DatabaseMetrics
  api: { summary: PerfSummary; byRoute: RoutePerf[]; slowest: PerfSample[] }
  log: { file: string; bytes: number }
}

const FTS_TABLES = [
  'client_search', 'transaction_search', 'deed_search',
  'invoice_search', 'document_search', 'government_search',
]

export function collectPerformance(): PerformanceReport {
  const samples = recentSamples()
  const api = {
    summary: perfSummary(samples),
    byRoute: perfByRoute(samples),
    slowest: samples.filter((s) => s.ms >= 250).sort((a, b) => b.ms - a.ms).slice(0, 8),
  }
  const log = { file: perfLogFile(), bytes: perfLogSize() }
  let conn: SqliteDb | null = null
  try {
    conn = openReadOnly()
    const db = files.db()
    const counts = conn
      .prepare("SELECT type, COUNT(*) AS c FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' GROUP BY type")
      .all()
    const countOf = (type: string) => Number(counts.find((r) => r.type === type)?.c ?? 0)
    let migrations = 0
    try {
      migrations = Number(conn.prepare('SELECT COUNT(*) AS c FROM _app_migrations').get()?.c ?? 0)
    } catch {
      /* basis data baru sebelum migrasi */
    }
    const names = conn
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => String(r.name))
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      database: {
        fileBytes: fileSize(db),
        walBytes: fileSize(`${db}-wal`),
        shmBytes: fileSize(`${db}-shm`),
        pageSize: pragma(conn, 'page_size'),
        pageCount: pragma(conn, 'page_count'),
        freelistPages: pragma(conn, 'freelist_count'),
        journalMode: pragmaText(conn, 'journal_mode'),
        synchronous: String(pragma(conn, 'synchronous')),
        cacheSizeKb: Math.round(pragma(conn, 'cache_size') / -1024),
        mmapMb: Math.round(pragma(conn, 'mmap_size') / (1024 * 1024)),
        autoVacuum: String(pragma(conn, 'auto_vacuum')),
        tables: countOf('table'),
        indexes: countOf('index'),
        triggers: countOf('trigger'),
        migrations,
        analyzed: names.includes('sqlite_stat1'),
        ftsTables: FTS_TABLES.filter((t) => names.includes(t)),
      },
      api,
      log,
    }
  } catch (err) {
    return {
      ok: false,
      generatedAt: new Date().toISOString(),
      reason: `Metrik basis data tidak dapat dibaca: ${(err as Error).message}`,
      api,
      log,
    }
  } finally {
    try {
      conn?.close()
    } catch {
      /* abaikan */
    }
  }
}

/** Ukuran objek per tabel/indeks; dipanggil hanya saat pengguna memintanya. */
export function collectObjectSizes(limit = 12): { ok: boolean; reason?: string; items: ObjectMetric[] } {
  let conn: SqliteDb | null = null
  try {
    conn = openReadOnly()
    const rows = conn
      .prepare('SELECT name, SUM(pgsize) AS bytes FROM dbstat GROUP BY name ORDER BY bytes DESC LIMIT ?')
      .all(Math.max(1, Math.min(50, limit)))
    return {
      ok: true,
      items: rows.map((r) => ({ name: String(r.name), bytes: Number(r.bytes ?? 0) })),
    }
  } catch (err) {
    return { ok: false, reason: `Ukuran objek tidak tersedia: ${(err as Error).message}`, items: [] }
  } finally {
    try {
      conn?.close()
    } catch {
      /* abaikan */
    }
  }
}
