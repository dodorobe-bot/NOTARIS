import { afterEach, describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  aesDecrypt, aesEncrypt, decryptFileBuffer, decryptFileTo, encryptFileBuffer, encryptFileTo,
  generateRecoveryCode, hashPassword, normalizeRecoveryCode, sha256, verifyPassword,
} from '../src/main/lib/crypto'

const tempDirs: string[] = []

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notaris-vault-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('password hashing (Argon2id)', () => {
  it('menyimpan hash berformat argon2id, bukan plaintext', async () => {
    const stored = await hashPassword('RahasiaSekali123')
    expect(stored.startsWith('$argon2id$')).toBe(true)
    expect(stored).not.toContain('RahasiaSekali123')
    expect(stored.split('$')).toHaveLength(6)
  })

  it('menerima password benar dan menolak password salah', async () => {
    const stored = await hashPassword('KataSandiKuat!')
    await expect(verifyPassword('KataSandiKuat!', stored)).resolves.toBe(true)
    await expect(verifyPassword('KataSandiKuat', stored)).resolves.toBe(false)
    await expect(verifyPassword('', stored)).resolves.toBe(false)
  })

  it('menolak hash yang rusak tanpa melempar', async () => {
    await expect(verifyPassword('apa saja', 'bukan-hash')).resolves.toBe(false)
    await expect(verifyPassword('apa saja', '')).resolves.toBe(false)
  })
})

describe('AES-256-GCM', () => {
  const key = crypto.randomBytes(32)

  it('bolak-balik enkripsi buffer', () => {
    const plain = Buffer.from('Data akta rahasia — NOTARIS PRO')
    const enc = aesEncrypt(plain, key)
    expect(enc.data).not.toContain('rahasia')
    expect(aesDecrypt(enc, key).toString()).toBe(plain.toString())
  })

  it('gagal mendekripsi bila tag diubah', () => {
    const enc = aesEncrypt(Buffer.from('integritas'), key)
    const tampered = { ...enc, tag: Buffer.alloc(16).toString('base64') }
    expect(() => aesDecrypt(tampered, key)).toThrow()
  })

  it('format berkas terenkripsi memakai magic NPVAULT1', () => {
    const plain = Buffer.from('SQLite database content')
    const enc = encryptFileBuffer(plain, key)
    expect(enc.subarray(0, 8).toString()).toBe('NPVAULT1')
    expect(decryptFileBuffer(enc, key).toString()).toBe(plain.toString())
  })

  it('menolak berkas dengan magic salah', () => {
    const enc = encryptFileBuffer(Buffer.from('x'), key)
    const bad = Buffer.concat([Buffer.from('BUKANXXX'), enc.subarray(8)])
    expect(() => decryptFileBuffer(bad, key)).toThrow()
  })
})

describe('berkas vault streaming (NPVAULT2)', () => {
  const key = crypto.randomBytes(32)

  it('bolak-balik berkas multi-blok tanpa memuat seluruh isi ke memori', async () => {
    const dir = tempDir()
    const src = path.join(dir, 'app.db')
    const enc = path.join(dir, 'app.db.enc')
    const out = path.join(dir, 'restored.db')
    const plain = crypto.randomBytes(3 * 1024 * 1024 + 123)
    fs.writeFileSync(src, plain)

    await encryptFileTo(src, enc, key)
    expect(fs.readFileSync(enc).subarray(0, 8).toString()).toBe('NPVAULT2')
    await decryptFileTo(enc, out, key)
    expect(sha256(fs.readFileSync(out))).toBe(sha256(plain))
  })

  it('tetap dapat membaca berkas NPVAULT1 lama', async () => {
    const dir = tempDir()
    const src = path.join(dir, 'legacy.enc')
    const out = path.join(dir, 'legacy.db')
    const plain = crypto.randomBytes(2 * 1024 * 1024 + 7)
    fs.writeFileSync(src, encryptFileBuffer(plain, key))

    await decryptFileTo(src, out, key)
    expect(sha256(fs.readFileSync(out))).toBe(sha256(plain))
  })

  it('menolak blok yang diubah dan menghapus hasil dekripsi sebagian', async () => {
    const dir = tempDir()
    const src = path.join(dir, 'app.db')
    const enc = path.join(dir, 'app.db.enc')
    const out = path.join(dir, 'restored.db')
    fs.writeFileSync(src, crypto.randomBytes(2 * 1024 * 1024))
    await encryptFileTo(src, enc, key)

    const bytes = fs.readFileSync(enc)
    bytes[bytes.length - 80] ^= 0xff
    fs.writeFileSync(enc, bytes)

    await expect(decryptFileTo(enc, out, key)).rejects.toThrow(/rusak|tidak utuh/)
    expect(fs.existsSync(out)).toBe(false)
  })

  it('menolak berkas terpotong dan kunci yang salah', async () => {
    const dir = tempDir()
    const src = path.join(dir, 'app.db')
    const enc = path.join(dir, 'app.db.enc')
    fs.writeFileSync(src, crypto.randomBytes(1024 * 1024))
    await encryptFileTo(src, enc, key)

    const truncated = path.join(dir, 'truncated.enc')
    const bytes = fs.readFileSync(enc)
    fs.writeFileSync(truncated, bytes.subarray(0, bytes.length - 10))
    await expect(decryptFileTo(truncated, path.join(dir, 'a.db'), key)).rejects.toThrow()
    expect(fs.existsSync(path.join(dir, 'a.db'))).toBe(false)

    await expect(decryptFileTo(enc, path.join(dir, 'b.db'), crypto.randomBytes(32)))
      .rejects.toThrow(/Master password salah|rusak/)
    expect(fs.existsSync(path.join(dir, 'b.db'))).toBe(false)
  })
})

describe('kode pemulihan', () => {
  it('membuat 24 karakter unik berkelompok', () => {
    const code = generateRecoveryCode()
    expect(code).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){5}$/)
    expect(normalizeRecoveryCode(code.toLowerCase().replace(/-/g, ' '))).toHaveLength(24)
    const other = generateRecoveryCode()
    expect(other).not.toBe(code)
  })
})

describe('sha256', () => {
  it('menghasilkan digest hex deterministik', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(sha256(Buffer.from('abc'))).toBe(sha256('abc'))
  })
})
