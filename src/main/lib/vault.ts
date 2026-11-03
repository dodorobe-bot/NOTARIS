import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { files, ensureDirs } from './paths'
import { log } from './logger'
import { checkpointDetailed, integrityCheck } from './migrate'
import { disconnectDb } from '../db'
import { beginMaintenance } from './maintenance'
import { backupsInFlight } from './backup'
import { AppError } from './errors'
import {
  decryptFileTo,
  encryptFileTo,
  generateRecoveryCode,
  normalizeMasterPassword,
  normalizeRecoveryCode,
  readVaultMeta,
  unwrapKey,
  wrapKey,
  type VaultMeta,
} from './crypto'

export type VaultStatus = 'SETUP' | 'LOCKED' | 'UNLOCKED' | 'DISABLED' | 'ERROR'

let key: Buffer | null = null
let meta: VaultMeta | null = null
let status: VaultStatus = 'SETUP'
let crashRecovered = false
let lastError: string | null = null
let plaintextRemaining: string[] = []

/**
 * Mengganti berkas tujuan tanpa pernah menghapus salinan lama lebih dulu. Salinan lama dipindahkan
 * ke `.bak`; bila penggantian gagal, salinan itu dikembalikan sehingga vault tidak pernah tertinggal
 * tanpa database terenkripsi yang sah.
 */
function promoteAtomic(tmp: string, dest: string): void {
  const backup = `${dest}.bak`
  const hadDest = fs.existsSync(dest)
  if (hadDest) {
    fs.rmSync(backup, { force: true })
    fs.renameSync(dest, backup)
  }
  try {
    fs.renameSync(tmp, dest)
  } catch (err) {
    if (hadDest && !fs.existsSync(dest)) {
      try {
        fs.renameSync(backup, dest)
      } catch {
        /* salinan lama tetap ada di .bak untuk pemulihan manual */
      }
    }
    throw err
  }
  if (hadDest) fs.rmSync(backup, { force: true })
  try {
    fs.chmodSync(dest, 0o600)
  } catch {
    /* best effort */
  }
}

