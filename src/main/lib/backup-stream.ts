import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Transform, PassThrough, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import zlib from 'node:zlib'

/**
 * Wadah cadangan NPBACKUP2.
 *
 * Format lama memuat seluruh isi arsip ke memori (Buffer) sebelum dan sesudah enkripsi, sehingga
 * basis data berukuran gigabyte tidak dapat dicadangkan sama sekali. Format ini memindahkan berkas
 * satuan per satuan melalui stream dengan backpressure asli, tanpa pernah menahan isinya di memori.
 *
 * Struktur berkas:
 *   "NPBACKUP2" | u32 headerLen | header JSON | entri... | "NPB2FOOT" | u32 footerLen | footer JSON
 *
 * dengan setiap entri:
 *   u32 nameLen | name | iv(12) | ciphertext(storedSize) | tag(16)
 *
 * Panjang isi entri tidak disimpan di header entri karena stream ditulis sekali jalan; nilainya ada
 * di footer (storedSize) dan pembacaan selalu memakai urutan footer. Footer ditulis paling akhir dan
 * berperan sebagai penanda selesai: cadangan yang terputus (listrik padam, aplikasi dihentikan) tidak
 * punya footer, sehingga validasi mengenalinya sebagai tidak lengkap dan cadangan lama tidak dibuang.
 *
 * SHA-256 pada footer dihitung atas isi asli (sebelum kompresi, sebelum enkripsi) sehingga validasi
 * membandingkan berkas yang benar-benar akan dipulihkan, bukan sekadar byte di dalam wadah.
 */
const MAGIC = Buffer.from('NPBACKUP2')
const FOOTER_MAGIC = Buffer.from('NPB2FOOT')
const IV_BYTES = 12
const TAG_BYTES = 16
const CHUNK_BYTES = 1024 * 1024
const MAX_NAME_BYTES = 4096

export type StreamCodec = 'gzip' | 'raw'

export interface StreamEntrySpec {
  name: string
  sourcePath: string
}

export interface StreamHeader {
  format: 'NPBACKUP2'
  createdAt: string
  appVersion: string
  keySource: 'vault' | 'passphrase'
  kdf?: { salt: string; memorySize: number; iterations: number; parallelism: number }
  cipher: 'aes-256-gcm'
  codec: StreamCodec
}

export interface StreamFooterEntry {
  name: string
  plainSize: number
  storedSize: number
  sha256: string
}

export interface StreamFooter {
  entries: StreamFooterEntry[]
}

function uint32BE(value: number): Buffer {
  const buf = Buffer.alloc(4)
  buf.writeUInt32BE(value, 0)
  return buf
}

function uint64BE(value: number): Buffer {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(value))
  return buf
}

function safeName(name: string): string {
  const normalized = name.replace(/\\/g, '/')
  if (normalized.startsWith('/') || normalized.includes('..') || /^[a-zA-Z]:/.test(normalized)) {
    throw new Error(`Nama entri cadangan tidak aman: ${name}`)
  }
  return normalized
}

function compressor(codec: StreamCodec): zlib.Gzip | PassThrough {
  if (codec === 'gzip') return zlib.createGzip({ level: 6 })
  return new PassThrough()
}

/** True bila berkas memakai format 2; format 1 dikenali dari magic NPBACKUP1. */
export function isStreamContainer(filePath: string): boolean {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size < MAGIC.length) return false
  const fd = fs.openSync(filePath, 'r')
  try {
    const buf = Buffer.alloc(MAGIC.length)
    if (fs.readSync(fd, buf, 0, buf.length, 0) !== buf.length) return false
    return buf.equals(MAGIC)
  } catch {
    return false
  } finally {
    fs.closeSync(fd)
  }
}

function hashingTransform(hash: crypto.Hash): Transform {
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      hash.update(chunk)
      cb(null, chunk)
    },
  })
}

function discardStream(): Writable {
  return new Writable({ write(_chunk, _enc, cb) { cb() } })
}

