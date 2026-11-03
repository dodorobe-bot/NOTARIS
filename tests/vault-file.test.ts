import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterAll, describe, expect, it } from 'vitest'

// Folder data dipisahkan sebelum modul vault/paths dievaluasi agar tidak menyentuh data aplikasi.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notaris-vault-life-'))
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

const vault = await import('../src/main/lib/vault')
const { files } = await import('../src/main/lib/paths')
const { encryptFileBuffer } = await import('../src/main/lib/crypto')

const MASTER = 'MasterVaultUji2026!aman'

function seedDatabase(): void {
  fs.mkdirSync(path.dirname(files.db()), { recursive: true })
  const conn = new DatabaseSync(files.db())
  try {
    conn.exec('PRAGMA journal_mode=WAL')
    conn.exec('CREATE TABLE IF NOT EXISTS "Uji" (id INTEGER PRIMARY KEY, isi TEXT NOT NULL)')
    conn.exec(`INSERT INTO "Uji" (isi) VALUES ('baris akta rahasia')`)
  } finally {
    conn.close()
  }
}

function readRows(): string[] {
  const conn = new DatabaseSync(files.db())
  try {
    return conn.prepare('SELECT isi FROM "Uji" ORDER BY id').all().map((r) => String(r.isi))
  } finally {
    conn.close()
  }
}

describe('siklus kunci vault pada berkas nyata', () => {
  it('mengunci ke NPVAULT2 lalu membuka kembali tanpa kehilangan data', async () => {
    vault.initVault()
    expect(vault.vaultStatus().status).toBe('SETUP')
    await vault.createVault(MASTER)
    seedDatabase()

    await vault.lockVault()
    expect(vault.vaultStatus().status).toBe('LOCKED')
    expect(fs.existsSync(files.db())).toBe(false)
    expect(fs.existsSync(`${files.db()}-wal`)).toBe(false)
    expect(fs.readFileSync(files.dbEnc()).subarray(0, 8).toString()).toBe('NPVAULT2')
    expect(fs.existsSync(`${files.dbEnc()}.tmp`)).toBe(false)

    await expect(vault.unlockVault('password-salah-sekali')).rejects.toThrow(/Master password/)
    expect(vault.vaultStatus().status).toBe('LOCKED')

    await vault.unlockVault(MASTER)
    expect(vault.vaultStatus().status).toBe('UNLOCKED')
    expect(readRows()).toEqual(['baris akta rahasia'])
  })

  it('membuka berkas NPVAULT1 lama dan tetap dapat dikunci ke format baru', async () => {
    const plain = fs.readFileSync(files.db())
    const key = vault.getVaultKey()
    if (!key) throw new Error('Vault seharusnya terbuka pada tahap ini.')
    await vault.lockVault()

    fs.writeFileSync(files.dbEnc(), encryptFileBuffer(plain, key))
    await vault.unlockVault(MASTER)
    expect(readRows()).toEqual(['baris akta rahasia'])

    await vault.lockVault()
    expect(fs.readFileSync(files.dbEnc()).subarray(0, 8).toString()).toBe('NPVAULT2')
  })
})

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true })
})