function writeAtomic(dest: string, data: Buffer): void {
  const tmp = `${dest}.tmp`
  const fd = fs.openSync(tmp, 'w')
  try {
    fs.writeSync(fd, data)
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  promoteAtomic(tmp, dest)
}

function removeDbArtifacts(): string[] {
  const remaining: string[] = []
  for (const p of [files.db(), `${files.db()}-wal`, `${files.db()}-shm`, `${files.db()}-journal`]) {
    try {
      fs.rmSync(p, { force: true })
    } catch (err) {
      log.warn('Gagal menghapus berkas database sementara', String(err))
    }
    if (fs.existsSync(p)) remaining.push(path.basename(p))
  }
  return remaining
}

export function initVault(): void {
  ensureDirs()
  if (process.env.NOTARIS_VAULT === 'off') {
    status = 'DISABLED'
    log.warn('Vault dinonaktifkan melalui NOTARIS_VAULT=off (hanya untuk pengembangan/uji)')
    return
  }
  meta = readVaultMeta(files.vault())
  if (meta) {
    status = 'LOCKED'
    if (fs.existsSync(files.db()) && fs.existsSync(files.dbEnc())) {
      crashRecovered = true
      log.warn('Database plaintext ditemukan bersama vault — mode pemulihan pasca-crash')
    }
  } else if (fs.existsSync(files.vault())) {
    // Vault ada tetapi rusak/tidak terbaca. Menampilkan alur SETUP akan membuat pengguna membuat
    // master password baru yang tidak dapat membuka database lama, jadi aplikasi harus berhenti
    // di layar kesalahan dengan lokasi berkas yang perlu dipulihkan.
    status = 'ERROR'
    lastError = 'Berkas vault.json ada tetapi tidak dapat dibaca. Pulihkan vault.json dari cadangan sebelum melanjutkan; jangan membuat vault baru.'
    log.error('Vault tidak dapat dibaca', files.vault())
  } else {
    status = 'SETUP'
  }
}

export function vaultStatus() {
  return {
    status,
    vaultExists: !!meta,
    dbExists: fs.existsSync(files.db()),
    encryptedExists: fs.existsSync(files.dbEnc()),
    crashRecovered,
    plaintextRemaining,
    error: lastError,
    createdAt: meta?.createdAt ?? null,
  }
}

export function getVaultKey(): Buffer | null {
  return key
}

/** Membuat vault baru. Mengembalikan recovery code (hanya ditampilkan sekali). */
export async function createVault(masterPassword: string): Promise<string> {
  if (meta || fs.existsSync(files.vault())) {
    throw new Error('Vault sudah ada. Gunakan master password yang berlaku.')
  }
  const masterKey = crypto.randomBytes(32)
  const recoveryCode = generateRecoveryCode()
  const master = await wrapKey(masterKey, normalizeMasterPassword(masterPassword))
  const recovery = await wrapKey(masterKey, normalizeRecoveryCode(recoveryCode))
  const newMeta: VaultMeta = {
    version: 1,
    createdAt: new Date().toISOString(),
    master,
    recovery,
  }
  meta = newMeta
  key = masterKey
  status = 'UNLOCKED'
  writeAtomic(files.vault(), Buffer.from(JSON.stringify(newMeta, null, 2), 'utf8'))
  log.info('Vault database dibuat')
  return recoveryCode
}

/**
 * Menyiapkan database plaintext setelah kunci berhasil dibuka. Bila proses
 * sebelumnya berhenti di tengah penulisan, salinan plaintext divalidasi dan
 * salinan terenkripsi dipakai sebagai cadangan yang utuh.
 */
async function recoverPlaintextDatabase(unwrapped: Buffer): Promise<void> {
  const hasPlain = fs.existsSync(files.db())
  const hasEncrypted = fs.existsSync(files.dbEnc())
  if (!hasPlain && !hasEncrypted) {
    throw new Error('Database tidak ditemukan. Pulihkan dari backup terbaru.')
  }

  if (hasPlain) {
    const plainCheck = integrityCheck(files.db())
    if (plainCheck.ok) {
      if (hasEncrypted) {
        crashRecovered = true
        log.warn('Database plaintext utuh ditemukan bersama salinan terenkripsi; memakai plaintext')
      }
      return
    }
    log.error('Database plaintext rusak; mencoba salinan terenkripsi', plainCheck.detail)
    if (!hasEncrypted) {
      throw new Error(`Database rusak (${plainCheck.detail}) dan tidak ada salinan terenkripsi. Pulihkan dari backup terbaru.`)
    }
  }

  const tmp = `${files.db()}.restore`
  fs.rmSync(tmp, { force: true })
  try {
    await decryptFileTo(files.dbEnc(), tmp, unwrapped)
  } catch {
    fs.rmSync(tmp, { force: true })
    throw new Error('Salinan database terenkripsi tidak dapat didekripsi. Pulihkan dari backup terbaru.')
  }
  const check = integrityCheck(tmp)
  if (!check.ok) {
    fs.rmSync(tmp, { force: true })
    throw new Error(`Salinan database terenkripsi juga rusak (${check.detail}). Pulihkan dari backup terbaru.`)
  }
  if (hasPlain) removeDbArtifacts()
  fs.renameSync(tmp, files.db())
  crashRecovered = hasPlain
  log.info(hasPlain ? 'Database plaintext rusak dipulihkan dari salinan terenkripsi' : 'Database didekripsi untuk sesi ini')
}

/**
 * Operasi kunci dan buka dijalankan berurutan. Dua permintaan bersamaan sebelumnya memakai berkas
 * sementara yang sama dan dapat saling menimpa; antrean ini memastikan hanya satu yang berjalan.
 */
let vaultChain: Promise<unknown> = Promise.resolve()

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const run = vaultChain.then(operation, operation)
  vaultChain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

export function unlockVault(secret: string, useRecovery = false): Promise<void> {
  return serialize(() => unlockVaultNow(secret, useRecovery))
}

async function unlockVaultNow(secret: string, useRecovery: boolean): Promise<void> {
  if (status === 'DISABLED' || status === 'UNLOCKED') return
  const m = meta ?? readVaultMeta(files.vault())
  if (!m) throw new Error('Vault belum dibuat')

  let unwrapped: Buffer
  try {
    const normalized = useRecovery ? normalizeRecoveryCode(secret) : normalizeMasterPassword(secret)
    const wrapped = useRecovery ? m.recovery : m.master
    unwrapped = await unwrapKey(wrapped.kdf, wrapped.wrapped, normalized)
    if (unwrapped.length !== 32) throw new Error('Kunci tidak valid')
  } catch {
    lastError = 'Master password atau recovery code salah.'
    status = 'LOCKED'
    log.warn('Unlock vault gagal', lastError)
    throw new Error(lastError)
  }

  const release = beginMaintenance('membuka vault')
  try {
    await recoverPlaintextDatabase(unwrapped)
    meta = m
    key = unwrapped
    status = 'UNLOCKED'
    lastError = null
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err)
    status = 'LOCKED'
    log.error('Kunci benar, tetapi database tidak dapat dibuka', lastError)
    throw new Error(`Kunci benar, tetapi database tidak dapat dibuka: ${lastError}`)
  } finally {
    release()
  }
}

export function lockVault(): Promise<void> {
  return serialize(lockVaultNow)
}

