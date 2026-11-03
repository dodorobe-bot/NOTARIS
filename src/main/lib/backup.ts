import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { files, dirs } from './paths'
import { log } from './logger'
import { integrityCheck, migrationFiles, snapshotDatabase, tableNames, tableRowCount } from './migrate'
import { sha256 } from './crypto'
import { APP_VERSION } from '../../shared/constants'
import {
  isStreamContainer,
  readContainer,
  readHeader,
  writeContainer,
  type StreamEntrySpec,
  type StreamHeader,
} from './backup-stream'

const BACKUP_MAGIC = Buffer.from('NPBACKUP1')
/** Batas ukuran untuk format lama yang masih memuat seluruh berkas ke memori. */
const MAX_LEGACY_BACKUP_BYTES = 4 * 1024 * 1024 * 1024
/** Batas jumlah berkas dokumen/template agar pengumpulan entri tidak berjalan tanpa batas. */
const MAX_ENTRIES = 200_000
const DB_ENTRY = 'database/notaris_pro.db'
const MANIFEST_ENTRY = 'manifest.json'

export interface BackupManifest {
  appVersion: string
  createdAt: string
  schemaMigration: string
  dbSha256: string
  documentsIncluded: boolean
  counts: Record<string, number>
  tables: string[]
  /** Format wadah cadangan: 2 = streaming (NPBACKUP2), 1 = lama (diisi saat membaca berkas lama). */
  format?: 1 | 2
}

export interface BackupResult {
  filePath: string
  fileName: string
  sizeBytes: number
  checksum: string
  manifest: BackupManifest
}

export interface BackupKeyInfo {
  key: Buffer
  headerPartial: Pick<StreamHeader, 'keySource' | 'kdf'>
}

interface LegacyBackupHeader {
  format: 'NPBACKUP1'
  createdAt: string
  appVersion: string
  keySource: 'vault' | 'passphrase'
  kdf?: { salt: string; memorySize: number; iterations: number; parallelism: number }
  iv: string
  tag: string
  payloadSha256: string
}

function vaultBackupKey(vaultKey: Buffer): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', vaultKey, Buffer.alloc(0), 'notaris-pro-backup-v1', 32))
}

async function keyFromPassphrase(passphrase: string): Promise<BackupKeyInfo> {
  const { deriveKey, ARGON2 } = await import('./crypto')
  const salt = crypto.randomBytes(16)
  const key = await deriveKey(passphrase, salt)
  return {
    key,
    headerPartial: {
      keySource: 'passphrase',
      kdf: { salt: salt.toString('base64'), ...ARGON2 },
    },
  }
}

/** Menurunkan kunci cadangan dari header tanpa peduli format wadah. */
async function resolveKey(
  header: { keySource: 'vault' | 'passphrase'; kdf?: StreamHeader['kdf'] },
  passphrase?: string,
  vaultKey?: Buffer | null,
): Promise<Buffer> {
  if (header.keySource === 'vault') {
    if (!vaultKey) throw new Error('Backup ini terikat ke vault. Buka aplikasi dengan master password untuk memulihkannya.')
    return vaultBackupKey(vaultKey)
  }
  if (!passphrase) throw new Error('Passphrase backup diperlukan.')
  if (!header.kdf) throw new Error('Header backup tidak lengkap.')
  const { deriveKey } = await import('./crypto')
  return deriveKey(passphrase, Buffer.from(header.kdf.salt, 'base64'), {
    memorySize: header.kdf.memorySize,
    iterations: header.kdf.iterations,
    parallelism: header.kdf.parallelism,
    hashLength: 32,
  })
}

export function sha256File(filePath: string): string {
  const hash = crypto.createHash('sha256')
  const fd = fs.openSync(filePath, 'r')
  try {
    const buf = Buffer.alloc(1024 * 1024)
    for (;;) {
      const read = fs.readSync(fd, buf, 0, buf.length, null)
      if (read <= 0) break
      hash.update(buf.subarray(0, read))
    }
  } finally {
    fs.closeSync(fd)
  }
  return hash.digest('hex')
}

function walkFiles(root: string, prefix: string, collected: StreamEntrySpec[]): void {
  if (collected.length >= MAX_ENTRIES) throw new Error(`Terlalu banyak berkas untuk dibackup (batas ${MAX_ENTRIES}).`)
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    const name = `${prefix}/${entry.name.replace(/\\/g, '/')}`
    if (entry.isDirectory()) walkFiles(full, name, collected)
    else if (entry.isFile()) collected.push({ name, sourcePath: full })
  }
}

