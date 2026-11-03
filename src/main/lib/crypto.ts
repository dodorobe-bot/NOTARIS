import crypto from 'node:crypto'
import fs from 'node:fs'
import type { FileHandle } from 'node:fs/promises'
import { argon2id } from 'hash-wasm'

const fsp = fs.promises

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

export function encryptFileTo(src: string, dest: string, key: Buffer): Promise<void> {
  return encryptFileStream(src, dest, key)
}

export function decryptFileTo(src: string, dest: string, key: Buffer): Promise<void> {
  return decryptFileAuto(src, dest, key)
}

/*
 * Berkas vault memakai format NPVAULT2 yang di-stream per blok 1 MiB. Format NPVAULT1 lama
 * (seluruh ciphertext dalam satu span GCM) tetap dapat dibaca agar vault yang sudah ada tidak
 * perlu dibuat ulang, tetapi penulisan selalu memakai NPVAULT2.
 *
 * NPVAULT2: MAGIC(8) | chunkSize(u32) | { ctLen(u32) | IV(12) | CT | TAG(16) }* |
 *           FOOTER(8) | totalPlain(u64) | chunkCount(u32) | HMAC(32)
 * AAD setiap blok adalah nomor blok, sehingga blok tidak dapat diurutkan ulang; HMAC dihitung
 * dengan kunci turunan HKDF atas seluruh berkas sehingga pemotongan/penyisipan terdeteksi.
 */
const STREAM_MAGIC = Buffer.from('NPVAULT2')
const STREAM_FOOTER = Buffer.from('NPV2END1')
const STREAM_CHUNK_SIZE = 1024 * 1024
const STREAM_HEADER_BYTES = 12
const STREAM_FOOTER_BYTES = 52
const STREAM_MAC_INFO = 'notaris-vault-file-v2'

function chunkAad(index: number): Buffer {
  const aad = Buffer.alloc(4)
  aad.writeUInt32BE(index, 0)
  return aad
}

function streamMacKey(key: Buffer): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', key, Buffer.alloc(0), STREAM_MAC_INFO, 32))
}

async function readExact(fh: FileHandle, length: number, position: number): Promise<Buffer> {
  const buf = Buffer.alloc(length)
  let read = 0
  while (read < length) {
    const { bytesRead } = await fh.read(buf, read, length - read, position + read)
    if (bytesRead === 0) throw new Error('Berkas terenkripsi terpotong.')
    read += bytesRead
  }
  return buf
}

async function encryptFileStream(src: string, dest: string, key: Buffer): Promise<void> {
  const input = await fsp.open(src, 'r')
  const output = await fsp.open(dest, 'w')
  const mac = crypto.createHmac('sha256', streamMacKey(key))
  const chunk = Buffer.alloc(STREAM_CHUNK_SIZE)
  try {
    const header = Buffer.alloc(STREAM_HEADER_BYTES)
    STREAM_MAGIC.copy(header, 0)
    header.writeUInt32BE(STREAM_CHUNK_SIZE, 8)
    await output.write(header)
    mac.update(header)
    let position = 0
    let index = 0
    let total = 0
    for (;;) {
      const { bytesRead } = await input.read(chunk, 0, STREAM_CHUNK_SIZE, position)
      if (bytesRead === 0) break
      position += bytesRead
      const iv = crypto.randomBytes(12)
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
      cipher.setAAD(chunkAad(index))
      const ct = Buffer.concat([cipher.update(chunk.subarray(0, bytesRead)), cipher.final()])
      const length = Buffer.alloc(4)
      length.writeUInt32BE(ct.length, 0)
      const tag = cipher.getAuthTag()
      const record = Buffer.concat([length, iv, ct, tag])
      await output.write(record)
      mac.update(record)
      total += bytesRead
      index++
    }
    const footer = Buffer.alloc(20)
    STREAM_FOOTER.copy(footer, 0)
    footer.writeBigUInt64BE(BigInt(total), 8)
    footer.writeUInt32BE(index, 16)
    await output.write(footer)
    mac.update(footer)
    await output.write(mac.digest())
    await output.sync()
  } finally {
    await input.close()
    await output.close()
  }
}