/** Menulis wadah terenkripsi langsung dari berkas sumber tanpa memuat isinya ke memori. */
export async function writeContainer(
  destPath: string,
  header: StreamHeader,
  entries: StreamEntrySpec[],
  key: Buffer,
  onProgress?: (done: number, total: number, name: string) => void,
): Promise<{ bytesWritten: number; entries: StreamFooterEntry[] }> {
  if (header.format !== 'NPBACKUP2') throw new Error('Header cadangan tidak dikenal.')
  if (header.cipher !== 'aes-256-gcm') throw new Error('Sandi cadangan tidak dikenal.')
  if (header.codec !== 'gzip' && header.codec !== 'raw') throw new Error('Kompresi cadangan tidak dikenal.')
  if (entries.length === 0) throw new Error('Cadangan kosong ditolak.')

  const headerBuf = Buffer.from(JSON.stringify(header), 'utf8')
  if (headerBuf.length > 1024 * 1024) throw new Error('Header cadangan terlalu besar.')
  const recorded: StreamFooterEntry[] = []
  const out = fs.createWriteStream(destPath)
  let bytesWritten = 0
  try {
    await writeChunk(out, Buffer.concat([MAGIC, uint32BE(headerBuf.length), headerBuf]))
    bytesWritten += MAGIC.length + 4 + headerBuf.length

    for (const [index, entry] of entries.entries()) {
      const name = safeName(entry.name)
      const nameBuf = Buffer.from(name, 'utf8')
      if (nameBuf.length < 1 || nameBuf.length > MAX_NAME_BYTES) throw new Error(`Nama entri cadangan tidak valid: ${name}`)
      const stat = fs.statSync(entry.sourcePath)
      if (!stat.isFile()) throw new Error(`Berkas cadangan bukan berkas biasa: ${name}`)

      const iv = crypto.randomBytes(IV_BYTES)
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
      const hash = crypto.createHash('sha256')
      let storedSize = 0
      const compress = compressor(header.codec)
      // Tag ditulis setelah cipher selesai, lewat Transform final, agar tetap berada di ujung entri.
      const tagger = new Transform({
        transform(chunk: Buffer, _enc, cb) {
          storedSize += chunk.length
          cb(null, chunk)
        },
        final(cb) {
          this.push(cipher.getAuthTag())
          cb()
        },
      })
      await writeChunk(out, Buffer.concat([uint32BE(nameBuf.length), nameBuf, iv, uint64BE(stat.size)]))
      bytesWritten += 4 + nameBuf.length + IV_BYTES + 8
      await pipeline(
        fs.createReadStream(entry.sourcePath, { highWaterMark: CHUNK_BYTES }),
        hashingTransform(hash),
        compress,
        cipher,
        tagger,
        out,
        { end: false },
      )
      const sha256 = hash.digest('hex')
      recorded.push({ name, plainSize: stat.size, storedSize, sha256 })
      bytesWritten += storedSize + TAG_BYTES
      onProgress?.(index + 1, entries.length, name)
    }

    const footerBuf = Buffer.from(JSON.stringify({ entries: recorded } satisfies StreamFooter), 'utf8')
    await writeChunk(out, Buffer.concat([FOOTER_MAGIC, uint32BE(footerBuf.length), footerBuf]))
    bytesWritten += FOOTER_MAGIC.length + 4 + footerBuf.length
    await new Promise<void>((resolve, reject) => {
      out.on('error', reject)
      out.end(() => resolve())
    })
    out.destroy()
  } catch (err) {
    out.destroy()
    throw err
  }
  return { bytesWritten, entries: recorded }
}

function writeChunk(stream: fs.WriteStream, chunk: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write(chunk, (err) => (err ? reject(err) : resolve()))
  })
}

export function readHeader(srcPath: string): { header: StreamHeader; bodyStart: number } {
  const fd = fs.openSync(srcPath, 'r')
  try {
    const magic = Buffer.alloc(MAGIC.length)
    if (fs.readSync(fd, magic, 0, magic.length, 0) !== magic.length || !magic.equals(MAGIC)) {
      throw new Error('Berkas bukan cadangan NOTARIS PRO format 2.')
    }
    const lenBuf = Buffer.alloc(4)
    if (fs.readSync(fd, lenBuf, 0, 4, MAGIC.length) !== 4) throw new Error('Header cadangan rusak.')
    const headerLen = lenBuf.readUInt32BE(0)
    if (headerLen < 2 || headerLen > 1024 * 1024) throw new Error('Header cadangan rusak.')
    const headerBuf = readAt(srcPath, MAGIC.length + 4, headerLen)
    const header = JSON.parse(headerBuf.toString('utf8')) as StreamHeader
    if (header.format !== 'NPBACKUP2') throw new Error('Versi format cadangan tidak dikenal.')
    if (header.cipher !== 'aes-256-gcm') throw new Error('Sandi cadangan tidak dikenal.')
    if (header.codec !== 'gzip' && header.codec !== 'raw') throw new Error('Kompresi cadangan tidak dikenal.')
    return { header, bodyStart: MAGIC.length + 4 + headerLen }
  } finally {
    fs.closeSync(fd)
  }
}