/** Menutup database dan mengenkripsi berkas database ke disk. */
async function lockVaultNow(): Promise<void> {
  if (status !== 'UNLOCKED') return
  if (!key) {
    // Tanpa kunci sesi, enkripsi ulang tidak mungkin; jangan berpura-pura terkunci.
    throw new Error('Vault tidak dapat dikunci karena kunci sesi tidak tersedia. Keluar dari aplikasi lalu buka kembali vault.')
  }
  if (backupsInFlight() > 0) {
    throw new AppError('Backup sedang berjalan. Tunggu hingga selesai sebelum mengunci vault.', 'BUSY')
  }
  // Pemeriksaan di atas dan pengambilan penjaga berjalan tanpa `await`, sehingga tidak ada backup
  // baru yang dapat menyela di antara keduanya.
  const release = beginMaintenance('mengunci vault')
  try {
    try {
      await disconnectDb()
    } catch (err) {
      log.warn('Gagal menutup koneksi database', String(err))
    }
    if (!fs.existsSync(files.db())) {
      status = 'LOCKED'
      key = null
      plaintextRemaining = []
      return
    }
    const checkpoint = checkpointDetailed(files.db())
    if (!checkpoint.ok) {
      // Selama WAL belum tercheckpoint, isi berkas utama belum mencakup transaksi terbaru.
      // Mengenkripsinya sekarang akan menghasilkan salinan yang kehilangan data.
      plaintextRemaining = [path.basename(files.db())]
      lastError = `Vault tidak dikunci: ${checkpoint.detail}`
      log.error('Vault gagal dikunci', lastError)
      throw new Error(lastError)
    }
    // Enkripsi di-stream per blok agar database besar tidak dimuat seluruhnya ke memori. Berkas
    // sementara ditulis lebih dulu; berkas terenkripsi lama baru diganti setelah penulisan selesai.
    const tmpEnc = `${files.dbEnc()}.tmp`
    fs.rmSync(tmpEnc, { force: true })
    try {
      await encryptFileTo(files.db(), tmpEnc, key)
    } catch (err) {
      fs.rmSync(tmpEnc, { force: true })
      plaintextRemaining = [path.basename(files.db())]
      lastError = `Vault tidak dikunci: enkripsi database gagal (${(err as Error).message}).`
      log.error(lastError)
      throw new Error(lastError)
    }
    promoteAtomic(tmpEnc, files.dbEnc())
    const encSize = fs.existsSync(files.dbEnc()) ? fs.statSync(files.dbEnc()).size : 0
    if (encSize === 0) {
      key = null
      plaintextRemaining = [path.basename(files.db())]
      lastError = 'Vault tidak dikunci: salinan terenkripsi tidak tertulis ke disk.'
      log.error(lastError)
      throw new Error(lastError)
    }
    key = null
    status = 'LOCKED'
    crashRecovered = false
    plaintextRemaining = removeDbArtifacts()
    if (plaintextRemaining.length > 0) {
      lastError = `Database sudah terenkripsi, tetapi berkas plaintext masih ada di disk: ${plaintextRemaining.join(', ')}`
      log.error('Vault terkunci dengan berkas plaintext tersisa', lastError)
    } else {
      lastError = null
      log.info('Database terenkripsi dan dikunci')
    }
  } finally {
    release()
  }
}

export async function changeMasterPassword(currentPassword: string, newPassword: string): Promise<void> {
  const m = meta ?? readVaultMeta(files.vault())
  if (!m || !key) throw new Error('Vault harus terbuka untuk mengganti master password')
  const currentKey = await unwrapKey(m.master.kdf, m.master.wrapped, normalizeMasterPassword(currentPassword))
  if (!crypto.timingSafeEqual(currentKey, key)) throw new Error('Master password saat ini salah')
  const master = await wrapKey(key, normalizeMasterPassword(newPassword))
  const updated: VaultMeta = { ...m, master }
  writeAtomic(files.vault(), Buffer.from(JSON.stringify(updated, null, 2), 'utf8'))
  meta = updated
  log.info('Master password diubah')
}

export async function regenerateRecoveryCode(): Promise<string> {
  const m = meta ?? readVaultMeta(files.vault())
  if (!m || !key) throw new Error('Vault harus terbuka')
  const recoveryCode = generateRecoveryCode()
  const recovery = await wrapKey(key, normalizeRecoveryCode(recoveryCode))
  const updated: VaultMeta = { ...m, recovery }
  writeAtomic(files.vault(), Buffer.from(JSON.stringify(updated, null, 2), 'utf8'))
  meta = updated
  return recoveryCode
}

export function markVaultUnlockedForSetup(): void {
  if (status === 'DISABLED') return
}