async function decryptFileV2(fh: FileHandle, dest: string, key: Buffer): Promise<void> {
  const header = await readExact(fh, STREAM_HEADER_BYTES, 0)
  const chunkSize = header.readUInt32BE(8)
  if (chunkSize < 4096 || chunkSize > 16 * 1024 * 1024) throw new Error('Berkas terenkripsi tidak dikenali')
  const mac = crypto.createHmac('sha256', streamMacKey(key))
  mac.update(header)
  const output = await fsp.open(dest, 'w')
  try {
    let position = STREAM_HEADER_BYTES
    let index = 0
    let total = 0
    for (;;) {
      const marker = await readExact(fh, 4, position)
      if (marker.equals(STREAM_FOOTER.subarray(0, 4))) {
        const rest = await readExact(fh, STREAM_FOOTER_BYTES - 4, position + 4)
        if (!rest.subarray(0, 4).equals(STREAM_FOOTER.subarray(4))) {
          throw new Error('Berkas terenkripsi tidak dikenali')
        }
        const declaredTotal = Number(rest.readBigUInt64BE(4))
        const declaredCount = rest.readUInt32BE(12)
        const storedMac = rest.subarray(16, 48)
        mac.update(marker)
        mac.update(rest.subarray(0, 16))
        const computed = mac.digest()
        if (declaredTotal !== total || declaredCount !== index || storedMac.length !== computed.length ||
            !crypto.timingSafeEqual(storedMac, computed)) {
          throw new Error('Berkas terenkripsi rusak atau tidak utuh')
        }
        const size = (await fh.stat()).size
        if (size !== position + STREAM_FOOTER_BYTES) throw new Error('Berkas terenkripsi memiliki data tambahan')
        await output.sync()
        return
      }
      const ctLen = marker.readUInt32BE(0)
      if (ctLen === 0 || ctLen > chunkSize) throw new Error('Berkas terenkripsi rusak')
      const iv = await readExact(fh, 12, position + 4)
      const ct = await readExact(fh, ctLen, position + 16)
      const tag = await readExact(fh, 16, position + 16 + ctLen)
      mac.update(marker)
      mac.update(iv)
      mac.update(ct)
      mac.update(tag)
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAAD(chunkAad(index))
      decipher.setAuthTag(tag)
      let plain: Buffer
      try {
        plain = Buffer.concat([decipher.update(ct), decipher.final()])
      } catch {
        throw new Error('Master password salah atau berkas rusak')
      }
      await output.write(plain)
      total += plain.length
      index++
      position += 16 + ctLen + 16
    }
  } finally {
    await output.close()
  }
}

async function decryptFileV1(fh: FileHandle, dest: string, key: Buffer): Promise<void> {
  const iv = await readExact(fh, 12, 8)
  const tag = await readExact(fh, 16, 20)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const output = await fsp.open(dest, 'w')
  try {
    let position = 36
    const buf = Buffer.alloc(STREAM_CHUNK_SIZE)
    for (;;) {
      const { bytesRead } = await fh.read(buf, 0, STREAM_CHUNK_SIZE, position)
      if (bytesRead === 0) break
      position += bytesRead
      await output.write(decipher.update(buf.subarray(0, bytesRead)))
    }
    try {
      await output.write(decipher.final())
    } catch {
      throw new Error('Master password salah atau berkas rusak')
    }
    await output.sync()
  } finally {
    await output.close()
  }
}

async function decryptFileAuto(src: string, dest: string, key: Buffer): Promise<void> {
  const input = await fsp.open(src, 'r')
  try {
    const head = await readExact(input, 8, 0)
    if (head.equals(FILE_MAGIC)) await decryptFileV1(input, dest, key)
    else if (head.equals(STREAM_MAGIC)) await decryptFileV2(input, dest, key)
    else throw new Error('Berkas terenkripsi tidak dikenali')
  } catch (err) {
    fs.rmSync(dest, { force: true })
    throw err
  } finally {
    await input.close()
  }
}

export function readVaultMeta(file: string): VaultMeta | null {
  try {
    if (!fs.existsSync(file)) return null
    return JSON.parse(fs.readFileSync(file, 'utf8')) as VaultMeta
  } catch {
    return null
  }
}