function readAt(srcPath: string, position: number, length: number): Buffer {
  const buf = Buffer.alloc(length)
  const fd = fs.openSync(srcPath, 'r')
  try {
    if (fs.readSync(fd, buf, 0, length, position) !== length) throw new Error('Berkas cadangan terpotong.')
  } finally {
    fs.closeSync(fd)
  }
  return buf
}

interface FooterScan {
  footer: StreamFooter | null
  footerStart: number
}

function scanFooter(srcPath: string, size: number): FooterScan {
  // Footer ada di ujung berkas: magic(8) + len(4) + json. Cukup dibaca pada 1 MB terakhir.
  const window = Math.min(size, 1024 * 1024)
  const buf = readAt(srcPath, size - window, window)
  const idx = buf.lastIndexOf(FOOTER_MAGIC)
  if (idx < 0) return { footer: null, footerStart: size }
  const footerStart = size - window + idx
  const lenOffset = footerStart + FOOTER_MAGIC.length
  if (lenOffset + 4 > size) return { footer: null, footerStart: size }
  const footerLen = readAt(srcPath, lenOffset, 4).readUInt32BE(0)
  if (footerLen < 2 || lenOffset + 4 + footerLen > size) return { footer: null, footerStart: size }
  const json = readAt(srcPath, lenOffset + 4, footerLen)
  return { footer: JSON.parse(json.toString('utf8')) as StreamFooter, footerStart }
}

export interface ContainerReport {
  entries: StreamFooterEntry[]
  totalBytes: number
  header: StreamHeader
}

/**
 * Verifikasi struktur dan isi cadangan tanpa menulis ke disk: footer wajib ada, setiap entri harus
 * mendekripsi dengan tag AES-GCM, dan SHA-256 isi asli harus cocok dengan footer.
 */
export async function verifyContainer(srcPath: string, key: Buffer, onProgress?: (done: number, total: number, name: string) => void): Promise<ContainerReport> {
  return walkEntries(srcPath, key, null, onProgress)
}

/**
 * Membaca dan mendekripsi seluruh entri ke direktori tujuan, dengan verifikasi yang sama seperti
 * verifyContainer. Berkas tujuan ditulis lengkap sebelum entri berikutnya dimulai.
 */
export async function readContainer(
  srcPath: string,
  key: Buffer,
  destDir: string,
  onProgress?: (done: number, total: number, name: string) => void,
  opts?: { include?: (name: string) => boolean },
): Promise<ContainerReport> {
  if (!path.isAbsolute(destDir)) throw new Error('Direktori tujuan harus absolut.')
  return walkEntries(srcPath, key, destDir, onProgress, opts?.include)
}

/** Nama entri tanpa mendekripsi isi — dipakai antarmuka untuk menampilkan isi cadangan. */
export function listContainerEntries(srcPath: string): StreamFooterEntry[] {
  const size = fs.statSync(srcPath).size
  const { footer } = scanFooter(srcPath, size)
  if (!footer) throw new Error('Cadangan tidak lengkap: penanda akhir tidak ditemukan (penulisan terputus).')
  return footer.entries
}

