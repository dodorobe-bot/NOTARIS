import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { decryptBackupPayload, encryptBackupPayload, parseBackupFile } from '../src/main/lib/backup'

const key = crypto.createHash('sha256').update('kunci-uji-backup').digest()
const zip = Buffer.from('PK\u0003\u0004isi-zip-palsu-untuk-uji')

function header() {
  return {
    format: 'NPBACKUP1' as const,
    createdAt: '2026-11-02T00:00:00.000Z',
    appVersion: '1.0.0',
    keySource: 'vault' as const,
    iv: '',
    tag: '',
    payloadSha256: '',
  }
}

describe('format berkas backup', () => {
  it('menulis magic NPBACKUP1 dan dapat dibaca kembali', () => {
    const enc = encryptBackupPayload(zip, header(), key)
    expect(enc.subarray(0, 9).toString('utf8')).toBe('NPBACKUP1')

    const parsed = parseBackupFile(enc)
    expect(parsed.header.format).toBe('NPBACKUP1')
    expect(parsed.header.keySource).toBe('vault')
    expect(decryptBackupPayload(parsed.header, parsed.ciphertext, key)).toEqual(zip)
  })

  it('menolak berkas dengan magic salah', () => {
    const enc = encryptBackupPayload(zip, header(), key)
    enc.write('X', 0)
    expect(() => parseBackupFile(enc)).toThrow(/bukan backup/)
  })

  it('menolak ciphertext yang diubah', () => {
    const enc = encryptBackupPayload(zip, header(), key)
    const parsed = parseBackupFile(enc)
    const tampered = Buffer.from(parsed.ciphertext)
    tampered[0] ^= 0xff
    expect(() => decryptBackupPayload(parsed.header, tampered, key)).toThrow(/Passphrase salah/)
  })

  it('menolak kunci yang salah', () => {
    const enc = encryptBackupPayload(zip, header(), key)
    const parsed = parseBackupFile(enc)
    const wrong = crypto.createHash('sha256').update('kunci-lain').digest()
    expect(() => decryptBackupPayload(parsed.header, parsed.ciphertext, wrong)).toThrow(/Passphrase salah/)
  })
})
