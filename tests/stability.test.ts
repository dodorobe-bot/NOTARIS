import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterAll, describe, expect, it, vi } from 'vitest'

// `migrationFiles()` memakai app.isPackaged; modul electron asli tidak menyediakannya di Node.
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => process.cwd(), getPath: () => process.cwd() },
}))

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notaris-stability-'))
process.env.NOTARIS_DATA_DIR = dataDir
delete process.env.NOTARIS_VAULT

const nodeRequire = createRequire(import.meta.url)
const { DatabaseSync } = nodeRequire('node:sqlite') as {
  DatabaseSync: new (p: string) => {
    exec(sql: string): void
    prepare(sql: string): { run(...args: unknown[]): unknown; all(): Record<string, unknown>[] }
    close(): void
  }
}

const backupLib = await import('../src/main/lib/backup')
const { beginMaintenance, maintenanceReason } = await import('../src/main/lib/maintenance')
const { dirs, files } = await import('../src/main/lib/paths')
const vault = await import('../src/main/lib/vault')

const MASTER = 'MasterStabilitas2026!aman'
const vaultKey = crypto.createHash('sha256').update('kunci-uji-stabilitas').digest()

function prepareDirs(): void {
  for (const dir of [dirs.database(), dirs.documents(), dirs.backups(), dirs.templates(), dirs.logs()]) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function writeDb(value: string): void {
  fs.mkdirSync(path.dirname(files.db()), { recursive: true })
  const conn = new DatabaseSync(files.db())
  try {
    conn.exec('PRAGMA journal_mode=WAL')
    conn.exec('CREATE TABLE IF NOT EXISTS "Uji" (id INTEGER PRIMARY KEY, isi TEXT NOT NULL)')
    conn.exec('DELETE FROM "Uji"')
    conn.prepare('INSERT INTO "Uji" (id, isi) VALUES (1, ?)').run(value)
  } finally {
    conn.close()
  }
}

function readDb(): string {
  const conn = new DatabaseSync(files.db())
  try {
    const row = conn.prepare('SELECT isi FROM "Uji" ORDER BY id LIMIT 1').all()[0]
    return String(row?.isi ?? '')
  } finally {
    conn.close()
  }
}

describe('stabilitas operasi konkuren', () => {
  it('dua permintaan kunci vault bersamaan tidak memakai berkas sementara yang sama', async () => {
    prepareDirs()
    vault.initVault()
    await vault.createVault(MASTER)
    writeDb('ISI-AMAN')

    await Promise.all([vault.lockVault(), vault.lockVault()])
    expect(vault.vaultStatus().status).toBe('LOCKED')
    expect(fs.existsSync(`${files.dbEnc()}.tmp`)).toBe(false)
    expect(fs.readFileSync(files.dbEnc()).subarray(0, 8).toString()).toBe('NPVAULT2')

    await vault.unlockVault(MASTER)
    expect(readDb()).toBe('ISI-AMAN')
  }, 60_000)

  it('siklus kunci/buka berulang tidak meninggalkan berkas sementara atau plaintext', async () => {
    prepareDirs()
    const state = vault.vaultStatus().status
    if (state === 'SETUP') await vault.createVault(MASTER)
    else if (state !== 'UNLOCKED') await vault.unlockVault(MASTER)
    writeDb('SIKLUS-SOAK')

    for (let i = 0; i < 7; i++) {
      await vault.lockVault()
      expect(fs.existsSync(files.db())).toBe(false)
      expect(fs.existsSync(`${files.db()}-wal`)).toBe(false)
      expect(fs.existsSync(`${files.dbEnc()}.tmp`)).toBe(false)
      await vault.unlockVault(MASTER)
      expect(readDb()).toBe('SIKLUS-SOAK')
      expect(fs.existsSync(`${files.db()}.restore`)).toBe(false)
    }
  }, 120_000)

  it('backup yang diminta bersamaan dijalankan berurutan dan menghasilkan berkas berbeda', async () => {
    prepareDirs()
    writeDb('UNTUK-BACKUP')

    const [first, second] = await Promise.all([
      backupLib.createBackup({ vaultKey, includeDocuments: false, type: 'MANUAL' }),
      backupLib.createBackup({ vaultKey, includeDocuments: false, type: 'MANUAL' }),
    ])

    expect(first.fileName).not.toBe(second.fileName)
    expect(fs.existsSync(first.filePath)).toBe(true)
    expect(fs.existsSync(second.filePath)).toBe(true)
    expect(fs.statSync(first.filePath).size).toBeGreaterThan(0)
    expect(backupLib.backupsInFlight()).toBe(0)
    expect(fs.readdirSync(dirs.backups()).some((f) => f.endsWith('.part'))).toBe(false)
  }, 120_000)

  it('backup ditolak saat operasi eksklusif (restore/kunci) sedang berjalan', async () => {
    prepareDirs()
    writeDb('SAAT-SIBUK')

    const release = beginMaintenance('uji eksklusif')
    expect(maintenanceReason()).toBe('uji eksklusif')
    await expect(
      backupLib.createBackup({ vaultKey, includeDocuments: false, type: 'MANUAL' }),
    ).rejects.toMatchObject({ code: 'BUSY' })
    release()
    expect(maintenanceReason()).toBeNull()

    const result = await backupLib.createBackup({ vaultKey, includeDocuments: false, type: 'MANUAL' })
    expect(fs.existsSync(result.filePath)).toBe(true)
  }, 60_000)

  it('beginMaintenance kedua ditolak agar restore tidak saling menimpa', () => {
    const release = beginMaintenance('pertama')
    expect(() => beginMaintenance('kedua')).toThrow(/sibuk/i)
    release()
    const again = beginMaintenance('ketiga')
    again()
  })
})

describe('pembacaan status migrasi', () => {
  it('menolak database yang tidak dapat dibaca alih-alih mengulang semua migrasi', async () => {
    const migrate = await import('../src/main/lib/migrate')
    const broken = path.join(dataDir, 'rusak.db')
    fs.writeFileSync(broken, 'ini bukan database sqlite')
    expect(() => migrate.pendingMigrations(broken)).toThrow(/Status migrasi/i)
    expect(fs.existsSync(broken)).toBe(true)
  })
})

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true })
})