async function walkEntries(
  srcPath: string,
  key: Buffer,
  destDir: string | null,
  onProgress?: (done: number, total: number, name: string) => void,
  include?: (name: string) => boolean,
): Promise<ContainerReport> {
  const { header, bodyStart } = readHeader(srcPath)
  const size = fs.statSync(srcPath).size
  const { footer, footerStart } = scanFooter(srcPath, size)
  if (!footer) throw new Error('Cadangan tidak lengkap: penanda akhir tidak ditemukan (penulisan terputus).')
  const wanted = footer.entries
  if (!Array.isArray(wanted) || wanted.length === 0) throw new Error('Daftar isi cadangan kosong.')
  const seen = new Set(wanted.map((e) => e.name))
  if (seen.size !== wanted.length) throw new Error('Daftar isi cadangan berisi nama ganda.')
  if (destDir) fs.mkdirSync(destDir, { recursive: true })

  const done: StreamFooterEntry[] = []
  const written: string[] = []
  let pos = bodyStart
  let totalBytes = 0
  try {
    for (const want of wanted) {
      // Entri yang tidak diminta tetap didekripsi dan di-hash, hanya tidak ditulis ke disk.
      const sink = destDir && (!include || include(want.name)) ? destDir : null
      pos = await extractEntry(srcPath, pos, key, sink, header.codec, want, written)
      totalBytes += want.plainSize
      done.push(want)
      onProgress?.(done.length, wanted.length, want.name)
    }
    if (pos !== footerStart) throw new Error('Isi cadangan tidak cocok dengan daftar akhirnya.')
  } catch (err) {
    // Gagal di tengah jalan: jangan meninggalkan hasil pemulihan separuh jadi.
    for (const file of written) fs.rmSync(file, { force: true })
    throw err
  }
  return { entries: done, totalBytes, header }
}

async function extractEntry(
  srcPath: string,
  pos: number,
  key: Buffer,
  destDir: string | null,
  codec: StreamCodec,
  want: StreamFooterEntry,
  writtenFiles: string[],
): Promise<number> {
  if (!Number.isInteger(want.plainSize) || want.plainSize < 0) throw new Error(`Ukuran entri ${want.name} tidak valid.`)
  if (!Number.isInteger(want.storedSize) || want.storedSize < 0) throw new Error(`Ukuran tersimpan entri ${want.name} tidak valid.`)
  const nameLen = readAt(srcPath, pos, 4).readUInt32BE(0)
  if (nameLen < 1 || nameLen > MAX_NAME_BYTES) throw new Error('Nama entri cadangan tidak valid.')
  const name = readAt(srcPath, pos + 4, nameLen).toString('utf8')
  if (name !== want.name) throw new Error(`Urutan entri cadangan tidak cocok: ${name} vs ${want.name}.`)
  const frameEnd = pos + 4 + nameLen
  const iv = readAt(srcPath, frameEnd, IV_BYTES)
  const plainSize = Number(readAt(srcPath, frameEnd + IV_BYTES, 8).readBigUInt64BE(0))
  if (plainSize !== want.plainSize) throw new Error(`Ukuran entri ${name} tidak cocok dengan daftar akhir.`)
  const cipherStart = frameEnd + IV_BYTES + 8
  const tag = readAt(srcPath, cipherStart + want.storedSize, TAG_BYTES)

  const target = destDir ? path.join(destDir, safeName(name)) : null
  if (target) {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    writtenFiles.push(target)
  }
  const hash = crypto.createHash('sha256')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  if (plainSize === 0 && want.storedSize === 0) {
    // Entri kosong: tag tetap harus divalidasi lewat final().
    decipher.final()
    if (target) fs.writeFileSync(target, Buffer.alloc(0))
  } else {
    const input = fs.createReadStream(srcPath, {
      start: cipherStart,
      end: cipherStart + want.storedSize - 1,
      highWaterMark: CHUNK_BYTES,
    })
    const decompress = codec === 'gzip' ? zlib.createGunzip() : new PassThrough()
    // Bila entri tidak ditulis ke disk, output tetap harus dikonsumsi sampai habis; tanpa tahap
    // pembuang, pipeline berhenti begitu buffer baca Transform penuh.
    const tail = target ? fs.createWriteStream(target) : discardStream()
    try {
      await pipeline(input, decipher, decompress, hashingTransform(hash), tail)
    } catch (err) {
      throw new Error(`Kunci salah atau entri ${name} rusak: ${(err as Error).message}`)
    }
    if (target) {
      const written = fs.statSync(target).size
      if (written !== want.plainSize) throw new Error(`Berkas hasil pemulihan ${name} berukuran salah.`)
    }
  }
  if (hash.digest('hex') !== want.sha256) throw new Error(`Checksum entri ${name} tidak cocok.`)
  return cipherStart + want.storedSize + TAG_BYTES
}
