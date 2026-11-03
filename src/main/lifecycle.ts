import fs from 'node:fs'
import { files, dirs } from './lib/paths'
import { analyzeDatabase, applyMigrations, pendingMigrations, tableNames, tableRowCount } from './lib/migrate'
import { connectDb, db } from './db'
import { seedReference } from './seed'
import { getVaultKey, vaultStatus } from './lib/vault'
import { msSinceLastActivity } from './ipc/router'
import { createBackup } from './lib/backup'
import { log } from './lib/logger'
import { getSettings } from './lib/settings'
import { maintenanceReason } from './lib/maintenance'
import { zonedDateKey } from './lib/time'

export interface PreparationResult {
  applied: string[]
  preMigrationBackup: string | null
}

/** Menyiapkan skema, backup pra-migrasi, koneksi, dan data referensi. */
export async function prepareDatabase(): Promise<PreparationResult> {
  ensureSchemaFiles()
  const pending = pendingMigrations(files.db())
  let preMigrationBackup: string | null = null
  let backupMeta: { fileName: string; sizeBytes: number; checksum: string; manifest: unknown } | null = null

  const vaultKey = getVaultKey()
  const hasBusinessData = fs.existsSync(files.db())
    && tableNames(files.db()).includes('Client')
    && tableRowCount(files.db(), 'Client') > 0
  if (pending.length > 0 && vaultKey && hasBusinessData) {
    try {
      const settings = await readSettingsSafe()
      if (settings['system.preMigrationBackup'] !== 'false') {
        const result = await createBackup({
          vaultKey,
          includeDocuments: false,
          type: 'PRE_MIGRATION',
          note: `Sebelum migrasi: ${pending.join(', ')}`,
        })
        preMigrationBackup = result.fileName
        backupMeta = { fileName: result.fileName, sizeBytes: result.sizeBytes, checksum: result.checksum, manifest: result.manifest }
      }
    } catch (err) {
      log.error('Backup pra-migrasi gagal; migrasi tetap dihentikan demi keamanan', String(err))
      throw new Error('Backup sebelum migrasi gagal. Migrasi dibatalkan agar data aman.')
    }
  }

  const applied = applyMigrations(files.db())
  await connectDb()
  await seedReference(db())

  if (backupMeta) {
    await db().backupLog.create({
      data: {
        fileName: backupMeta.fileName,
        type: 'PRE_MIGRATION',
        sizeBytes: backupMeta.sizeBytes,
        checksum: backupMeta.checksum,
        encryption: 'AES-256-GCM',
        status: 'SUCCESS',
        notes: `Otomatis sebelum migrasi: ${applied.join(', ') || pending.join(', ')}`,
      },
    })
  }
  return { applied, preMigrationBackup }
}

async function readSettingsSafe(): Promise<Record<string, string>> {
  try {
    return await getSettings()
  } catch {
    return {}
  }
}

function ensureSchemaFiles(): void {
  fs.mkdirSync(dirs.database(), { recursive: true })
}

const MAINTENANCE_TICK_MS = 10 * 60 * 1000
const IDLE_BEFORE_ANALYZE_MS = 5 * 60 * 1000
const ANALYZE_INTERVAL_MS = 24 * 60 * 60 * 1000
let lastAnalyzeAt = 0
let maintenanceTimer: NodeJS.Timeout | null = null

/**
 * ANALYZE hanya dijalankan saat tidak ada permintaan API selama lima menit, paling sering sekali
 * per hari. Dengan `analysis_limit`, biayanya terbatas dan tidak pernah memblokir pekerjaan aktif;
 * VACUUM tetap tidak pernah dijalankan otomatis.
 */
export function scheduleIdleMaintenance(): void {
  if (maintenanceTimer) return
  maintenanceTimer = setInterval(() => {
    try {
      if (Date.now() - lastAnalyzeAt < ANALYZE_INTERVAL_MS) return
      if (maintenanceReason()) return
      const vault = vaultStatus()
      if (vault.status === 'LOCKED' || vault.status === 'SETUP' || !vault.dbExists) return
      if (msSinceLastActivity() < IDLE_BEFORE_ANALYZE_MS) return
      analyzeDatabase(files.db())
      lastAnalyzeAt = Date.now()
      log.info('ANALYZE database selesai saat idle')
    } catch (err) {
      log.warn('ANALYZE database dilewati', String(err))
    }
  }, MAINTENANCE_TICK_MS)
  maintenanceTimer.unref()
}

let autoBackupInFlight = false

/**
 * Backup otomatis harian, dipanggil setelah login. Penjaga `autoBackupInFlight` mencegah dua login
 * beruntun (atau login ganda) memulai dua backup penuh ke folder yang sama.
 */
export async function maybeDailyBackup(vaultKey: Buffer | null): Promise<void> {
  if (!vaultKey || autoBackupInFlight) return
  autoBackupInFlight = true
  try {
    await runDailyBackup(vaultKey)
  } finally {
    autoBackupInFlight = false
  }
}

async function runDailyBackup(vaultKey: Buffer): Promise<void> {
  try {
    const settings = await getSettings()
    if (settings['system.autoBackupDaily'] !== 'true') return
    const today = zonedDateKey(new Date())
    const last = await db().backupLog.findFirst({
      where: { type: 'AUTO', status: 'SUCCESS' },
      orderBy: { createdAt: 'desc' },
    })
    if (last && zonedDateKey(last.createdAt) === today) return
    const result = await createBackup({ vaultKey, includeDocuments: true, type: 'AUTO', note: 'Backup harian otomatis' })
    await db().backupLog.create({
      data: {
        fileName: result.fileName,
        type: 'AUTO',
        sizeBytes: result.sizeBytes,
        checksum: result.checksum,
        encryption: 'AES-256-GCM',
        status: 'SUCCESS',
        notes: 'Backup harian otomatis (database + dokumen)',
      },
    })
    const keep = Number(settings['system.backupRetention'] ?? '30') || 30
    const { enforceRetention } = await import('./lib/backup')
    enforceRetention(keep)
    log.info(`Backup harian selesai: ${result.fileName}`)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    log.error('Backup harian gagal', detail)
    await db().notification.create({
      data: {
        type: 'WARNING',
        title: 'Backup harian gagal',
        message: `Backup otomatis tidak dapat dibuat: ${detail}. Buat backup manual dari menu Backup & Restore.`,
        link: '/backup',
      },
    }).catch(() => undefined)
  }
}