function collectAssetEntries(includeDocuments: boolean): StreamEntrySpec[] {
  const entries: StreamEntrySpec[] = []
  if (includeDocuments && fs.existsSync(dirs.documents())) walkFiles(dirs.documents(), 'documents', entries)
  if (fs.existsSync(dirs.templates())) walkFiles(dirs.templates(), 'templates', entries)
  return entries
}

function freeBytesOn(dirPath: string): number | null {
  try {
    const stat = fs.statfsSync(dirPath)
    return stat.bavail * stat.bsize
  } catch {
    return null
  }
}

/** Cadangan ditulis tanpa batas memori, tetapi tetap tidak boleh menghabiskan disk. */
function assertFreeSpace(destDir: string, plainBytes: number): void {
  const free = freeBytesOn(destDir)
  if (free === null) return
  const needed = Math.ceil(plainBytes * 1.02) + 64 * 1024 * 1024
  if (free < needed) {
    throw new Error(
      `Ruang tersisa di ${destDir} hanya ${(free / 1024 / 1024).toFixed(0)} MB, padahal cadangan memerlukan sekitar ${(needed / 1024 / 1024).toFixed(0)} MB. Kosongkan disk atau arahkan folder backup ke media lain.`,
    )
  }
}

export function assessBackupLocation(): {
  folder: string
  sameVolumeAsData: boolean
  freeBytes: number | null
  note: string | null
  warnings: string[]
} {
  const folder = dirs.backups()
  const dataRoot = path.parse(dirs.root()).root
  const backupRoot = path.parse(folder).root
  const sameVolume = dataRoot.toLowerCase() === backupRoot.toLowerCase()
  const freeBytes = freeBytesOn(folder)
  const warnings: string[] = []
  if (!sameVolume) warnings.push('Folder backup berada di volume berbeda dengan data aplikasi; pastikan media tersebut selalu tersedia saat backup otomatis dijalankan.')
  if (freeBytes !== null && freeBytes < 2 * 1024 * 1024 * 1024) {
    warnings.push(`Ruang kosong folder backup tinggal ${(freeBytes / 1024 / 1024).toFixed(0)} MB. Cadangan berikutnya dapat gagal.`)
  }
  const note = sameVolume
    ? 'Berkas backup berada di volume yang sama dengan data aplikasi. Salin minimal satu backup ke volume atau media lain secara berkala; kerusakan satu disk akan menghapus data dan backupnya bersamaan.'
    : null
  return { folder, sameVolumeAsData: sameVolume, freeBytes, note, warnings }
}

// ---------- format 1 (lama, hanya untuk berkas yang sudah ada) ----------

export function encryptBackupPayload(zip: Buffer, header: LegacyBackupHeader, key: Buffer): Buffer {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(zip), cipher.final()])
  const h: LegacyBackupHeader = {
    ...header,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    payloadSha256: sha256(zip),
  }
  const headerBuf = Buffer.from(JSON.stringify(h), 'utf8')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(headerBuf.length, 0)
  return Buffer.concat([BACKUP_MAGIC, len, headerBuf, ct])
}

export function parseBackupFile(buf: Buffer): { header: LegacyBackupHeader; ciphertext: Buffer } {
  const magicLen = BACKUP_MAGIC.length
  if (buf.length < magicLen + 4 + 2 || !buf.subarray(0, magicLen).equals(BACKUP_MAGIC)) {
    throw new Error('Berkas bukan backup NOTARIS PRO yang valid.')
  }
  const headerLen = buf.readUInt32BE(magicLen)
  if (headerLen < 2 || headerLen > 1024 * 1024) throw new Error('Header backup rusak.')
  const headerStart = magicLen + 4
  const header = JSON.parse(buf.subarray(headerStart, headerStart + headerLen).toString('utf8')) as LegacyBackupHeader
  return { header, ciphertext: buf.subarray(headerStart + headerLen) }
}

export function decryptBackupPayload(header: LegacyBackupHeader, ciphertext: Buffer, key: Buffer): Buffer {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(header.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(header.tag, 'base64'))
  try {
    const zip = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    if (sha256(zip) !== header.payloadSha256) throw new Error('Checksum backup tidak cocok')
    return zip
  } catch {
    throw new Error('Passphrase salah atau berkas backup rusak.')
  }
}

