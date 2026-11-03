import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { migrationsDir } from './paths'
import { log } from './logger'

interface SqliteRow {
  [key: string]: unknown
}
interface SqliteDb {
  exec(sql: string): void
  prepare(sql: string): { all(): SqliteRow[]; get(): SqliteRow | undefined; run(...args: unknown[]): unknown }
  close(): void
}

const nodeRequire = createRequire(__filename)

function openSqlite(dbPath: string): SqliteDb {
  const mod = nodeRequire('node:sqlite') as { DatabaseSync: new (p: string) => SqliteDb }
  return new mod.DatabaseSync(dbPath)
}

export function sqliteAvailable(): boolean {
  try {
    nodeRequire('node:sqlite')
    return true
  } catch {
    return false
  }
}

export function migrationFiles(): string[] {
  const dir = migrationsDir()
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

export function pendingMigrations(dbPath: string): string[] {
  if (!fs.existsSync(dbPath)) return migrationFiles()
  let conn: SqliteDb | null = null
  try {
    conn = openSqlite(dbPath)
    conn.exec('CREATE TABLE IF NOT EXISTS _app_migrations (id TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL)')
    const rows = conn.prepare('SELECT id FROM _app_migrations').all()
    const applied = new Set(rows.map((r) => String(r.id)))
    return migrationFiles().filter((f) => !applied.has(f))
  } catch (err) {
    log.warn('Gagal membaca status migrasi', String(err))
    return migrationFiles()
  } finally {
    conn?.close()
  }
}

export function applyMigrations(dbPath: string): string[] {
  const pending = pendingMigrations(dbPath)
  if (pending.length === 0) return []
  const conn = openSqlite(dbPath)
  const applied: string[] = []
  try {
    conn.exec('CREATE TABLE IF NOT EXISTS _app_migrations (id TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL)')
    conn.exec('PRAGMA foreign_keys=ON')
    for (const file of pending) {
      const sql = fs.readFileSync(path.join(migrationsDir(), file), 'utf8')
      conn.exec('BEGIN IMMEDIATE')
      try {
        conn.exec(sql)
        conn.prepare('INSERT INTO _app_migrations (id, applied_at) VALUES (?, ?)').run(file, new Date().toISOString())
        conn.exec('COMMIT')
        applied.push(file)
        log.info(`Migrasi diterapkan: ${file}`)
      } catch (err) {
        conn.exec('ROLLBACK')
        throw new Error(`Migrasi ${file} gagal: ${(err as Error).message}`)
      }
    }
  } finally {
    conn.close()
  }
  return applied
}

export interface PerformanceSettings {
  /** Ukuran cache halaman per koneksi dalam kilobyte (PRAGMA cache_size bernilai negatif). */
  cacheKb: number
  /** Batas mmap berkas database dalam megabyte. */
  mmapMb: number
  /** Simpan tabel sementara di memori bila true. */
  tempStoreMemory: boolean
}

export const DEFAULT_PERFORMANCE: PerformanceSettings = { cacheKb: 32768, mmapMb: 64, tempStoreMemory: true }

/**
 * Perintah PRAGMA yang diterapkan pada koneksi aplikasi.
 *
 * `synchronous=FULL` dipertahankan dengan sengaja: menurunkannya mempercepat penulisan tetapi membuat
 * transaksi bisa hilang ketika listrik padam, dan itu tidak dapat diterima untuk akta. Tidak ada
 * `VACUUM` di sini karena penyusutan berkas hanya boleh dijalankan pengguna, bukan otomatis.
 */
export function performancePragmas(settings: PerformanceSettings = DEFAULT_PERFORMANCE): string[] {
  const cacheKb = settings.cacheKb > 0 && settings.cacheKb <= 524_288 ? Math.round(settings.cacheKb) : DEFAULT_PERFORMANCE.cacheKb
  const mmapMb = Math.min(512, Math.max(0, Math.round(settings.mmapMb || 0)))
  const sql = [
    'PRAGMA journal_mode=WAL',
    'PRAGMA synchronous=FULL',
    'PRAGMA busy_timeout=5000',
    'PRAGMA foreign_keys=ON',
    `PRAGMA cache_size=-${cacheKb}`,
  ]
  if (mmapMb > 0) sql.push(`PRAGMA mmap_size=${mmapMb * 1048576}`)
  sql.push(`PRAGMA temp_store=${settings.tempStoreMemory ? 'MEMORY' : 'FILE'}`)
  return sql
}

export function checkpointDb(dbPath: string): void {
  const result = checkpointDetailed(dbPath)
  if (!result.ok) log.warn('Checkpoint WAL gagal', result.detail)
}

/**
 * Menjalankan `PRAGMA wal_checkpoint(TRUNCATE)` dan mengembalikan hasilnya.
 *
 * Nilai kembalinya wajib diperiksa sebelum berkas database dibaca atau dipindahkan: selama masih ada
 * frame di WAL, isi berkas utama belum mencakup transaksi terbaru, sehingga menyalin atau mengenkripsi
 * berkas utama saja akan menghasilkan salinan yang kehilangan data.
 */
export function checkpointDetailed(dbPath: string): { ok: boolean; busy: boolean; walFrames: number; dbPages: number; detail: string } {
  if (!fs.existsSync(dbPath)) return { ok: false, busy: false, walFrames: 0, dbPages: 0, detail: 'Database tidak ditemukan.' }
  let conn: SqliteDb | null = null
  try {
    conn = openSqlite(dbPath)
    conn.exec('PRAGMA busy_timeout=15000')
    const row = conn.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get()
    const values = row ? Object.values(row) : []
    const busy = Number(values[0] ?? 1) === 1
    const walFrames = Number(values[1] ?? -1)
    const dbPages = Number(values[2] ?? -1)
    if (busy) return { ok: false, busy: true, walFrames, dbPages, detail: 'WAL sedang dipakai koneksi lain (busy); checkpoint tidak selesai.' }
    if (walFrames < 0) return { ok: false, busy: false, walFrames, dbPages, detail: 'Hasil checkpoint tidak dapat dibaca.' }
    return { ok: true, busy: false, walFrames, dbPages, detail: 'ok' }
  } catch (err) {
    return { ok: false, busy: false, walFrames: -1, dbPages: -1, detail: String(err) }
  } finally {
    conn?.close()
  }
}

/**
 * Salinan konsisten database aktif.
 *
 * Menyalin berkas saja tidak aman saat WAL aktif: data yang belum tercheckpoint hilang dari salinan.
 * Karena itu urutan yang dipakai ialah API backup resmi SQLite, lalu VACUUM INTO (mesin backup yang
 * sama), dan baru penyalinan berkas setelah checkpoint sebagai jalan terakhir yang dilaporkan.
 */
export type SnapshotMethod = 'backup-api' | 'vacuum-into' | 'copy-after-checkpoint'

export async function snapshotDatabase(dbPath: string, targetPath: string): Promise<{ method: SnapshotMethod }> {
  if (!fs.existsSync(dbPath)) throw new Error('Database tidak ditemukan untuk dibackup.')
  fs.rmSync(targetPath, { force: true })
  const conn = openSqlite(dbPath)
  let closed = false
  try {
    const backup = (conn as unknown as { backup?: (p: string) => Promise<void> | void }).backup
    if (typeof backup === 'function') {
      await backup.call(conn, targetPath)
      return { method: 'backup-api' }
    }
    conn.exec(`VACUUM INTO '${targetPath.replace(/'/g, "''")}'`)
    if (!fs.existsSync(targetPath)) throw new Error('VACUUM INTO tidak menghasilkan berkas salinan.')
    return { method: 'vacuum-into' }
  } catch (err) {
    log.warn('Salinan database lewat API SQLite gagal, memakai checkpoint + salinan berkas', String(err))
    fs.rmSync(targetPath, { force: true })
    conn.close()
    closed = true
    const checkpoint = checkpointDetailed(dbPath)
    if (!checkpoint.ok) {
      throw new Error(`Salinan cadangan database gagal: WAL tidak dapat di-checkpoint (${checkpoint.detail}).`)
    }
    fs.copyFileSync(dbPath, targetPath)
    return { method: 'copy-after-checkpoint' }
  } finally {
    if (!closed) conn.close()
  }
}

export interface DbSettings {
  journalMode: string
  synchronous: string
  cacheSize: string
  mmapSize: string
  tempStore: string
  pageCount: number
  pageSize: number
}

export function readDbSettings(dbPath: string): DbSettings {
  const conn = openSqlite(dbPath)
  try {
    const one = (sql: string): string => {
      const row = conn.prepare(sql).get()
      return row ? String(Object.values(row)[0]) : ''
    }
    return {
      journalMode: one('PRAGMA journal_mode'),
      synchronous: one('PRAGMA synchronous'),
      cacheSize: one('PRAGMA cache_size'),
      mmapSize: one('PRAGMA mmap_size'),
      tempStore: one('PRAGMA temp_store'),
      pageCount: Number(Object.values(conn.prepare('PRAGMA page_count').get() ?? {})[0] ?? 0),
      pageSize: Number(Object.values(conn.prepare('PRAGMA page_size').get() ?? {})[0] ?? 0),
    }
  } finally {
    conn.close()
  }
}

/**
 * Perbaikan statistik per-connection; bukan VACUUM, sehingga aman dijalankan saat aplikasi aktif.
 * `analysis_limit` membatasi baris yang dibaca per indeks agar ANALYZE tidak memindai seluruh
 * basis data besar; statistiknya perkiraan, tetapi cukup untuk pemilihan indeks.
 */
export function analyzeDatabase(dbPath: string): void {
  const conn = openSqlite(dbPath)
  try {
    conn.exec('PRAGMA busy_timeout=15000')
    conn.exec('PRAGMA analysis_limit=400')
    conn.exec('ANALYZE')
    conn.exec('PRAGMA optimize')
  } finally {
    conn.close()
  }
}

export interface IndexInfo {
  tbl: string
  name: string
  unique: number
  origin: string
  partial: number
}

export function listIndexes(dbPath: string): IndexInfo[] {
  const conn = openSqlite(dbPath)
  try {
    return conn
      .prepare('SELECT tbl_name AS tbl, name, "unique" AS unique, origin, partial FROM sqlite_master WHERE type=\'index\' ORDER BY tbl_name, name')
      .all()
      .map((r) => ({
        tbl: String(r.tbl),
        name: String(r.name),
        unique: Number(r.unique ?? 0),
        origin: String(r.origin ?? ''),
        partial: Number(r.partial ?? 0),
      }))
  } finally {
    conn.close()
  }
}

/** Ukuran efektif basis data termasuk WAL dan SHM yang belum tercheckpoint. */
export function dbFootprint(dbPath: string): { dbBytes: number; walBytes: number; shmBytes: number; totalBytes: number } {
  const size = (p: string): number => {
    try {
      return fs.statSync(p).size
    } catch {
      return 0
    }
  }
  const dbBytes = size(dbPath)
  const walBytes = size(`${dbPath}-wal`)
  const shmBytes = size(`${dbPath}-shm`)
  return { dbBytes, walBytes, shmBytes, totalBytes: dbBytes + walBytes + shmBytes }
}

export function integrityCheck(dbPath: string): { ok: boolean; detail: string } {
  let conn: SqliteDb | null = null
  try {
    conn = openSqlite(dbPath)
    const row = conn.prepare('PRAGMA integrity_check').get()
    const detail = String(row?.integrity_check ?? 'unknown')
    return { ok: detail === 'ok', detail }
  } catch (err) {
    return { ok: false, detail: String(err) }
  } finally {
    conn?.close()
  }
}

export function tableNames(dbPath: string): string[] {
  let conn: SqliteDb | null = null
  try {
    conn = openSqlite(dbPath)
    return conn
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((r) => String(r.name))
  } catch {
    return []
  } finally {
    conn?.close()
  }
}

export function tableRowCount(dbPath: string, table: string): number {
  let conn: SqliteDb | null = null
  try {
    conn = openSqlite(dbPath)
    const row = conn.prepare(`SELECT COUNT(*) as c FROM "${table.replace(/"/g, '')}"`).get()
    return Number(row?.c ?? 0)
  } catch {
    return 0
  } finally {
    conn?.close()
  }
}
