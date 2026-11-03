import crypto from 'node:crypto'
import fs from 'node:fs'
import { argon2id } from 'hash-wasm'

export const ARGON2 = { memorySize: 32768, iterations: 3, parallelism: 1, hashLength: 32 }

export interface WrappedKey {
  iv: string
  tag: string
  data: string
}

export interface KdfInfo {
  name: 'argon2id'
  salt: string
  memorySize: number
  iterations: number
  parallelism: number
}

export interface VaultMeta {
  version: 1
  createdAt: string
  master: { kdf: KdfInfo; wrapped: WrappedKey }
  recovery: { kdf: KdfInfo; wrapped: WrappedKey }
}

export async function deriveKey(
  secret: string,
  salt: Buffer,
  params = ARGON2,
): Promise<Buffer> {
  const out = await argon2id({
    password: secret,
    salt,
    parallelism: params.parallelism,
    iterations: params.iterations,
    memorySize: params.memorySize,
    hashLength: params.hashLength,
    outputType: 'binary',
  })
  return Buffer.from(out)
}

/** Format hash password: $argon2id$v=19$m=...,t=...,p=...$salt$hash */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16)
  const hash = await deriveKey(password, salt)
  return [
    '$argon2id',
    'v=19',
    `m=${ARGON2.memorySize},t=${ARGON2.iterations},p=${ARGON2.parallelism}`,
    salt.toString('base64'),
    hash.toString('base64'),
  ].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split('$')
    if (parts.length !== 6 || parts[1] !== 'argon2id') return false
    const [, , , params, saltB64, hashB64] = parts
    const m = /m=(\d+),t=(\d+),p=(\d+)/.exec(params)
    if (!m) return false
    const salt = Buffer.from(saltB64, 'base64')
    const expected = Buffer.from(hashB64, 'base64')
    const actual = await deriveKey(password, salt, {
      memorySize: Number(m[1]),
      iterations: Number(m[2]),
      parallelism: Number(m[3]),
      hashLength: expected.length,
    })
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

export function aesEncrypt(plain: Buffer, key: Buffer): { iv: string; tag: string; data: string } {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plain), cipher.final()])
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  }
}

export function aesDecrypt(payload: { iv: string; tag: string; data: string }, key: Buffer): Buffer {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()])
}

export async function wrapKey(key: Buffer, secret: string, kdfSalt?: Buffer): Promise<{ kdf: KdfInfo; wrapped: WrappedKey }> {
  const salt = kdfSalt ?? crypto.randomBytes(16)
  const kek = await deriveKey(secret, salt)
  return {
    kdf: { name: 'argon2id', salt: salt.toString('base64'), ...ARGON2 },
    wrapped: aesEncrypt(key, kek),
  }
}

export async function unwrapKey(kdf: KdfInfo, wrapped: WrappedKey, secret: string): Promise<Buffer> {
  const kek = await deriveKey(secret, Buffer.from(kdf.salt, 'base64'), {
    memorySize: kdf.memorySize,
    iterations: kdf.iterations,
    parallelism: kdf.parallelism,
    hashLength: 32,
  })
  return aesDecrypt(wrapped, kek)
}

const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateRecoveryCode(): string {
  const bytes = crypto.randomBytes(24)
  let out = ''
  for (let i = 0; i < 24; i++) {
    out += RECOVERY_ALPHABET[bytes[i] % RECOVERY_ALPHABET.length]
    if ((i + 1) % 4 === 0 && i < 23) out += '-'
  }
  return out
}

export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function normalizeMasterPassword(pw: string): string {
  return pw.normalize('NFKC')
}

export function sha256(buffer: Buffer | string): string {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

export function hmac(key: Buffer, value: string): string {
  return crypto.createHmac('sha256', key).update(value).digest('hex')
}

const FILE_MAGIC = Buffer.from('NPVAULT1')

/** Enkripsi berkas database/invoice dengan AES-256-GCM. Format: MAGIC(8) | IV(12) | TAG(16) | DATA */
export function encryptFileBuffer(plain: Buffer, key: Buffer): Buffer {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plain), cipher.final()])
  return Buffer.concat([FILE_MAGIC, iv, cipher.getAuthTag(), data])
}

export function decryptFileBuffer(enc: Buffer, key: Buffer): Buffer {
  if (enc.length < FILE_MAGIC.length + 28 || !enc.subarray(0, 8).equals(FILE_MAGIC)) {
    throw new Error('Berkas terenkripsi tidak dikenali')
  }
  const iv = enc.subarray(8, 20)
  const tag = enc.subarray(20, 36)
  const data = enc.subarray(36)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  try {
    return Buffer.concat([decipher.update(data), decipher.final()])
  } catch {
    throw new Error('Master password salah atau berkas rusak')
  }
}

export function encryptFileTo(src: string, dest: string, key: Buffer): void {
  const plain = fs.readFileSync(src)
  fs.writeFileSync(dest, encryptFileBuffer(plain, key))
}

export function decryptFileTo(src: string, dest: string, key: Buffer): void {
  const enc = fs.readFileSync(src)
  fs.writeFileSync(dest, decryptFileBuffer(enc, key))
}

export function readVaultMeta(file: string): VaultMeta | null {
  try {
    if (!fs.existsSync(file)) return null
    return JSON.parse(fs.readFileSync(file, 'utf8')) as VaultMeta
  } catch {
    return null
  }
}