function safeZipName(name: string): string {
  const normalized = name.replace(/\\/g, '/')
  if (normalized.startsWith('/') || normalized.includes('..') || /^[a-zA-Z]:/.test(normalized)) {
    throw new Error('Backup berisi path yang tidak aman.')
  }
  return normalized
}

function unpackLegacyBackup(buf: Buffer, key: Buffer, destDir: string): BackupManifest {
  const { header, ciphertext } = parseBackupFile(buf)
  const zipBuf = decryptBackupPayload(header, ciphertext, key)
  const zip = new AdmZip(zipBuf)
  for (const entry of zip.getEntries()) {
    const name = safeZipName(entry.entryName)
    if (entry.isDirectory) {
      fs.mkdirSync(path.join(destDir, name), { recursive: true })
      continue
    }
    const target = path.join(destDir, name)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, entry.getData())
  }
  const manifestPath = path.join(destDir, MANIFEST_ENTRY)
  if (!fs.existsSync(manifestPath)) throw new Error('Manifest backup tidak ditemukan.')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as BackupManifest
  return { ...manifest, format: 1 }
}

// ---------- pembuatan ----------

function uniqueTargetPath(stamp: string, type: string): { filePath: string; fileName: string } {
  const baseName = `notarispro-backup-${stamp}-${type.toLowerCase()}`
  let fileName = `${baseName}.npbackup`
  let filePath = path.join(dirs.backups(), fileName)
  for (let n = 2; fs.existsSync(filePath); n++) {
    fileName = `${baseName}-${n}.npbackup`
    filePath = path.join(dirs.backups(), fileName)
  }
  return { filePath, fileName }
}

