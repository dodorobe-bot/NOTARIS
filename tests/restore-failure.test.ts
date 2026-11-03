import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterAll, describe, expect, it, vi } from 'vitest'

// `migrationFiles()` memakai app.isPackaged; modul electron asli hanya mengekspor path exe di Node.
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => process.cwd(), getPath: () => process.cwd() },
}))

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notaris-restore-life-'))
process.env.NOTARIS_DATA_DIR = dataDir

const nodeRequire = createRequire(import.meta.url)
const { DatabaseSync } = nodeRequire('node:sqlite') as {
  DatabaseSync: new (p: string) => {
    exec(sql: string): void
    prepare(sql: string): { all(): Record<string, unknown>[]; run(...args: unknown[]): unknown }
    close(): void
  }
}

const backupLib = await import('../src/main/lib/backup')
const { dirs, files } = await import('../src/main/lib/paths')

const vaultKey = crypto.createHash('sha256').update('kunci-vault-uji-restore').digest()

function prepareDirs(): void {
  for (const dir of [dirs.database(), dirs.documents(), dirs.backups(), dirs.templates(), dirs.logs()]) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function writeDb(value: string): void {
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

function docPath(): string {
  return path.join(dirs.documents(), 'clients', 'a.txt')
}

function writeDoc(value: string): void {
  fs.mkdirSync(path.dirname(docPath()), { recursive: true })
  fs.writeFileSync(docPath(), value)
}

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true })
})

describe('kegagalan restore dan rollback', () => {
  it('mengembalikan database ke kondisi pra-restore setelah restore gagal di tengah proses', async () => {
    prepareDirs()
    writeDb('SEBELUM')
    writeDoc('sebelum')
    const pre = await backupLib.createBackup({ vaultKey, includeDocuments: true, type: 'MANUAL', note: 'pengaman' })

    writeDb('SESUDAH')
    writeDoc('sesudah')
    const newer = await backupLib.createBackup({ vaultKey, includeDocuments: true, type: 'MANUAL', note: 'target' })

    writeDb('TERKINI')
    writeDoc('terkini')

    // Halangan nyata pada folder dokumen: berkas yang sama menjadi direktori, sehingga penyalinan
    // dokumen gagal setelah database sudah diganti.
    fs.rmSync(docPath(), { force: true })
    fs.mkdirSync(docPath(), { recursive: true })
    fs.writeFileSync(path.join(docPath(), 'halangan.txt'), 'x')

    await expect(
      backupLib.restoreBackup({ filePath: newer.filePath, vaultKey, restoreDocuments: true }),
    ).rejects.toThrow()
    expect(readDb()).toBe('SESUDAH')

    // Tindakan yang sama dengan blok catch handler backup.restore.
    fs.rmSync(docPath(), { recursive: true, force: true })
    await backupLib.restoreBackup({ filePath: pre.filePath, vaultKey, restoreDocuments: true })

    expect(readDb()).toBe('SEBELUM')
    expect(fs.readFileSync(docPath(), 'utf8')).toBe('sebelum')
    expect(fs.existsSync(pre.filePath)).toBe(true)
    expect(fs.existsSync(newer.filePath)).toBe(true)
    expect(fs.readdirSync(dirs.database()).some((f) => f.includes('.restoring'))).toBe(false)
  }, 60_000)

  it('menunggu kunci berkas Windows ketika koneksi database masih terbuka saat restore', async () => {
    prepareDirs()
    writeDb('LAMA')
    writeDoc('lama')
    const source = await backupLib.createBackup({ vaultKey, includeDocuments: true, type: 'MANUAL' })
    writeDb('BARU')
    writeDoc('baru')

    // Windows menolak menghapus/mengganti berkas selama handle SQLite masih terbuka.
    const held = new DatabaseSync(files.db())
    const closer = setTimeout(() => held.close(), 400)
    try {
      await backupLib.restoreBackup({ filePath: source.filePath, vaultKey, restoreDocuments: true })
    } finally {
      clearTimeout(closer)
      try {
        held.close()
      } catch {
        // sudah ditutup oleh penjadwal
      }
    }

    expect(readDb()).toBe('LAMA')
    expect(fs.readFileSync(docPath(), 'utf8')).toBe('lama')
  }, 60_000)

  it('backup rusak ditolak sebelum database yang sedang dipakai disentuh', async () => {
    writeDb('JANGAN-BERUBAH')
    writeDoc('aman')
    const good = await backupLib.createBackup({ vaultKey, includeDocuments: false, type: 'MANUAL' })
    const brokenPath = path.join(dataDir, 'rusak.npbackup')
    fs.copyFileSync(good.filePath, brokenPath)
    const bytes = fs.readFileSync(brokenPath)
    bytes[Math.floor(bytes.length / 2)] ^= 0xff
    fs.writeFileSync(brokenPath, bytes)

    await expect(
      backupLib.restoreBackup({ filePath: brokenPath, vaultKey, restoreDocuments: true }),
    ).rejects.toThrow(/checksum|rusak|tag|verifikasi|Tidak|gagal/i)
    expect(readDb()).toBe('JANGAN-BERUBAH')
    expect(fs.readFileSync(docPath(), 'utf8')).toBe('aman')
  }, 60_000)
})
