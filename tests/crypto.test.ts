import { describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import {
  aesDecrypt, aesEncrypt, decryptFileBuffer, encryptFileBuffer, generateRecoveryCode, hashPassword,
  normalizeRecoveryCode, sha256, verifyPassword,
} from '../src/main/lib/crypto'

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