export async function createBackup(opts: {
  passphrase?: string
  includeDocuments: boolean
  vaultKey?: Buffer | null
  type: 'MANUAL' | 'AUTO' | 'PRE_MIGRATION'
  note?: string
}): Promise<BackupResult> {
  const dbPath = files.db()
  if (!fs.existsSync(dbPath)) throw new Error('Database tidak ditemukan untuk dibackup.')
  fs.mkdirSync(dirs.backups(), { recursive: true })

  const createdAt = new Date()
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notaris-backup-'))
  const partPath = path.join(tempDir, 'container.part')
  let finalPath: string | null = null
  try {
    // Salinan konsisten lewat SQLite Online Backup API: tidak boleh membaca berkas utama
    // sementara WAL aktif, dan tidak menahan isinya di memori.
    const snapPath = path.join(tempDir, 'snapshot.db')
    const snap = await snapshotDatabase(dbPath, snapPath)
    const integrity = integrityCheck(snapPath)
    if (!integrity.ok) {
      throw new Error(`Database tidak lolos integrity_check sebelum dicadangkan: ${integrity.detail}`)
    }

    const tables = tableNames(snapPath)
    const counts: Record<string, number> = {}
    for (const t of ['Client', 'Transaction', 'Deed', 'Document', 'Invoice', 'Payment', 'Expense']) {
      if (tables.includes(t)) counts[t] = tableRowCount(snapPath, t)
    }
    const dbSha256 = sha256File(snapPath)
    const manifest: BackupManifest = {
      appVersion: APP_VERSION,
      createdAt: createdAt.toISOString(),
      schemaMigration: migrationFiles().at(-1) ?? 'none',
      dbSha256,
      documentsIncluded: opts.includeDocuments,
      counts,
      tables,
      format: 2,
    }
    const manifestPath = path.join(tempDir, MANIFEST_ENTRY)
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')

    const entries: StreamEntrySpec[] = [
      { name: MANIFEST_ENTRY, sourcePath: manifestPath },
      { name: DB_ENTRY, sourcePath: snapPath },
      ...collectAssetEntries(opts.includeDocuments),
    ]
    const plainBytes = entries.reduce((sum, e) => sum + fs.statSync(e.sourcePath).size, 0)
    assertFreeSpace(dirs.backups(), plainBytes)

    let keyInfo: BackupKeyInfo
    if (opts.vaultKey) {
      keyInfo = { key: vaultBackupKey(opts.vaultKey), headerPartial: { keySource: 'vault' } }
    } else if (opts.passphrase) {
      keyInfo = await keyFromPassphrase(opts.passphrase)
    } else {
      throw new Error('Passphrase atau vault key diperlukan untuk mengenkripsi backup.')
    }

    const header: StreamHeader = {
      format: 'NPBACKUP2',
      createdAt: manifest.createdAt,
      appVersion: APP_VERSION,
      keySource: keyInfo.headerPartial.keySource,
      kdf: keyInfo.headerPartial.kdf,
      cipher: 'aes-256-gcm',
      codec: 'gzip',
    }
    await writeContainer(partPath, header, entries, keyInfo.key)

    const target = uniqueTargetPath(stampOf(createdAt), opts.type)
    // Verifikasi sebelum berkas final ada: cadangan lama baru boleh dianggap setelah yang ini sah.
    await readContainer(partPath, keyInfo.key, path.join(tempDir, 'verify'), undefined, {
      include: (name) => name === MANIFEST_ENTRY || name.startsWith('database/'),
    })
    const verifiedDb = path.join(tempDir, 'verify', DB_ENTRY)
    const recheck = integrityCheck(verifiedDb)
    if (!recheck.ok) throw new Error(`Hasil baca-ulang cadangan gagal integrity_check: ${recheck.detail}`)
    if (sha256File(verifiedDb) !== manifest.dbSha256) throw new Error('Checksum database hasil baca-ulang tidak cocok.')

    fs.copyFileSync(partPath, target.filePath)
    finalPath = target.filePath
    fs.chmodSync(finalPath, 0o600)
    fs.rmSync(partPath, { force: true })

    const sizeBytes = fs.statSync(finalPath).size
    log.info(`Backup dibuat: ${path.basename(finalPath)} (${sizeBytes} byte, ${opts.type}, metode salinan ${snap.method})`)
    return { filePath: finalPath, fileName: path.basename(finalPath), sizeBytes, checksum: sha256File(finalPath), manifest }
  } catch (err) {
    if (finalPath) fs.rmSync(finalPath, { force: true })
    fs.rmSync(partPath, { force: true })
    throw err
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

function stampOf(d: Date): string {
  return (
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-` +
    `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`
  )
}

// ---------- validasi ----------

export async function validateBackup(
  filePath: string,
  passphrase?: string,
  vaultKey?: Buffer | null,
): Promise<{ ok: boolean; detail: string; manifest?: BackupManifest; tables?: string[] }> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notaris-verify-'))
  try {
    if (!fs.existsSync(filePath)) return { ok: false, detail: 'Berkas backup tidak ditemukan.' }
    if (isStreamContainer(filePath)) {
      const header = readHeader(filePath).header
      const key = await resolveKey(header, passphrase, vaultKey)
      await readContainer(filePath, key, tempDir, undefined, {
        include: (name) => name === MANIFEST_ENTRY || name.startsWith('database/'),
      })
      const manifestPath = path.join(tempDir, MANIFEST_ENTRY)
      if (!fs.existsSync(manifestPath)) return { ok: false, detail: 'Manifest backup tidak ditemukan.' }
      const manifest = { ...(JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as BackupManifest), format: 2 as const }
      const dbPath = path.join(tempDir, DB_ENTRY)
      if (!fs.existsSync(dbPath)) return { ok: false, detail: 'Database tidak ditemukan dalam backup.' }
      if (sha256File(dbPath) !== manifest.dbSha256) return { ok: false, detail: 'Checksum database tidak cocok.' }
      const integrity = integrityCheck(dbPath)
      if (!integrity.ok) return { ok: false, detail: `Integritas database gagal: ${integrity.detail}` }
      return { ok: true, detail: 'Backup valid', manifest, tables: tableNames(dbPath) }
    }

    const stat = fs.statSync(filePath)
    if (stat.size > MAX_LEGACY_BACKUP_BYTES) return { ok: false, detail: 'Berkas backup lama terlalu besar untuk dibaca.' }
    const buf = fs.readFileSync(filePath)
    const { header } = parseBackupFile(buf)
    const key = await resolveKey(header, passphrase, vaultKey)
    const manifest = unpackLegacyBackup(buf, key, tempDir)
    const dbPath = path.join(tempDir, DB_ENTRY)
    if (!fs.existsSync(dbPath)) return { ok: false, detail: 'Database tidak ditemukan dalam backup.' }
    if (sha256File(dbPath) !== manifest.dbSha256) return { ok: false, detail: 'Checksum database tidak cocok.' }
    const integrity = integrityCheck(dbPath)
    if (!integrity.ok) return { ok: false, detail: `Integritas database gagal: ${integrity.detail}` }
    return { ok: true, detail: 'Backup valid', manifest, tables: tableNames(dbPath) }
  } catch (err) {
    return { ok: false, detail: (err as Error).message }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

// ---------- restorasi ----------

export async function restoreBackup(opts: {
  filePath: string
  passphrase?: string
  vaultKey?: Buffer | null
  restoreDocuments?: boolean
}): Promise<{ restoredDatabase: boolean; restoredDocuments: boolean; manifest: BackupManifest }> {
  const check = await validateBackup(opts.filePath, opts.passphrase, opts.vaultKey)
  if (!check.ok || !check.manifest) throw new Error(check.detail)

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notaris-restore-'))
  try {
    if (isStreamContainer(opts.filePath)) {
      const header = readHeader(opts.filePath).header
      const key = await resolveKey(header, opts.passphrase, opts.vaultKey)
      await readContainer(opts.filePath, key, tempDir)
    } else {
      const buf = fs.readFileSync(opts.filePath)
      const { header } = parseBackupFile(buf)
      const key = await resolveKey(header, opts.passphrase, opts.vaultKey)
      unpackLegacyBackup(buf, key, tempDir)
    }

    const restoredDb = path.join(tempDir, DB_ENTRY)
    if (!fs.existsSync(restoredDb)) throw new Error('Database restorasi tidak ditemukan dalam backup.')
    const integrity = integrityCheck(restoredDb)
    if (!integrity.ok) throw new Error(`Database backup rusak: ${integrity.detail}`)

    const current = files.db()
    // Backup pengaman dibuat oleh pemanggil sebelum restorasi; tidak ada salinan plaintext yang ditinggalkan di sini.
    const tmpTarget = `${current}.restoring`
    fs.copyFileSync(restoredDb, tmpTarget)
    fs.rmSync(current, { force: true })
    fs.renameSync(tmpTarget, current)
    for (const suffix of ['-wal', '-shm', '-journal']) fs.rmSync(`${current}${suffix}`, { force: true })

    let restoredDocuments = false
    if ((opts.restoreDocuments ?? check.manifest.documentsIncluded) && fs.existsSync(path.join(tempDir, 'documents'))) {
      copyMerge(path.join(tempDir, 'documents'), dirs.documents())
      restoredDocuments = true
    }
    if (fs.existsSync(path.join(tempDir, 'templates'))) {
      copyMerge(path.join(tempDir, 'templates'), dirs.templates())
    }
    log.info(`Restore selesai dari ${path.basename(opts.filePath)}`)
    return { restoredDatabase: true, restoredDocuments, manifest: check.manifest }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

function copyMerge(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) copyMerge(s, d)
    else fs.copyFileSync(s, d)
  }
}

export function listBackupFiles(): { fileName: string; sizeBytes: number; modifiedAt: string }[] {
  if (!fs.existsSync(dirs.backups())) return []
  return fs
    .readdirSync(dirs.backups())
    .filter((f) => f.endsWith('.npbackup'))
    .map((f) => {
      const stat = fs.statSync(path.join(dirs.backups(), f))
      return { fileName: f, sizeBytes: stat.size, modifiedAt: stat.mtime.toISOString() }
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
}

/**
 * Membuang cadangan otomatis lama. Hanya boleh dipanggil setelah cadangan baru berhasil dibuat
 * dan terverifikasi, dan selalu menyisakan minimal satu berkas.
 */
export function enforceRetention(keepAuto: number): number {
  const keep = Math.max(1, Math.floor(keepAuto) || 1)
  const files = listBackupFiles().filter((f) => f.fileName.includes('-auto'))
  let removed = 0
  for (const f of files.slice(keep)) {
    fs.rmSync(path.join(dirs.backups(), f.fileName), { force: true })
    removed++
  }
  return removed
}

/** Dipakai untuk verifikasi enkripsi di pengujian. */
export function _internalKeys(vaultKey: Buffer): { backupKey: Buffer } {
  return { backupKey: vaultBackupKey(vaultKey) }
}
